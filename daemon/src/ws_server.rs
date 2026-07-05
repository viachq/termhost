use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use termhost_shared::protocol::*;
use tokio::sync::broadcast;
use warp::Filter;
use warp::multipart::FormData;
use futures_util::TryStreamExt;
use std::path::Path;

use crate::DaemonState;

#[derive(serde::Deserialize)]
struct PathQuery {
    path: String,
    #[serde(default)]
    token: Option<String>,
}

#[derive(serde::Deserialize)]
struct TokenQuery {
    #[serde(default)]
    token: Option<String>,
}

#[derive(serde::Deserialize)]
struct UploadQuery {
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    dir: Option<String>,
}

#[derive(serde::Deserialize)]
struct CreateQuery {
    path: String,
    #[serde(default)]
    #[serde(rename = "isDir")]
    is_dir: bool,
    #[serde(default)]
    token: Option<String>,
}

#[derive(serde::Deserialize)]
struct RenameQuery {
    path: String,
    to: String,
    #[serde(default)]
    token: Option<String>,
}

#[derive(serde::Deserialize)]
struct GitFileQuery {
    path: String,
    #[serde(default)]
    file: Option<String>,
    #[serde(default)]
    token: Option<String>,
}

#[derive(serde::Deserialize)]
struct PairPollQuery {
    #[serde(rename = "deviceId")]
    device_id: String,
}

#[derive(serde::Deserialize)]
struct PairActionQuery {
    #[serde(rename = "deviceId")]
    device_id: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    token: Option<String>,
}

#[derive(serde::Deserialize)]
struct RevokeQuery {
    #[serde(rename = "deviceToken")]
    device_token: String,
    #[serde(default)]
    token: Option<String>,
}

fn generate_pair_code() -> String {
    let mut bytes = [0u8; 4];
    let _ = getrandom::getrandom(&mut bytes);
    let n = u32::from_le_bytes(bytes) % 1_000_000;
    format!("{:06}", n)
}

