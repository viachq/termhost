use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::io::Write;
use std::os::unix::prelude::*;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;

use futures_util::{SinkExt, StreamExt};
use serde_json;
use tokio::sync::broadcast;
use warp::Filter;

use libc::size_t;

// ── Android logging via logd ──

#[cfg(target_os = "android")]
mod android_log {
    use std::ffi::CString;

    const ANDROID_LOG_DEBUG: i32 = 3;
    const ANDROID_LOG_INFO: i32 = 4;
    const ANDROID_LOG_ERROR: i32 = 6;

    #[link(name = "log")]
    extern "C" {
        fn __android_log_write(prio: i32, tag: *const libc::c_char, text: *const libc::c_char) -> i32;
    }

    pub fn info(tag: &str, msg: &str) {
        let tag_c = CString::new(tag).unwrap_or_default();
        let msg_c = CString::new(msg).unwrap_or_default();
        unsafe { __android_log_write(ANDROID_LOG_INFO, tag_c.as_ptr(), msg_c.as_ptr()); }
    }

    pub fn error(tag: &str, msg: &str) {
        let tag_c = CString::new(tag).unwrap_or_default();
        let msg_c = CString::new(msg).unwrap_or_default();
        unsafe { __android_log_write(ANDROID_LOG_ERROR, tag_c.as_ptr(), msg_c.as_ptr()); }
    }
}

use android_log as logd;

const DEFAULT_PORT: u16 = 9090;

// ── PTY management (Android: no portable-pty, use raw libc) ──

struct PtyInstance {
    master_fd: RawFd,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

struct PtyManager {
    instances: HashMap<String, PtyInstance>,
    busybox_path: Option<String>,
    proroot_dir: Option<String>,
    rootfs_dir: Option<String>,
}

fn set_winsize(fd: RawFd, cols: u16, rows: u16) -> Result<(), String> {
    let ws = libc::winsize {
        ws_row: rows as libc::c_ushort,
        ws_col: cols as libc::c_ushort,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let rc = unsafe { libc::ioctl(fd, libc::TIOCSWINSZ, &ws) };
    if rc != 0 {
        Err(std::io::Error::last_os_error().to_string())
    } else {
        Ok(())
    }
}

impl PtyManager {
    fn new(busybox_path: Option<String>, proroot_dir: Option<String>, rootfs_dir: Option<String>) -> Self {
        Self { instances: HashMap::new(), busybox_path, proroot_dir, rootfs_dir }
    }

    fn spawn(&mut self, id: &str, cwd: &str, command: Option<&str>, cols: u16, rows: u16,
             on_data: Box<dyn Fn(String) + Send>, on_exit: Box<dyn FnOnce() + Send>) -> Result<(), String> {
        logd::info("TermhostNative", &format!("spawn id={id} cwd={cwd} cmd={cmd:?} cols={cols} rows={rows}",
            cmd = command.unwrap_or("(default)")));
        // Open master side of PTY
        let master_fd = unsafe { libc::posix_openpt(libc::O_RDWR | libc::O_NOCTTY) };
        if master_fd < 0 {
            let e = format!("posix_openpt failed: {}", std::io::Error::last_os_error());
            logd::error("TermhostNative", &e);
            return Err(e);
        }

        if unsafe { libc::grantpt(master_fd) } != 0 {
            let e = format!("grantpt failed: {}", std::io::Error::last_os_error());
            logd::error("TermhostNative", &e);
            unsafe { libc::close(master_fd); }
            return Err(e);
        }

        if unsafe { libc::unlockpt(master_fd) } != 0 {
            let e = format!("unlockpt failed: {}", std::io::Error::last_os_error());
            logd::error("TermhostNative", &e);
            unsafe { libc::close(master_fd); }
            return Err(e);
        }

        // Get slave name
        let mut slave_name = [0u8; 4096];
        let rc = unsafe { libc::ptsname_r(master_fd, slave_name.as_mut_ptr() as *mut libc::c_char, slave_name.len() as size_t) };
        if rc != 0 {
            let e = std::io::Error::last_os_error();
            unsafe { libc::close(master_fd); }
            return Err(format!("ptsname_r failed: {e}"));
        }
        let _slave_path = unsafe { CStr::from_ptr(slave_name.as_ptr() as *const libc::c_char).to_string_lossy().into_owned() };
        // Keep a raw C pointer to the null-terminated slave name for use in the
        // child process after fork (String::as_ptr is NOT null-terminated).
        let slave_name_ptr = slave_name.as_ptr() as *const libc::c_char;

        // Parse command
        // Helper: check if proroot is usable
        logd::info("TermhostNative", &format!("spawn: proroot_dir={:?} rootfs_dir={:?}",
            self.proroot_dir, self.rootfs_dir));
        let proroot_launcher = self.proroot_dir.as_ref().and_then(|pr| {
            let rootfs_ready = self.rootfs_dir.as_deref()
                .map(|d| std::path::Path::new(d).join("bin").exists())
                .unwrap_or(false);
            logd::info("TermhostNative", &format!("proroot_launcher: pr={pr} rootfs_ready={rootfs_ready}"));
            if rootfs_ready {
                let launcher = std::path::Path::new(pr).join("libproroot.so");
                let exists = launcher.exists();
                logd::info("TermhostNative", &format!("proroot_launcher: launcher={} exists={exists}", launcher.display()));
                if exists { Some(launcher.to_string_lossy().to_string()) } else { None }
            } else { None }
        });
        logd::info("TermhostNative", &format!("proroot_launcher result: {proroot_launcher:?}"));

        let (exe, args): (String, Vec<String>) = 'pick: {
            if let Some(cmd) = command {
                if !cmd.is_empty() {
                    let parts: Vec<&str> = cmd.split_whitespace().collect();
                    let user_exe = parts[0].to_string();
                    let user_args: Vec<String> = parts.iter().map(|s| s.to_string()).collect();
                    // Wrap with proroot if available and command is not already a full path
                    if let Some(ref launcher) = proroot_launcher {
                        let rootfs = self.rootfs_dir.as_ref().unwrap();
                        let mut wrapped = vec![
                            "libproroot.so".to_string(),
                            "-r".to_string(), rootfs.clone(),
                            "-0".to_string(),
                            "--link2symlink".to_string(),
                            "-b".to_string(), "/dev:/dev".to_string(),
                            "-b".to_string(), "/proc:/proc".to_string(),
                            "-b".to_string(), "/sys:/sys".to_string(),
                            "-b".to_string(), "/sdcard:/sdcard".to_string(),
                            "-w".to_string(), "/root".to_string(),
                        ];
                        wrapped.push(user_exe.clone());
                        wrapped.extend(user_args[1..].iter().cloned());
                        break 'pick (launcher.clone(), wrapped);
                    }
                    break 'pick (user_exe, user_args);
                }
            }
            // Auto-detect: proroot+Ubuntu > busybox ash > Termux bash > /system/bin/sh
            if let Some(ref launcher) = proroot_launcher {
                let rootfs = self.rootfs_dir.as_ref().unwrap();
                let args = vec![
                    "libproroot.so".to_string(),
                    "-r".to_string(), rootfs.clone(),
                    "-0".to_string(),
                    "--link2symlink".to_string(),
                    "-b".to_string(), "/dev:/dev".to_string(),
                    "-b".to_string(), "/proc:/proc".to_string(),
                    "-b".to_string(), "/sys:/sys".to_string(),
                    "-b".to_string(), "/sdcard:/sdcard".to_string(),
                    "-w".to_string(), "/root".to_string(),
                    "/bin/bash".to_string(),
                    "--login".to_string(),
                ];
                break 'pick (launcher.clone(), args);
            }
            let bb = self.busybox_path.as_deref().filter(|p| std::path::Path::new(p).exists());
            if let Some(busybox) = bb {
                break 'pick (busybox.to_string(), vec!["busybox".to_string(), "ash".to_string(), "-l".to_string()]);
            }
            if std::path::Path::new("/data/data/com.termux/files/usr/bin/bash").exists() {
                break 'pick ("/data/data/com.termux/files/usr/bin/bash".to_string(), vec!["bash".to_string(), "--login".to_string()]);
            }
            break 'pick ("/system/bin/sh".to_string(), vec!["sh".to_string(), "-".to_string()]);
        };

        logd::info("TermhostNative", &format!("using shell: {exe} args={args:?}"));

        // Fork
        let pid = unsafe { libc::fork() };
        if pid < 0 {
            let e = format!("fork failed: {}", std::io::Error::last_os_error());
            logd::error("TermhostNative", &e);
            unsafe { libc::close(master_fd); }
            return Err(e);
        }

        logd::info("TermhostNative", &format!("fork ok pid={pid}"));

        if pid == 0 {
            // ── CHILD PROCESS ──
            // Convert to CStrings BEFORE the unsafe block so they live long enough.
            let cwd_c = CString::new(cwd).unwrap_or_default();
            let exe_c = CString::new(exe.as_str()).unwrap_or_default();
            let mut cstrings: Vec<CString> = Vec::with_capacity(args.len());
            cstrings.push(exe_c);
            for arg in &args[1..] {
                cstrings.push(CString::new(arg.as_str()).unwrap_or_default());
            }

            // Build argv from the CString storage — the pointers stay valid as
            // long as `cstrings` lives (which is the rest of this branch).
            let mut argv: Vec<*const libc::c_char> = Vec::with_capacity(cstrings.len() + 1);
            for cs in &cstrings {
                argv.push(cs.as_ptr());
            }
            argv.push(std::ptr::null());

            unsafe {
                libc::close(master_fd);

                libc::setsid();

                let slave_fd = libc::open(slave_name_ptr, libc::O_RDWR);
                if slave_fd < 0 { libc::_exit(1); }

                libc::ioctl(slave_fd, libc::TIOCSCTTY, 0);

                libc::dup2(slave_fd, 0);
                libc::dup2(slave_fd, 1);
                libc::dup2(slave_fd, 2);

                if slave_fd > 2 { libc::close(slave_fd); }

                set_winsize(0, cols, rows).ok();

                libc::chdir(cwd_c.as_ptr());

                libc::execvp(cstrings[0].as_ptr(), argv.as_ptr());
                libc::_exit(1);
            }
        }

        // Parent: set up reading threads
        let (tx, rx) = mpsc::channel::<Vec<u8>>();

        let read_fd = master_fd;
        thread::spawn(move || {
            let mut buf = [0u8; 65536];
            loop {
                let n = unsafe {
                    libc::read(read_fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len())
                };
                if n <= 0 { break; }
                let _ = tx.send(buf[..n as usize].to_vec());
            }
            let _ = tx.send(Vec::new()); // signal EOF
        });

        let writer_fd = master_fd;
        let writer: Box<dyn Write + Send> = Box::new(PtyWriter { fd: writer_fd });

        thread::spawn(move || {
            let mut pending = Vec::with_capacity(65536);
            loop {
                match rx.recv() {
                    Err(_) => break,
                    Ok(ref v) if v.is_empty() => break,
                    Ok(data) => pending.extend_from_slice(&data),
                }
                while let Ok(data) = rx.try_recv() {
                    if data.is_empty() { break; }
                    pending.extend_from_slice(&data);
                }
                let valid_len = {
                    let mut i = pending.len();
                    while i > 0 && i > pending.len().saturating_sub(4) {
                        if std::str::from_utf8(&pending[..i]).is_ok() { break; }
                        i -= 1;
                    }
                    if i == 0 && !pending.is_empty() { pending.len() } else { i }
                };
                if valid_len > 0 {
                    let text = if valid_len == pending.len() {
                        unsafe { String::from_utf8_unchecked(pending[..valid_len].to_vec()) }
                    } else {
                        String::from_utf8_lossy(&pending[..valid_len]).into_owned()
                    };
                    on_data(text);
                    pending = pending[valid_len..].to_vec();
                }
            }
            on_exit();
        });

        set_winsize(master_fd, cols, rows)?;

        logd::info("TermhostNative", &format!("spawn ok id={id} fd={master_fd}"));

        self.instances.insert(id.to_string(), PtyInstance {
            master_fd,
            writer: Arc::new(Mutex::new(writer)),
        });
        Ok(())
    }

    fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let inst = self.instances.get(id).ok_or_else(|| format!("PTY {id} not found"))?;
        let mut w = inst.writer.lock().map_err(|e| e.to_string())?;
        w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())
    }

    fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let inst = self.instances.get(id).ok_or_else(|| format!("PTY {id} not found"))?;
        set_winsize(inst.master_fd, cols, rows)
    }

    fn kill(&mut self, id: &str) {
        if let Some(inst) = self.instances.remove(id) {
            unsafe { libc::close(inst.master_fd); }
        }
    }
}