fn generate_device_id() -> String {
    let mut bytes = [0u8; 8];
    let _ = getrandom::getrandom(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub(crate) fn generate_device_token() -> String {
    let mut bytes = [0u8; 16];
    let _ = getrandom::getrandom(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// JSON shape sent to mobile for a terminal, including its canonical PTY grid.
fn term_to_json(
    t: &TerminalInfo,
    sizes: &std::collections::HashMap<String, (u16, u16)>,
) -> serde_json::Value {
    let (cols, rows) = sizes.get(&t.id).copied().unwrap_or((80, 24));
    serde_json::json!({"id": t.id, "label": t.label, "cwd": t.cwd, "cols": cols, "rows": rows})
}

static WS_TERM_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Terminal id for phone-spawned terminals, matching the desktop's
/// `term-<millis>-<n>` shape so ids never collide with app-spawned ones.
fn make_ws_term_id() -> String {
    let n = WS_TERM_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("term-{}-{}", ms, n)
}

#[derive(serde::Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified: Option<i64>,
    // Only set for drive-letter entries in the "This PC" root listing.
    #[serde(skip_serializing_if = "Option::is_none")]
    total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    free_bytes: Option<u64>,
}

#[cfg(target_os = "windows")]
fn disk_space(drive_root: &str) -> Option<(u64, u64)> {
    use std::os::windows::ffi::OsStrExt;
    use winapi::shared::ntdef::ULARGE_INTEGER;
    use winapi::um::fileapi::GetDiskFreeSpaceExW;

    let wide: Vec<u16> = std::ffi::OsStr::new(drive_root)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut free: ULARGE_INTEGER = unsafe { std::mem::zeroed() };
    let mut total: ULARGE_INTEGER = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        GetDiskFreeSpaceExW(wide.as_ptr(), &mut free, &mut total, std::ptr::null_mut())
    };
    if ok == 0 {
        return None;
    }
    unsafe { Some((*total.QuadPart(), *free.QuadPart())) }
}

#[cfg(not(target_os = "windows"))]
fn disk_space(_drive_root: &str) -> Option<(u64, u64)> {
    None
}

fn modified_ms(meta: &std::fs::Metadata) -> Option<i64> {
    meta.modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as i64)
}

pub struct WsServerHandle {
    shutdown_tx: tokio::sync::oneshot::Sender<()>,
}

impl WsServerHandle {
    pub fn shutdown(self) {
        let _ = self.shutdown_tx.send(());
    }
}

pub fn start(port: u16, state: Arc<DaemonState>) -> (WsServerHandle, String) {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();

    // PWA static assets: manifest, service worker, home-screen icons. These live
    // in dist-mobile/ alongside mobile.html (copied there by Vite's publicDir)
    // but — unlike mobile.html — must stay separate fetchable files: a service
    // worker can't be inlined into the single-file bundle, and neither can the
    // manifest if the phone is going to fetch icons relative to it.
    let static_route = warp::path::param().and(warp::path::end()).and(warp::get()).and_then(
        |name: String| async move {
            let content_type = match name.as_str() {
                "manifest.json" => "application/manifest+json",
                "sw.js" => "application/javascript",
                "icon-192.png" | "icon-512.png" => "image/png",
                _ => return Err(warp::reject::not_found()),
            };
            match load_dist_mobile_file(&name) {
                Some(bytes) => Ok(warp::reply::with_header(bytes, "content-type", content_type)),
                None => Err(warp::reject::not_found()),
            }
        },
    );

    // Vite production assets: JS bundle + CSS. Served from dist-mobile/assets/.
    let assets_route = warp::path("assets")
        .and(warp::path::param())
        .and(warp::path::end())
        .and(warp::get())
        .and_then(|name: String| async move {
            let content_type = if name.ends_with(".js") {
                "application/javascript"
            } else if name.ends_with(".css") {
                "text/css"
            } else {
                "application/octet-stream"
            };
            match load_dist_mobile_file(&format!("assets/{}", name)) {
                Some(bytes) => Ok(warp::reply::with_header(bytes, "content-type", content_type)),
                None => Err(warp::reject::not_found()),
            }
        });

    // Inject the shared token into the served HTML so the mobile page
    // can auto-connect without pairing (it's behind Tailscale/tunnel auth
    // already — the shared token adds no extra risk).
    let st = state.clone();
    let html_route = warp::path::end()
        .map(move || {
            let html = load_mobile_html();
            // Strip crossorigin from inline module script (causes silent fail
            // on some headless/browserstack setups for self-served pages).
            let html = html.replace(r#"<script type="module" crossorigin>"#, r#"<script type="module">"#);
            let injected = html.replace(
                "</head>",
                &format!("<script>window.__WS_TOKEN__={:?};</script></head>", st.ws_token)
            );
            // Inline <script type="module"> with </script> inside JS strings
            // (e.g. marked) gets closed by the HTML parser early.  Vite's
            // singlefile plugin already inlines everything, so we keep the
            // module as a regular script and boot it via dynamic import.
            let escaped = injected
                .replace("</script>", "<\\/script>")
                .replace("<\\/script>\n", "</script>\n")
                .replace("<\\/script></head>", "</script></head>");
            warp::reply::with_header(
                warp::reply::html(escaped),
                "cache-control",
                "no-store, no-cache, must-revalidate",
            )
        });

    let st = state.clone();
    let ws_route = warp::path("ws")
        .and(warp::query::<TokenQuery>())
        .and(warp::ws())
        .and_then(move |q: TokenQuery, ws: warp::ws::Ws| {
            let s = st.clone();
            let token = q.token.clone();
            async move {
                if s.is_valid_token(token.as_deref()) {
                    Ok::<_, warp::Rejection>(ws.on_upgrade(move |socket| handle_ws(socket, s, token)))
                } else {
                    Err(warp::reject::not_found())
                }
            }
        });

    let dir_state = state.clone();
    let api_dir = warp::path("api").and(warp::path("dir")).and(warp::path::end())
        .and(warp::get())
        .and(warp::query::<PathQuery>())
        .map(move |q: PathQuery| {
            if !dir_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": "unauthorized"})),
                    warp::http::StatusCode::UNAUTHORIZED,
                );
            }
            // Empty path = "This PC": std::fs::read_dir("") always errors (no such
            // path), so list drive letters instead of trying to browse a directory.
            let mut list: Vec<DirEntry> = if q.path.is_empty() {
                (b'A'..=b'Z')
                    .filter_map(|letter| {
                        let drive = format!("{}:\\", letter as char);
                        std::path::Path::new(&drive).exists().then(|| {
                            let (total_bytes, free_bytes) = match disk_space(&drive) {
                                Some((t, f)) => (Some(t), Some(f)),
                                None => (None, None),
                            };
                            DirEntry {
                                name: format!("{}:", letter as char),
                                path: drive,
                                is_dir: true,
                                size: None,
                                modified: None,
                                total_bytes,
                                free_bytes,
                            }
                        })
                    })
                    .collect()
            } else {
                let entries = match std::fs::read_dir(&q.path) {
                    Ok(e) => e,
                    Err(e) => return warp::reply::with_status(
                        warp::reply::json(&serde_json::json!({"error": e.to_string()})),
                        warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                    ),
                };
                entries
                    .filter_map(|e| e.ok())
                    .map(|e| {
                        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                        let meta = e.metadata().ok();
                        DirEntry {
                            name: e.file_name().to_string_lossy().to_string(),
                            path: e.path().to_string_lossy().to_string(),
                            is_dir,
                            size: meta.as_ref().filter(|_| !is_dir).map(|m| m.len()),
                            modified: meta.as_ref().and_then(modified_ms),
                            total_bytes: None,
                            free_bytes: None,
                        }
                    })
                    .collect()
            };
            list.sort_by(|a, b| {
                if a.is_dir != b.is_dir {
                    b.is_dir.cmp(&a.is_dir)
                } else {
                    a.name.to_lowercase().cmp(&b.name.to_lowercase())
                }
            });
            warp::reply::with_status(
                warp::reply::json(&list),
                warp::http::StatusCode::OK,
            )
        });

    let file_state = state.clone();
    let api_file = warp::path("api").and(warp::path("file")).and(warp::path::end())
        .and(warp::get())
        .and(warp::query::<PathQuery>())
        .map(move |q: PathQuery| {
            if !file_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": "unauthorized"})),
                    warp::http::StatusCode::UNAUTHORIZED,
                );
            }
            let content = match std::fs::read_to_string(&q.path) {
                Ok(c) => c,
                Err(e) => return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": e.to_string()})),
                    warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                ),
            };
            warp::reply::with_status(
                warp::reply::json(&serde_json::json!({"content": content})),
                warp::http::StatusCode::OK,
            )
        });

    let write_state = state.clone();
    let api_file_write = warp::path("api").and(warp::path("file")).and(warp::path::end())
        .and(warp::put())
        .and(warp::query::<PathQuery>())
        .and(warp::body::content_length_limit(10 * 1024 * 1024))
        .and(warp::body::bytes())
        .map(move |q: PathQuery, body| {
            if !write_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": "unauthorized"})),
                    warp::http::StatusCode::UNAUTHORIZED,
                );
            }
            match std::fs::write(&q.path, &body) {
                Ok(_) => warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"ok": true})),
                    warp::http::StatusCode::OK,
                ),
                Err(e) => warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": e.to_string()})),
                    warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                ),
            }
        });

    let raw_state = state.clone();
    let api_raw = warp::path("api").and(warp::path("raw")).and(warp::path::end())
        .and(warp::get())
        .and(warp::query::<PathQuery>())
        .map(move |q: PathQuery| {
            if !raw_state.is_valid_token(q.token.as_deref()) {
                let body = serde_json::json!({"error": "unauthorized"}).to_string();
                let mut res = warp::http::Response::new(warp::hyper::Body::from(body));
                *res.status_mut() = warp::http::StatusCode::UNAUTHORIZED;
                res.headers_mut().insert(
                    warp::http::header::CONTENT_TYPE,
                    warp::http::HeaderValue::from_static("application/json"),
                );
                return res;
            }
            let data = match std::fs::read(&q.path) {
                Ok(d) => d,
                Err(e) => {
                    let err_body = serde_json::json!({"error": e.to_string()}).to_string();
                    let mut res = warp::http::Response::new(warp::hyper::Body::from(err_body));
                    *res.status_mut() = warp::http::StatusCode::INTERNAL_SERVER_ERROR;
                    res.headers_mut().insert(
                        warp::http::header::CONTENT_TYPE,
                        warp::http::HeaderValue::from_static("application/json"),
                    );
                    return res;
                }
            };
            let mime = mime_guess::from_path(Path::new(&q.path)).first_or_octet_stream();
            let mut res = warp::http::Response::new(warp::hyper::Body::from(data));
            res.headers_mut().insert(
                warp::http::header::CONTENT_TYPE,
                warp::http::HeaderValue::from_str(&mime.to_string()).unwrap(),
            );
            res
        });

    let upload_state = state.clone();
    let api_upload = warp::path("api").and(warp::path("upload")).and(warp::path::end())
        .and(warp::post())
        .and(warp::query::<UploadQuery>())
        .and(warp::header::<String>("x-filename"))
        .and(warp::body::bytes())
        .map(move |q: UploadQuery, filename: String, body: bytes::Bytes| {
            if !upload_state.is_valid_token(q.token.as_deref()) {
                let body = serde_json::json!({"error": "unauthorized"}).to_string();
                let mut res = warp::http::Response::new(warp::hyper::Body::from(body));
                *res.status_mut() = warp::http::StatusCode::UNAUTHORIZED;
                res.headers_mut().insert(
                    warp::http::header::CONTENT_TYPE,
                    warp::http::HeaderValue::from_static("application/json"),
                );
                return res;
            }
            let clean_name = std::path::Path::new(&filename)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("upload")
                .to_string();
            let target_dir = q.dir.as_ref()
                .filter(|d| !d.is_empty())
                .map(|d| std::path::PathBuf::from(d))
                .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("C:\\")));
            let target = target_dir.join(&clean_name);
            match std::fs::write(&target, &body) {
                Ok(_) => {
                    let resp = serde_json::json!({"ok": true, "path": target.to_string_lossy()}).to_string();
                    let mut res = warp::http::Response::new(warp::hyper::Body::from(resp));
                    res.headers_mut().insert(
                        warp::http::header::CONTENT_TYPE,
                        warp::http::HeaderValue::from_static("application/json"),
                    );
                    res
                }
                Err(e) => {
                    let resp = serde_json::json!({"error": e.to_string()}).to_string();
                    let mut res = warp::http::Response::new(warp::hyper::Body::from(resp));
                    *res.status_mut() = warp::http::StatusCode::INTERNAL_SERVER_ERROR;
                    res.headers_mut().insert(
                        warp::http::header::CONTENT_TYPE,
                        warp::http::HeaderValue::from_static("application/json"),
                    );
                    res
                }
            }
        });

    let create_state = state.clone();
    let api_fs_create = warp::path("api").and(warp::path("fs")).and(warp::path("create")).and(warp::path::end())
        .and(warp::post())
        .and(warp::query::<CreateQuery>())
        .map(move |q: CreateQuery| {
            if !create_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": "unauthorized"})),
                    warp::http::StatusCode::UNAUTHORIZED,
                );
            }
            let result = if q.is_dir {
                std::fs::create_dir(&q.path)
            } else {
                std::fs::File::create(&q.path).map(|_| ())
            };
            match result {
                Ok(_) => warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"ok": true})),
                    warp::http::StatusCode::OK,
                ),
                Err(e) => warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": e.to_string()})),
                    warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                ),
            }
        });

    let rename_state = state.clone();
    let api_fs_rename = warp::path("api").and(warp::path("fs")).and(warp::path("rename")).and(warp::path::end())
        .and(warp::post())
        .and(warp::query::<RenameQuery>())
        .map(move |q: RenameQuery| {
            if !rename_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": "unauthorized"})),
                    warp::http::StatusCode::UNAUTHORIZED,
                );
            }
            match std::fs::rename(&q.path, &q.to) {
                Ok(_) => warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"ok": true})),
                    warp::http::StatusCode::OK,
                ),
                Err(e) => warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": e.to_string()})),
                    warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                ),
            }
        });

    let delete_state = state.clone();
    let api_fs_delete = warp::path("api").and(warp::path("fs")).and(warp::path("delete")).and(warp::path::end())
        .and(warp::post())
        .and(warp::query::<PathQuery>())
        .map(move |q: PathQuery| {
            if !delete_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": "unauthorized"})),
                    warp::http::StatusCode::UNAUTHORIZED,
                );
            }
            let meta = match std::fs::metadata(&q.path) {
                Ok(m) => m,
                Err(e) => return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": e.to_string()})),
                    warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                ),
            };
            let result = if meta.is_dir() {
                std::fs::remove_dir_all(&q.path)
            } else {
                std::fs::remove_file(&q.path)
            };
            match result {
                Ok(_) => warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"ok": true})),
                    warp::http::StatusCode::OK,
                ),
                Err(e) => warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": e.to_string()})),
                    warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                ),
            }
        });

    let git_status_state = state.clone();
    let api_git_status = warp::path("api").and(warp::path("git")).and(warp::path("status")).and(warp::path::end())
        .and(warp::get())
        .and(warp::query::<PathQuery>())
        .map(move |q: PathQuery| {
            if !git_status_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": "unauthorized"})),
                    warp::http::StatusCode::UNAUTHORIZED,
                );
            }
            let branch_out = std::process::Command::new("git")
                .args(["-C", &q.path, "rev-parse", "--abbrev-ref", "HEAD"])
                .output();
            let branch = match &branch_out {
                Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
                _ => return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": "not a git repository"})),
                    warp::http::StatusCode::OK,
                ),
            };
            let status_out = std::process::Command::new("git")
                .args(["-C", &q.path, "status", "--porcelain"])
                .output();
            let files: Vec<serde_json::Value> = match status_out {
                Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .filter(|l| l.len() > 3)
                    .map(|l| {
                        let code = l[..2].trim().to_string();
                        let name = l[3..].to_string();
                        serde_json::json!({"code": code, "name": name})
                    })
                    .collect(),
                _ => vec![],
            };
            warp::reply::with_status(
                warp::reply::json(&serde_json::json!({"branch": branch, "files": files})),
                warp::http::StatusCode::OK,
            )
        });

    let git_diff_state = state.clone();
    let api_git_diff = warp::path("api").and(warp::path("git")).and(warp::path("diff")).and(warp::path::end())
        .and(warp::get())
        .and(warp::query::<GitFileQuery>())
        .map(move |q: GitFileQuery| {
            if !git_diff_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": "unauthorized"})),
                    warp::http::StatusCode::UNAUTHORIZED,
                );
            }
            let Some(file) = q.file else {
                return warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": "missing file"})),
                    warp::http::StatusCode::BAD_REQUEST,
                );
            };
            let out = std::process::Command::new("git")
                .args(["-C", &q.path, "diff", "HEAD", "--", &file])
                .output();
            match out {
                Ok(o) if o.status.success() || !o.stdout.is_empty() => {
                    let diff = String::from_utf8_lossy(&o.stdout).to_string();
                    warp::reply::with_status(
                        warp::reply::json(&serde_json::json!({"diff": diff})),
                        warp::http::StatusCode::OK,
                    )
                }
                Ok(o) => warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": String::from_utf8_lossy(&o.stderr).to_string()})),
                    warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                ),
                Err(e) => warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({"error": e.to_string()})),
                    warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                ),
            }
        });

    // ── Device pairing: scan-QR-then-approve instead of only the one shared
    // static token. A new device hits /pair/request (no auth — it has no
    // token yet), gets a code + device id, and polls /pair/poll until a
    // human approves it from the desktop (which IS trusted — it authenticates
    // with the existing token) via /pair/pending + /pair/approve.
    let pair_request_state = state.clone();
    let api_pair_request = warp::path("api").and(warp::path("pair")).and(warp::path("request")).and(warp::path::end())
        .and(warp::post())
        .and(warp::header::optional::<String>("User-Agent"))
        .map(move |ua: Option<String>| {
            let device_id = generate_device_id();
            let code = generate_pair_code();
            let auto = *pair_request_state.auto_approve.lock().unwrap();
            if auto {
                let token = generate_device_token();
                let device_type = ua.clone().map(|ua| {
                    let short = if ua.contains("Android") { "Android" }
                        else if ua.contains("iPhone") || ua.contains("iPad") { "iOS" }
                        else if ua.contains("CrOS") { "ChromeOS" }
                        else if ua.contains("Linux") { "Linux" }
                        else if ua.contains("Windows") { "Windows" }
                        else if ua.contains("Mac OS") { "macOS" }
                        else { "Unknown" };
                    let browser = if ua.contains("Chrome") { "Chrome" }
                        else if ua.contains("Firefox") { "Firefox" }
                        else if ua.contains("Safari") { "Safari" }
                        else if ua.contains("Edge") { "Edge" }
                        else { "Browser" };
                    format!("{browser} · {short}")
                });
                let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
                let mut devices = pair_request_state.approved_devices.lock().unwrap();
                devices.push(crate::ApprovedDevice {
                    token: token.clone(), label: "Phone".into(), approved_at: now_ms,
                    last_seen: None, device_type, note: String::new(),
                });
                crate::save_approved_devices(&devices);
                pair_request_state.pending_pairs.lock().unwrap().insert(device_id.clone(), crate::PendingPair {
                    code: code.clone(),
                    requested_at: std::time::Instant::now(),
                    approved_token: Some(token),
                    user_agent: ua,
                });
                warp::reply::json(&serde_json::json!({"deviceId": device_id, "code": code, "autoApproved": true}))
            } else {
                pair_request_state.pending_pairs.lock().unwrap().insert(device_id.clone(), crate::PendingPair {
                    code: code.clone(),
                    requested_at: std::time::Instant::now(),
                    approved_token: None,
                    user_agent: ua,
                });
                warp::reply::json(&serde_json::json!({"deviceId": device_id, "code": code}))
            }
        });

    let pair_poll_state = state.clone();
    let api_pair_poll = warp::path("api").and(warp::path("pair")).and(warp::path("poll")).and(warp::path::end())
        .and(warp::get())
        .and(warp::query::<PairPollQuery>())
        .map(move |q: PairPollQuery| {
            {
                let mut pending = pair_poll_state.pending_pairs.lock().unwrap();
                pending.retain(|_, p| p.requested_at.elapsed().as_secs() < crate::PAIR_EXPIRY_SECS);
            }
            let pending = pair_poll_state.pending_pairs.lock().unwrap();
            match pending.get(&q.device_id) {
                Some(p) if p.approved_token.is_some() => {
                    let token = p.approved_token.clone().unwrap();
                    drop(pending);
                    pair_poll_state.pending_pairs.lock().unwrap().remove(&q.device_id);
                    warp::reply::json(&serde_json::json!({"status": "approved", "token": token}))
                }
                Some(p) => warp::reply::json(&serde_json::json!({"status": "pending", "code": p.code})),
                None => warp::reply::json(&serde_json::json!({"status": "expired"})),
            }
        });

    let pair_pending_state = state.clone();
    let api_pair_pending_list = warp::path("api").and(warp::path("pair")).and(warp::path("pending")).and(warp::path::end())
        .and(warp::get())
        .and(warp::query::<TokenQuery>())
        .map(move |q: TokenQuery| {
            if !pair_pending_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(warp::reply::json(&serde_json::json!({"error":"unauthorized"})), warp::http::StatusCode::UNAUTHORIZED);
            }
            let mut pending = pair_pending_state.pending_pairs.lock().unwrap();
            pending.retain(|_, p| p.requested_at.elapsed().as_secs() < crate::PAIR_EXPIRY_SECS);
            let list: Vec<serde_json::Value> = pending.iter()
                .filter(|(_, p)| p.approved_token.is_none())
                .map(|(id, p)| serde_json::json!({"deviceId": id, "code": p.code}))
                .collect();
            warp::reply::with_status(warp::reply::json(&list), warp::http::StatusCode::OK)
        });

    let pair_approve_state = state.clone();
    let api_pair_approve = warp::path("api").and(warp::path("pair")).and(warp::path("approve")).and(warp::path::end())
        .and(warp::post())
        .and(warp::query::<PairActionQuery>())
        .map(move |q: PairActionQuery| {
            if !pair_approve_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(warp::reply::json(&serde_json::json!({"error":"unauthorized"})), warp::http::StatusCode::UNAUTHORIZED);
            }
            let new_token = generate_device_token();
            let label = q.label.unwrap_or_else(|| "Phone".to_string());
            let device_type = pair_approve_state.pending_pairs.lock().unwrap().get(&q.device_id)
                .and_then(|p| p.user_agent.clone())
                .map(|ua| {
                    let short = if ua.contains("Android") { "Android" }
                        else if ua.contains("iPhone") || ua.contains("iPad") { "iOS" }
                        else if ua.contains("CrOS") { "ChromeOS" }
                        else if ua.contains("Linux") { "Linux" }
                        else if ua.contains("Windows") { "Windows" }
                        else if ua.contains("Mac OS") { "macOS" }
                        else { "Unknown" };
                    let browser = if ua.contains("Chrome") { "Chrome" }
                        else if ua.contains("Firefox") { "Firefox" }
                        else if ua.contains("Safari") { "Safari" }
                        else if ua.contains("Edge") { "Edge" }
                        else { "Browser" };
                    format!("{browser} · {short}")
                });
            {
                let mut pending = pair_approve_state.pending_pairs.lock().unwrap();
                match pending.get_mut(&q.device_id) {
                    Some(p) => p.approved_token = Some(new_token.clone()),
                    None => return warp::reply::with_status(
                        warp::reply::json(&serde_json::json!({"error": "not found or expired"})),
                        warp::http::StatusCode::NOT_FOUND,
                    ),
                }
            }
            let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
            let mut devices = pair_approve_state.approved_devices.lock().unwrap();
            devices.push(crate::ApprovedDevice { token: new_token, label, approved_at: now_ms, last_seen: None, device_type, note: String::new() });
            crate::save_approved_devices(&devices);
            warp::reply::with_status(warp::reply::json(&serde_json::json!({"ok": true})), warp::http::StatusCode::OK)
        });

    let pair_reject_state = state.clone();
    let api_pair_reject = warp::path("api").and(warp::path("pair")).and(warp::path("reject")).and(warp::path::end())
        .and(warp::post())
        .and(warp::query::<PairActionQuery>())
        .map(move |q: PairActionQuery| {
            if !pair_reject_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(warp::reply::json(&serde_json::json!({"error":"unauthorized"})), warp::http::StatusCode::UNAUTHORIZED);
            }
            pair_reject_state.pending_pairs.lock().unwrap().remove(&q.device_id);
            warp::reply::with_status(warp::reply::json(&serde_json::json!({"ok": true})), warp::http::StatusCode::OK)
        });

    let devices_list_state = state.clone();
    let api_devices_list = warp::path("api").and(warp::path("devices")).and(warp::path::end())
        .and(warp::get())
        .and(warp::query::<TokenQuery>())
        .map(move |q: TokenQuery| {
            if !devices_list_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(warp::reply::json(&serde_json::json!({"error":"unauthorized"})), warp::http::StatusCode::UNAUTHORIZED);
            }
            let devices = devices_list_state.approved_devices.lock().unwrap();
            let connected = devices_list_state.connected_devices.lock().unwrap();
            let list: Vec<serde_json::Value> = devices.iter().map(|d| serde_json::json!({
                "label": d.label,
                "approvedAt": d.approved_at,
                "deviceToken": d.token,
                "lastSeen": d.last_seen,
                "deviceType": d.device_type,
                "note": d.note,
                "online": connected.contains(&d.token),
            })).collect();
            warp::reply::with_status(warp::reply::json(&list), warp::http::StatusCode::OK)
        });

    let devices_revoke_state = state.clone();
    let api_devices_revoke = warp::path("api").and(warp::path("devices")).and(warp::path("revoke")).and(warp::path::end())
        .and(warp::post())
        .and(warp::query::<RevokeQuery>())
        .map(move |q: RevokeQuery| {
            if !devices_revoke_state.is_valid_token(q.token.as_deref()) {
                return warp::reply::with_status(warp::reply::json(&serde_json::json!({"error":"unauthorized"})), warp::http::StatusCode::UNAUTHORIZED);
            }
            let mut devices = devices_revoke_state.approved_devices.lock().unwrap();
            devices.retain(|d| d.token != q.device_token);
            crate::save_approved_devices(&devices);
            warp::reply::with_status(warp::reply::json(&serde_json::json!({"ok": true})), warp::http::StatusCode::OK)
        });

    let routes = html_route
        .or(assets_route)
        .or(static_route)
        .or(ws_route)
        .or(api_dir)
        .or(api_file)
        .or(api_file_write)
        .or(api_raw)
        .or(api_upload)
        .or(api_fs_create)
        .or(api_fs_rename)
        .or(api_fs_delete)
        .or(api_git_status)
        .or(api_git_diff)
        .or(api_pair_request)
        .or(api_pair_poll)
        .or(api_pair_pending_list)
        .or(api_pair_approve)
        .or(api_pair_reject)
        .or(api_devices_list)
        .or(api_devices_revoke);

    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST"])
        .allow_headers(vec!["content-type"]);

    let (_, server) = warp::serve(routes.with(cors))
        .bind_with_graceful_shutdown(([0, 0, 0, 0], port), async {
            let _ = shutdown_rx.await;
        });

    tokio::spawn(server);

    let ip = get_local_ip();
    let addr = format!("{}:{}", ip, port);
    (WsServerHandle { shutdown_tx }, addr)
}