struct PtyWriter {
    fd: RawFd,
}

impl Write for PtyWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let n = unsafe { libc::write(self.fd, buf.as_ptr() as *const libc::c_void, buf.len()) };
        if n < 0 { Err(std::io::Error::last_os_error()) } else { Ok(n as usize) }
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl Drop for PtyWriter {
    fn drop(&mut self) {
        unsafe { libc::close(self.fd); }
    }
}

// ── State ──

#[derive(Clone)]
struct AppState {
    pty_mgr: Arc<Mutex<PtyManager>>,
    terminals: Arc<Mutex<HashMap<String, TerminalMeta>>>,
    broadcast_tx: broadcast::Sender<BroadcastMsg>,
    ws_token: String,
    busybox_path: Option<String>,
    proroot_dir: Option<String>,
    rootfs_dir: Option<String>,
}

#[derive(Clone, Debug)]
enum BroadcastMsg {
    Output { id: String, data: String },
    TerminalResized { id: String, cols: u16, rows: u16 },
}

#[derive(Clone)]
struct TerminalMeta {
    cwd: String,
    command: String,
    cols: u16,
    rows: u16,
}

fn generate_token() -> String {
    let mut bytes = [0u8; 16];
    let _ = getrandom::getrandom(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn load_mobile_html() -> String {
    include_str!("../../dist-mobile/mobile.html").to_string()
}

fn ensure_rootfs(rootfs_path: &std::path::Path, tarball: &std::path::Path, busybox: Option<&str>) {
    if rootfs_path.join("bin").exists() {
        logd::info("TermhostNative", "Rootfs already extracted");
        let _ = std::fs::remove_file(tarball);
        return;
    }
    if !tarball.exists() {
        logd::info("TermhostNative", "No rootfs tarball — extraction handled by Kotlin");
        return;
    }
    // Fallback extraction: try busybox from CLI arg or libbusybox.so next to exe
    let bb = busybox.and_then(|p| {
        let f = std::path::Path::new(p);
        if f.exists() { Some(f.to_path_buf()) } else { None }
    }).or_else(|| {
        std::env::current_exe().ok()
            .and_then(|exe| exe.parent().map(|p| p.join("libbusybox.so")))
            .filter(|p| p.exists())
    });
    if let Some(bb) = bb {
        logd::info("TermhostNative", "Fallback: extracting rootfs via busybox tar...");
        match std::process::Command::new(&bb)
            .arg("tar")
            .arg("-xzf")
            .arg(tarball)
            .arg("-C")
            .arg(rootfs_path)
            .status()
        {
            Ok(s) if s.success() => {
                logd::info("TermhostNative", "Rootfs extracted via busybox tar");
                let _ = std::fs::remove_file(tarball);
            }
            Ok(s) => logd::info("TermhostNative", &format!("busybox tar exit={s}")),
            Err(e) => logd::info("TermhostNative", &format!("busybox tar error: {e}")),
        }
    }
}

// ── HTTP/WS server ──

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut port = DEFAULT_PORT;
    let mut busybox_path: Option<String> = None;
    let mut proroot_dir: Option<String> = None;
    let mut rootfs_dir: Option<String> = None;
    let mut pid_file: Option<String> = None;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" if i + 1 < args.len() => { port = args[i + 1].parse().unwrap_or(DEFAULT_PORT); i += 2; }
            "--busybox" if i + 1 < args.len() => { busybox_path = Some(args[i + 1].clone()); i += 2; }
            "--proroot-dir" if i + 1 < args.len() => { proroot_dir = Some(args[i + 1].clone()); i += 2; }
            "--rootfs-dir" if i + 1 < args.len() => { rootfs_dir = Some(args[i + 1].clone()); i += 2; }
            "--pid-file" if i + 1 < args.len() => { pid_file = Some(args[i + 1].clone()); i += 2; }
            _ => { i += 1; }
        }
    }
    // Also check env fallback
    if let Ok(p) = std::env::var("TERMHOST_PORT") {
        port = p.parse().unwrap_or(DEFAULT_PORT);
    }
    if busybox_path.is_none() {
        busybox_path = std::env::var("TERMHOST_BUSYBOX").ok();
    }
    if proroot_dir.is_none() {
        proroot_dir = std::env::var("TERMHOST_PROROOT_DIR").ok();
    }
    if rootfs_dir.is_none() {
        rootfs_dir = std::env::var("TERMHOST_ROOTFS_DIR").ok();
    }

    logd::info("TermhostNative", &format!("Parsed: port={port} busybox={b:?} proroot_dir={p:?} rootfs_dir={r:?} pid_file={pf:?}",
        b = busybox_path, p = proroot_dir, r = rootfs_dir, pf = pid_file));

    // Find an available port starting from the configured one
    let actual_port = (port..port + 10).find(|p| {
        std::net::TcpListener::bind((std::net::Ipv4Addr::UNSPECIFIED, *p)).map(|l| { drop(l); true }).unwrap_or(false)
    }).unwrap_or(port);
    if actual_port != port {
        logd::info("TermhostNative", &format!("Port {port} busy, using {actual_port} instead"));
    }

    // Write PID file so Kotlin can track us on next launch
    let my_pid = unsafe { libc::getpid() };
    if let Some(ref pf) = pid_file {
        let _ = std::fs::write(pf, my_pid.to_string());
    }

    // Ensure rootfs is ready (Kotlin should have extracted it already)
    if let Some(ref rf) = rootfs_dir {
        let rootfs_path = std::path::Path::new(rf);
        let tarball = rootfs_path.join("rootfs.tar.gz");
        ensure_rootfs(rootfs_path, &tarball, busybox_path.as_deref());
        if rootfs_path.join("bin").exists() {
            logd::info("TermhostNative", &format!("Rootfs ready at {rf}"));
        } else {
            logd::info("TermhostNative", "Rootfs not ready (fallback shells will be used)");
        }
    }

    let token = generate_token();
    let (broadcast_tx, _) = broadcast::channel(2048);

    let state = AppState {
        pty_mgr: Arc::new(Mutex::new(PtyManager::new(busybox_path.clone(), proroot_dir.clone(), rootfs_dir.clone()))),
        busybox_path,
        proroot_dir,
        rootfs_dir,
        terminals: Arc::new(Mutex::new(HashMap::new())),
        broadcast_tx,
        ws_token: token.clone(),
    };

    logd::info("TermhostNative", &format!("termhostd (android) starting on 0.0.0.0:{actual_port}"));
    logd::info("TermhostNative", &format!("WS token: {token}"));

    // HTML route: serve the mobile client with token injected
    let html = load_mobile_html().replace(
        "</body>",
        &format!("<script>window.__WS_TOKEN__=\"{token}\"</script></body>"),
    );
    let html_route = warp::path::end()
        .map(move || warp::reply::html(html.clone()));

    // Health check
    let health = warp::path("health")
        .map(|| warp::reply::json(&serde_json::json!({"status": "ok"})));

    // WS route
    let ws_state = state.clone();
    let ws_route = warp::path("ws")
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let s = ws_state.clone();
            ws.on_upgrade(move |socket| handle_ws(socket, s))
        });

    let routes = html_route.or(health).or(ws_route);

    warp::serve(routes).run(([0, 0, 0, 0], actual_port)).await;
}

async fn handle_ws(ws: warp::ws::WebSocket, state: AppState) {
    let (mut ws_tx, mut ws_rx) = ws.split();

    // Send terminal list
    let list = {
        let terms = state.terminals.lock().unwrap();
        terms.iter().map(|(id, m)| {
            serde_json::json!({"id": id, "label": format!("bash: {}", m.cwd), "cwd": m.cwd, "cols": m.cols, "rows": m.rows})
        }).collect::<Vec<serde_json::Value>>()
    };
    let _ = ws_tx.send(warp::ws::Message::text(
        serde_json::json!({"type": "terminals", "data": list}).to_string()
    )).await;

    let mut broadcast_rx = state.broadcast_tx.subscribe();
    let ws_tx = Arc::new(tokio::sync::Mutex::new(ws_tx));
    let ws_tx_fwd = ws_tx.clone();

    let fwd = tokio::spawn(async move {
        loop {
            match broadcast_rx.recv().await {
                Ok(BroadcastMsg::Output { id, data }) => {
                    let msg = serde_json::json!({"type": "output", "id": id, "data": data});
                    let mut tx = ws_tx_fwd.lock().await;
                    let _ = tx.send(warp::ws::Message::text(msg.to_string())).await;
                }
                Ok(BroadcastMsg::TerminalResized { id, cols, rows }) => {
                    let msg = serde_json::json!({"type": "resize", "id": id, "cols": cols, "rows": rows});
                    let mut tx = ws_tx_fwd.lock().await;
                    let _ = tx.send(warp::ws::Message::text(msg.to_string())).await;
                }
                Err(_) => break,
            }
        }
    });

    while let Some(Ok(msg)) = ws_rx.next().await {
        if let Ok(text) = msg.to_str() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(text) {
                match v["type"].as_str() {
                    Some("input") => {
                        if let (Some(id), Some(data)) = (v["id"].as_str(), v["data"].as_str()) {
                            let pty = state.pty_mgr.lock().unwrap();
                            let _ = pty.write(id, data);
                        }
                    }
                    Some("resize") => {
                        if let (Some(id), Some(cols), Some(rows)) =
                            (v["id"].as_str(), v["cols"].as_u64(), v["rows"].as_u64())
                        {
                            let pty = state.pty_mgr.lock().unwrap();
                            if pty.resize(id, cols as u16, rows as u16).is_ok() {
                                if let Ok(mut terms) = state.terminals.lock() {
                                    if let Some(m) = terms.get_mut(id) {
                                        m.cols = cols as u16;
                                        m.rows = rows as u16;
                                    }
                                }
                                let _ = state.broadcast_tx.send(BroadcastMsg::TerminalResized {
                                    id: id.to_string(), cols: cols as u16, rows: rows as u16,
                                });
                            }
                        }
                    }
                    Some("spawn") => {
                        let cwd = v["cwd"].as_str().unwrap_or("/sdcard");
                        let command = v["shell"].as_str().map(|s| s.to_string());
                        let cols = v["cols"].as_u64().unwrap_or(80) as u16;
                        let rows = v["rows"].as_u64().unwrap_or(24) as u16;
                        let id = format!("term-{}", std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());

                        // Insert the terminal placeholder immediately so the
                        // frontend can register the xterm before any output starts.
                        state.terminals.lock().unwrap().insert(id.clone(), TerminalMeta {
                            cwd: cwd.to_string(),
                            command: command.clone().unwrap_or_default(),
                            cols, rows,
                        });

                        // Send terminal list FIRST — before spawn — so the
                        // frontend creates the xterm before any output arrives.
                        let list = {
                            let terms = state.terminals.lock().unwrap();
                            terms.iter().map(|(tid, m)| {
                                serde_json::json!({"id": tid, "label": format!("sh: {}", m.cwd), "cwd": m.cwd, "cols": m.cols, "rows": m.rows})
                            }).collect::<Vec<serde_json::Value>>()
                        };
                        {
                            let msg = serde_json::json!({"type": "terminals", "data": list}).to_string();
                            let mut tx = ws_tx.lock().await;
                            let _ = tx.send(warp::ws::Message::text(msg)).await;
                        }

                        let state_clone = state.clone();
                        let id_clone = id.clone();
                        let on_data = move |data: String| {
                            let _ = state_clone.broadcast_tx.send(BroadcastMsg::Output {
                                id: id_clone.clone(), data,
                            });
                        };
                        let state_exit = state.clone();
                        let id_exit = id.clone();
                        let on_exit = move || {
                            state_exit.terminals.lock().unwrap().remove(&id_exit);
                        };

                        let spawn_result = {
                            let mut mgr = state.pty_mgr.lock().unwrap();
                            mgr.spawn(
                                &id, cwd, command.as_deref(), cols, rows,
                                Box::new(on_data), Box::new(on_exit),
                            )
                        };
                        if let Err(e) = spawn_result {
                            state.terminals.lock().unwrap().remove(&id);
                            let msg = serde_json::json!({"type": "error", "message": e}).to_string();
                            let mut tx = ws_tx.lock().await;
                            let _ = tx.send(warp::ws::Message::text(msg)).await;
                        }
                    }
                    Some("kill") => {
                        if let Some(id) = v["id"].as_str() {
                            state.pty_mgr.lock().unwrap().kill(id);
                            state.terminals.lock().unwrap().remove(id);
                            let list = {
                                let terms = state.terminals.lock().unwrap();
                                terms.iter().map(|(tid, m)| {
                                    serde_json::json!({"id": tid, "label": format!("bash: {}", m.cwd), "cwd": m.cwd, "cols": m.cols, "rows": m.rows})
                                }).collect::<Vec<serde_json::Value>>()
                            };
                            let msg = serde_json::json!({"type": "terminals", "data": list}).to_string();
                            let mut tx = ws_tx.lock().await;
                            let _ = tx.send(warp::ws::Message::text(msg)).await;
                        }
                    }
                    Some("list") => {
                        let list = {
                            let terms = state.terminals.lock().unwrap();
                            terms.iter().map(|(tid, m)| {
                                serde_json::json!({"id": tid, "label": format!("bash: {}", m.cwd), "cwd": m.cwd, "cols": m.cols, "rows": m.rows})
                            }).collect::<Vec<serde_json::Value>>()
                        };
                        let msg = serde_json::json!({"type": "terminals", "data": list}).to_string();
                        let mut tx = ws_tx.lock().await;
                        let _ = tx.send(warp::ws::Message::text(msg)).await;
                    }
                    Some("ping") => {
                        let ts = v["ts"].as_i64().unwrap_or(0);
                        let pong = serde_json::json!({"type": "pong", "ts": ts});
                        let mut tx = ws_tx.lock().await;
                        let _ = tx.send(warp::ws::Message::text(pong.to_string())).await;
                    }
                    Some("list_workspaces") => {
                        let workspaces = serde_json::json!({
                            "type": "workspaces",
                            "data": [{"name": "default", "color": 0, "terminalCount": state.terminals.lock().unwrap().len()}],
                            "activeIdx": 0,
                        });
                        let mut tx = ws_tx.lock().await;
                        let _ = tx.send(warp::ws::Message::text(workspaces.to_string())).await;
                    }
                    Some("get_screen") => {
                        // On Android we don't have vt100 capture, so send a
                        // blank placeholder that tells the frontend "ready".
                        let id = v["id"].as_str().unwrap_or("");
                        if !id.is_empty() {
                            let blank = serde_json::json!({"type": "screen", "id": id, "data": ""});
                            let mut tx = ws_tx.lock().await;
                            let _ = tx.send(warp::ws::Message::text(blank.to_string())).await;
                        }
                    }
                    Some("get_buffer") | Some("switch_workspace") | Some("create_workspace") | Some("delete_workspace") => {
                        // No-ops: Android has a single workspace and no buffer capture.
                    }
                    _ => {}
                }
            }
        }
    }

    fwd.abort();
}