async fn handle_ws(ws: warp::ws::WebSocket, state: Arc<DaemonState>, token: Option<String>) {
    // Track this device as connected
    if let Some(ref t) = token {
        state.connected_devices.lock().unwrap().insert(t.clone());
    }

    let (mut ws_tx, mut ws_rx) = ws.split();

    let allowed_ids = state.remote_allowed.lock().unwrap().clone();
    let infos_msg = {
        let infos = state.terminal_infos.lock().unwrap();
        let sizes = state.terminal_sizes.lock().unwrap();
        let simple: Vec<serde_json::Value> = infos.iter()
            .filter(|t| allowed_ids.contains(&t.id))
            .map(|t| term_to_json(t, &sizes)).collect();
        serde_json::json!({"type": "terminals", "data": simple}).to_string()
    };
    drop(allowed_ids);
    let _ = ws_tx.send(warp::ws::Message::text(infos_msg)).await;

    let mut broadcast_rx = state.broadcast_tx.subscribe();
    let ws_tx = Arc::new(tokio::sync::Mutex::new(ws_tx));
    let ws_tx2 = ws_tx.clone();
    let state_for_fwd = state.clone();

    let fwd = tokio::spawn(async move {
        loop {
            match broadcast_rx.recv().await {
                Ok(crate::BroadcastMsg::TerminalOutput { id, data }) => {
                    let msg = serde_json::json!({"type":"output","id":id,"data":data});
                    let mut tx = ws_tx2.lock().await;
                    if tx.send(warp::ws::Message::text(msg.to_string())).await.is_err() {
                        break;
                    }
                }
                Ok(crate::BroadcastMsg::TerminalResized { id, cols, rows }) => {
                    let msg = serde_json::json!({"type":"resize","id":id,"cols":cols,"rows":rows});
                    let mut tx = ws_tx2.lock().await;
                    if tx.send(warp::ws::Message::text(msg.to_string())).await.is_err() {
                        break;
                    }
                }
                Ok(crate::BroadcastMsg::ShowWindow) => {
                    // Not relevant for WS clients
                }
                Ok(crate::BroadcastMsg::TerminalsChanged) => {
                    let list_msg = {
                        let infos = state_for_fwd.terminal_infos.lock().unwrap();
                        let sizes = state_for_fwd.terminal_sizes.lock().unwrap();
                        let allowed = state_for_fwd.remote_allowed.lock().unwrap();
                        let simple: Vec<serde_json::Value> = infos.iter()
                            .filter(|t| allowed.contains(&t.id))
                            .map(|t| term_to_json(t, &sizes)).collect();
                        serde_json::json!({"type":"terminals","data":simple}).to_string()
                    };
                    let mut tx = ws_tx2.lock().await;
                    let _ = tx.send(warp::ws::Message::text(list_msg)).await;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    });

    // ── Screen stream state ──
    let (stream_frame_tx, mut stream_frame_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
    let mut stream_handle: Option<crate::screen_capture::StreamHandle> = None;

    // Forward JPEG frames from the capture thread to the WebSocket
    let ws_tx_for_stream = ws_tx.clone();
    tokio::spawn(async move {
        while let Some(jpeg) = stream_frame_rx.recv().await {
            let mut tx = ws_tx_for_stream.lock().await;
            if tx.send(warp::ws::Message::binary(jpeg)).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = ws_rx.next().await {
        if let Ok(text) = msg.to_str() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(text) {
                match v["type"].as_str() {
                    Some("clipboard") => {
                        if let Some(text) = v["data"].as_str() {
                            let ok = arboard::Clipboard::new().and_then(|mut cb| cb.set_text(text)).is_ok();
                            let ack = serde_json::json!({"type":"clipboard_ok","ok":ok}).to_string();
                            let mut tx = ws_tx.lock().await;
                            let _ = tx.send(warp::ws::Message::text(ack)).await;
                        }
                    }
                    Some("clipboard_image") => {
                        // Phone sends a photo (base64). Decode → RGBA → set the PC clipboard
                        // image, so the user pastes it into Claude Code with Alt+V.
                        let result: Result<(), String> = (|| {
                            let b64 = v["data"].as_str().ok_or("no data")?;
                            let raw = base64::engine::general_purpose::STANDARD
                                .decode(b64)
                                .map_err(|e| format!("b64: {e}"))?;
                            let rgba = image::load_from_memory(&raw)
                                .map_err(|e| format!("decode: {e}"))?
                                .to_rgba8();
                            let (w, h) = rgba.dimensions();
                            let data = arboard::ImageData {
                                width: w as usize,
                                height: h as usize,
                                bytes: std::borrow::Cow::from(rgba.into_raw()),
                            };
                            arboard::Clipboard::new()
                                .and_then(|mut c| c.set_image(data))
                                .map_err(|e| format!("clipboard: {e}"))?;
                            Ok(())
                        })();
                        let (ok, err) = match &result {
                            Ok(_) => (true, String::new()),
                            Err(e) => (false, e.clone()),
                        };
                        let ack = serde_json::json!({"type":"clipboard_ok","ok":ok,"image":true,"err":err}).to_string();
                        let mut tx = ws_tx.lock().await;
                        let _ = tx.send(warp::ws::Message::text(ack)).await;
                    }
                    Some("input") => {
                        if let Some(id) = v["id"].as_str() {
                            state.active_clients.lock().unwrap().insert(id.to_string(), "ws".to_string());
                            if let Some(data) = v["data"].as_str() {
                                state.pty().write(id, data);
                            }
                        }
                    }
                    Some("resize") => {
                        // Phone wants to resize the PTY — ignored. The PTY has a fixed
                        // canonical size set by the desktop. The phone's xterm renders
                        // at that size and CSS-scales to fit its container.
                    }
                    Some("get_buffer") => {
                        if let Some(id) = v["id"].as_str() {
                            let data = state.buffer_manager.lock().unwrap().get_data(id);
                            if let Some(data) = data {
                                let buf_msg = serde_json::json!({"type":"buffer","id":id,"data":data}).to_string();
                                let mut tx = ws_tx.lock().await;
                                let _ = tx.send(warp::ws::Message::text(buf_msg)).await;
                            }
                        }
                    }
                    Some("get_screen") => {
                        // Clean current-screen snapshot (vt100), for painting a freshly
                        // attached client without replaying scrolled-off history.
                        if let Some(id) = v["id"].as_str() {
                            let snap = state.screen_manager.lock().unwrap().snapshot(id);
                            if let Some(data) = snap {
                                let msg = serde_json::json!({"type":"screen","id":id,"data":data}).to_string();
                                let mut tx = ws_tx.lock().await;
                                let _ = tx.send(warp::ws::Message::text(msg)).await;
                            }
                        }
                    }
                    Some("list") => {
                        let list_msg = {
                            let infos = state.terminal_infos.lock().unwrap();
                            let sizes = state.terminal_sizes.lock().unwrap();
                            let allowed = state.remote_allowed.lock().unwrap();
                            let simple: Vec<serde_json::Value> = infos.iter()
                                .filter(|t| allowed.contains(&t.id))
                                .map(|t| term_to_json(t, &sizes)).collect();
                            serde_json::json!({"type":"terminals","data":simple}).to_string()
                        };
                        let mut tx = ws_tx.lock().await;
                        let _ = tx.send(warp::ws::Message::text(list_msg)).await;
                    }
                    Some("ping") => {
                        let ts = v["ts"].as_i64().unwrap_or(0);
                        let pong = serde_json::json!({"type":"pong","ts":ts}).to_string();
                        let mut tx = ws_tx.lock().await;
                        let _ = tx.send(warp::ws::Message::text(pong)).await;
                    }
                    Some("type_global") => {
                        // System-wide keystroke injection (SendInput) — types
                        // wherever Windows currently has focus, not tied to any
                        // terminal's PTY. Runs on a blocking thread since it's a
                        // synchronous FFI call, not async I/O.
                        if let Some(text) = v["text"].as_str().map(|s| s.to_string()) {
                            tokio::task::spawn_blocking(move || crate::hid::type_text(&text));
                        }
                    }
                    Some("key_global") => {
                        // Named special key/Ctrl-combo (Esc/Tab/arrows/Ctrl+C..) —
                        // the "PC (anywhere)" quick-key row's counterpart to
                        // type_global, for keys plain text can't express.
                        if let Some(key) = v["key"].as_str().map(|s| s.to_string()) {
                            tokio::task::spawn_blocking(move || crate::hid::send_key(&key));
                        }
                    }
                    Some("inject_file") => {
                        // Phone uploaded a file and wants its path written straight
                        // into a specific terminal's stdin so the agent (Claude Code,
                        // Codex, etc.) sees a usable file reference instead of relying
                        // on the clipboard + manual paste.
                        if let (Some(id), Some(path)) = (v["id"].as_str(), v["path"].as_str()) {
                            state.pty().write(id, &format!("{}\n", path));
                        }
                    }
                    Some("screen_stream") => {
                        let action = v["action"].as_str().unwrap_or("");
                        match action {
                            "start" if stream_handle.is_none() => {
                                        let tx_clone = stream_frame_tx.clone();
                                        let handle = crate::screen_capture::start(tx_clone);
                                        stream_handle = Some(handle);
                                    }
                            "stop" => {
                                if let Some(h) = stream_handle.take() {
                                    h.stop();
                                }
                            }
                            _ => {}
                        }
                    }
                    Some("mouse_move") => {
                        if let (Some(x), Some(y)) = (v["x"].as_u64(), v["y"].as_u64()) {
                            // Scale from 0..<phoneWidth> to 0..65535 (MOUSEEVENTF_ABSOLUTE)
                            let sx = (x as u64).min(65535) as u32;
                            let sy = (y as u64).min(65535) as u32;
                            crate::hid::mouse_move(sx, sy);
                        }
                    }
                    Some("mouse_down") => {
                        let btn = v["button"].as_str().unwrap_or("left");
                        match btn {
                            "left" => crate::hid::mouse_left(true),
                            "right" => crate::hid::mouse_right(true),
                            _ => {}
                        }
                    }
                    Some("mouse_up") => {
                        let btn = v["button"].as_str().unwrap_or("left");
                        match btn {
                            "left" => crate::hid::mouse_left(false),
                            "right" => crate::hid::mouse_right(false),
                            _ => {}
                        }
                    }
                    Some("list_workspaces") => {
                        let ws_msg = {
                            let ws_data = state.workspace_data.lock().unwrap();
                            let infos = state.terminal_infos.lock().unwrap();
                            let ws_list: Vec<WorkspaceInfo> = ws_data.iter().map(|w| {
                                let count = w.terminal_ids.iter()
                                    .filter(|tid| infos.iter().any(|t| &t.id == *tid))
                                    .count();
                                WorkspaceInfo {
                                    name: w.name.clone(),
                                    color: w.color,
                                    terminal_count: count,
                                }
                            }).collect();
                            let active_idx = 0usize;
                            serde_json::json!({"type":"workspaces","data":ws_list,"activeIdx":active_idx}).to_string()
                        };
                        let mut tx = ws_tx.lock().await;
                        let _ = tx.send(warp::ws::Message::text(ws_msg)).await;
                    }
                    Some("switch_workspace") => {
                        if let Some(idx) = v["idx"].as_u64() {
                            let terminals_msg = {
                                let ws_data = state.workspace_data.lock().unwrap();
                                let infos = state.terminal_infos.lock().unwrap();
                                let sizes = state.terminal_sizes.lock().unwrap();
                                let allowed = state.remote_allowed.lock().unwrap();
                                if let Some(ws) = ws_data.get(idx as usize) {
                                    let filtered: Vec<serde_json::Value> = infos.iter()
                                        .filter(|t| ws.terminal_ids.contains(&t.id) && allowed.contains(&t.id))
                                        .map(|t| term_to_json(t, &sizes))
                                        .collect();
                                    serde_json::json!({"type":"terminals","data":filtered}).to_string()
                                } else {
                                    serde_json::json!({"type":"terminals","data":[]}).to_string()
                                }
                            };
                            let mut tx = ws_tx.lock().await;
                            let _ = tx.send(warp::ws::Message::text(terminals_msg)).await;
                        }
                    }
                    Some("create_workspace") => {
                        let ws_msg = {
                            if let (Some(name), Some(color)) = (v["name"].as_str(), v["color"].as_u64()) {
                                let mut ws_data = state.workspace_data.lock().unwrap();
                                ws_data.push(WorkspaceData {
                                    name: name.to_string(),
                                    color: color as u8,
                                    terminal_ids: Vec::new(),
                                });
                                let infos = state.terminal_infos.lock().unwrap();
                                let ws_list: Vec<WorkspaceInfo> = ws_data.iter().map(|w| {
                                    let count = w.terminal_ids.iter()
                                        .filter(|tid| infos.iter().any(|t| &t.id == *tid))
                                        .count();
                                    WorkspaceInfo { name: w.name.clone(), color: w.color, terminal_count: count }
                                }).collect();
                                let active = ws_data.len() - 1;
                                Some(serde_json::json!({"type":"workspaces","data":ws_list,"activeIdx":active}).to_string())
                            } else { None }
                        };
                        if let Some(msg_str) = ws_msg {
                            let mut tx = ws_tx.lock().await;
                            let _ = tx.send(warp::ws::Message::text(msg_str)).await;
                        }
                    }
                    Some("delete_workspace") => {
                        let ws_msg = {
                            if let Some(idx) = v["idx"].as_u64() {
                                let mut ws_data = state.workspace_data.lock().unwrap();
                                if ws_data.len() > 1 && (idx as usize) < ws_data.len() {
                                    ws_data.remove(idx as usize);
                                    let infos = state.terminal_infos.lock().unwrap();
                                    let ws_list: Vec<WorkspaceInfo> = ws_data.iter().map(|w| {
                                        let count = w.terminal_ids.iter()
                                            .filter(|tid| infos.iter().any(|t| &t.id == *tid))
                                            .count();
                                        WorkspaceInfo { name: w.name.clone(), color: w.color, terminal_count: count }
                                    }).collect();
                                    Some(serde_json::json!({"type":"workspaces","data":ws_list,"activeIdx":0}).to_string())
                                } else { None }
                            } else { None }
                        };
                        if let Some(msg_str) = ws_msg {
                            let mut tx = ws_tx.lock().await;
                            let _ = tx.send(warp::ws::Message::text(msg_str)).await;
                        }
                    }
                    Some("spawn") => {
                        // Phone creates a NEW PTY on the PC, added to the active workspace.
                        let ws_idx = v["wsIdx"].as_u64().unwrap_or(0) as usize;
                        let cols = v["cols"].as_u64().unwrap_or(80) as u16;
                        let rows = v["rows"].as_u64().unwrap_or(24) as u16;
                        let command: Option<String> = v["shell"].as_str()
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string());
                        let resolved_cwd = v["cwd"].as_str()
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| dirs::home_dir()
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_else(|| "C:\\".to_string()));

                        let id = make_ws_term_id();
                        let dup = state.terminal_infos.lock().unwrap().iter().any(|t| t.id == id);
                        if !dup {
                            let label = match &command {
                                Some(c) => c.chars().take(30).collect::<String>(),
                                None => format!("PS: {}", resolved_cwd
                                    .rsplit(['\\', '/']).find(|s| !s.is_empty()).unwrap_or("shell")),
                            };
                            state.terminal_infos.lock().unwrap().push(TerminalInfo {
                                id: id.clone(),
                                label,
                                cwd: resolved_cwd.clone(),
                                command: command.clone().unwrap_or_default(),
                                title: String::new(),
                                workspace: String::new(),
                                allow_remote: false,
                            });
                            state.remote_allowed.lock().unwrap().insert(id.clone());
                            let _ = state.broadcast_tx.send(crate::BroadcastMsg::TerminalsChanged);
                            state.terminal_sizes.lock().unwrap().insert(id.clone(), (cols, rows));
                            // Assign to the requested workspace if one exists (clamp to 0);
                            // tolerate a daemon with no workspaces yet (assigned = None).
                            let assigned: Option<usize> = {
                                let mut ws_data = state.workspace_data.lock().unwrap();
                                let target = if ws_data.is_empty() {
                                    None
                                } else if ws_idx < ws_data.len() {
                                    Some(ws_idx)
                                } else {
                                    Some(0)
                                };
                                if let Some(ti) = target {
                                    ws_data[ti].terminal_ids.push(id.clone());
                                }
                                target
                            };
                            state.buffer_manager.lock().unwrap().create(&id);
                            state.screen_manager.lock().unwrap().create(&id, rows, cols);
                            let ok = match state.pty().spawn(&id, &resolved_cwd, command.as_deref(), cols, rows).await {
                                Ok(()) => {
                                    state.activity.notify_one();
                                    true
                                }
                                Err(_) => {
                                    // Roll back all bookkeeping so a failed spawn leaves no ghost.
                                    state.terminal_infos.lock().unwrap().retain(|t| t.id != id);
                                    state.terminal_sizes.lock().unwrap().remove(&id);
                                    state.buffer_manager.lock().unwrap().remove(&id);
                                    state.screen_manager.lock().unwrap().remove(&id);
                                    if let Some(ti) = assigned {
                                        if let Some(w) = state.workspace_data.lock().unwrap().get_mut(ti) {
                                            w.terminal_ids.retain(|tid| tid != &id);
                                        }
                                    }
                                    false
                                }
                            };
                            if ok {
                                // Refresh the spawning client's tab list: workspace-filtered when
                                // assigned, otherwise all terminals (no workspaces yet).
                                let list_msg = {
                                    let ws_data = state.workspace_data.lock().unwrap();
                                    let infos = state.terminal_infos.lock().unwrap();
                                    let sizes = state.terminal_sizes.lock().unwrap();
                                    let allowed = state.remote_allowed.lock().unwrap();
                                    let simple: Vec<serde_json::Value> = match assigned {
                                        Some(ti) => {
                                            let ids = ws_data.get(ti).map(|w| w.terminal_ids.clone()).unwrap_or_default();
                                            infos.iter().filter(|t| ids.contains(&t.id) && allowed.contains(&t.id))
                                                .map(|t| term_to_json(t, &sizes)).collect()
                                        }
                                        None => infos.iter().filter(|t| allowed.contains(&t.id))
                                            .map(|t| term_to_json(t, &sizes)).collect(),
                                    };
                                    serde_json::json!({"type":"terminals","data":simple}).to_string()
                                };
                                let mut tx = ws_tx.lock().await;
                                let _ = tx.send(warp::ws::Message::text(list_msg)).await;
                            }
                        }
                    }
                    Some("kill") => {
                        if let Some(id) = v["id"].as_str() {
                            let _ = state.pty().kill(id).await;
                            state.buffer_manager.lock().unwrap().remove(id);
                            state.screen_manager.lock().unwrap().remove(id);
                            state.terminal_infos.lock().unwrap().retain(|t| t.id != id);
                            let _ = state.broadcast_tx.send(crate::BroadcastMsg::TerminalsChanged);
                            state.terminal_sizes.lock().unwrap().remove(id);
                            state.remote_allowed.lock().unwrap().remove(id);
                            for w in state.workspace_data.lock().unwrap().iter_mut() {
                                w.terminal_ids.retain(|tid| tid != id);
                            }
                            state.active_clients.lock().unwrap().remove(id);

                            let list_msg = {
                                let infos = state.terminal_infos.lock().unwrap();
                                let sizes = state.terminal_sizes.lock().unwrap();
                                let allowed = state.remote_allowed.lock().unwrap();
                                let simple: Vec<serde_json::Value> = infos.iter()
                                    .filter(|t| allowed.contains(&t.id))
                                    .map(|t| term_to_json(t, &sizes)).collect();
                                serde_json::json!({"type":"terminals","data":simple}).to_string()
                            };
                            let mut tx = ws_tx.lock().await;
                            let _ = tx.send(warp::ws::Message::text(list_msg)).await;
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    // Remove from connected devices and update last_seen
    if let Some(ref t) = token {
        state.connected_devices.lock().unwrap().remove(t);
        let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
        let mut devices = state.approved_devices.lock().unwrap();
        if let Some(d) = devices.iter_mut().find(|d| d.token == *t) {
            d.last_seen = Some(now_ms);
        }
        crate::save_approved_devices(&devices);
    }

    fwd.abort();
}

pub fn get_local_ip_pub() -> String {
    get_local_ip()
}

/// Loads the mobile client HTML. In debug builds it reads the freshly-built bundle
/// at the project root (independent of CWD), so `npm run mobile:build` + refresh on
/// the phone is enough — no daemon rebuild. In release it reads the copy shipped next
/// to the exe (then CWD as a fallback).
fn load_mobile_html() -> String {
    #[cfg(debug_assertions)]
    {
        let dev = concat!(env!("CARGO_MANIFEST_DIR"), "/../dist-mobile/mobile.html");
        if let Ok(html) = std::fs::read_to_string(dev) {
            return html;
        }
    }
    std::fs::read_to_string("dist-mobile/mobile.html")
        .or_else(|_| {
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()));
            match exe_dir {
                Some(dir) => std::fs::read_to_string(dir.join("dist-mobile/mobile.html")),
                None => Err(std::io::Error::new(std::io::ErrorKind::NotFound, "not found")),
            }
        })
        .unwrap_or_else(|_| "<h1>mobile.html not found — run mobile:build</h1>".into())
}

/// Same resolution order as `load_mobile_html`, generalized to any file that
/// Vite's publicDir copies into dist-mobile/ (manifest, service worker, icons).
fn load_dist_mobile_file(name: &str) -> Option<Vec<u8>> {
    #[cfg(debug_assertions)]
    {
        let dev = format!(concat!(env!("CARGO_MANIFEST_DIR"), "/../dist-mobile/{}"), name);
        if let Ok(bytes) = std::fs::read(&dev) {
            return Some(bytes);
        }
    }
    std::fs::read(format!("dist-mobile/{}", name)).ok().or_else(|| {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .and_then(|dir| std::fs::read(dir.join("dist-mobile").join(name)).ok())
    })
}

/// All addresses a phone can use to reach this PC, Tailscale first (so it sorts
/// above LAN in the UI). Falls back to the single outbound IP if enumeration fails.
pub fn get_local_ips() -> Vec<String> {
    let mut tailscale = Vec::new();
    let mut lan = Vec::new();
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if iface.is_loopback() {
                continue;
            }
            if let std::net::IpAddr::V4(v4) = iface.ip() {
                let o = v4.octets();
                // skip link-local 169.254.0.0/16
                if o[0] == 169 && o[1] == 254 {
                    continue;
                }
                // Tailscale CGNAT range 100.64.0.0/10
                if o[0] == 100 && (o[1] & 0xC0) == 0x40 {
                    tailscale.push(v4.to_string());
                } else if o[0] == 10
                    || (o[0] == 172 && (16..=31).contains(&o[1]))
                    || (o[0] == 192 && o[1] == 168)
                {
                    lan.push(v4.to_string());
                }
            }
        }
    }
    tailscale.extend(lan);
    if tailscale.is_empty() {
        tailscale.push(get_local_ip());
    }
    tailscale
}

fn get_local_ip() -> String {
    use std::net::UdpSocket;
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".into())
}
