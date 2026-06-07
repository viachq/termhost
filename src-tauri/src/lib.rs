mod pty_manager;
mod workspace_manager;
mod ws_server;

use pty_manager::{PtyManager, create_pty};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use tokio::sync::broadcast;

const OUTPUT_BUFFER_MAX: usize = 128 * 1024;

struct AppState {
    pty_manager: Arc<Mutex<PtyManager>>,
    pty_buffers: Arc<Mutex<HashMap<String, Arc<Mutex<Vec<u8>>>>>>,
    ws_handle: Mutex<Option<ws_server::WsServerHandle>>,
    pty_broadcast: broadcast::Sender<(String, String)>,
    terminal_infos: Arc<Mutex<Vec<ws_server::TerminalInfo>>>,
    workspace_provider: ws_server::WorkspaceProvider,
}

#[derive(Serialize, Deserialize, Clone)]
struct SpawnRequest {
    id: String,
    cwd: Option<String>,
    command: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
}

#[tauri::command]
fn spawn_terminal(
    state: State<AppState>,
    app: tauri::AppHandle,
    req: SpawnRequest,
) -> Result<String, String> {
    let id = req.id.clone();

    {
        let mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
        if mgr.has(&id) {
            return Ok(id);
        }
    }

    let cwd = req.cwd.unwrap_or_else(|| {
        dirs::home_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "C:\\".to_string())
    });

    let cmd = req.command.clone();
    let cols = req.cols.unwrap_or(80);
    let rows = req.rows.unwrap_or(24);

    let label = cmd
        .as_deref()
        .filter(|c| !c.is_empty())
        .map(|c| {
            if c.len() > 30 {
                format!("{}...", &c[..30])
            } else {
                c.to_string()
            }
        })
        .unwrap_or_else(|| {
            format!(
                "PS: {}",
                cwd.split('\\').last().unwrap_or("shell")
            )
        });
    if let Ok(mut infos) = state.terminal_infos.lock() {
        infos.push(ws_server::TerminalInfo {
            id: id.clone(),
            label,
        });
    }

    let buffer = Arc::new(Mutex::new(Vec::with_capacity(32768)));
    if let Ok(mut bufs) = state.pty_buffers.lock() {
        bufs.insert(id.clone(), buffer.clone());
    }

    let id_for_closure = id.clone();
    let broadcast_tx = state.pty_broadcast.clone();
    let id_for_broadcast = id.clone();

    let instance = create_pty(&cwd, cmd.as_deref(), cols, rows, move |data| {
        if let Ok(mut buf) = buffer.lock() {
            buf.extend_from_slice(data.as_bytes());
            if buf.len() > OUTPUT_BUFFER_MAX {
                let start = buf.len() - OUTPUT_BUFFER_MAX;
                *buf = buf[start..].to_vec();
            }
        }
        let _ = app.emit(&format!("pty-data-{}", id_for_closure), &data);
        let _ = broadcast_tx.send((id_for_broadcast.clone(), data));
    })
    .map_err(|e| e.to_string())?;

    {
        let mut mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
        mgr.register(id.clone(), instance);
    }

    Ok(id)
}

#[tauri::command]
fn has_terminal(state: State<AppState>, id: String) -> bool {
    state.pty_manager.lock().map(|mgr| mgr.has(&id)).unwrap_or(false)
}

#[tauri::command]
fn get_terminal_buffer(state: State<AppState>, id: String) -> Result<String, String> {
    let buf_arc = {
        let bufs = state.pty_buffers.lock().map_err(|e| e.to_string())?;
        bufs.get(&id).cloned().ok_or_else(|| format!("No buffer for {}", id))?
    };
    let buf = buf_arc.lock().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

#[tauri::command]
fn write_terminal(state: State<AppState>, id: String, data: String) -> Result<(), String> {
    let writer = {
        let mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
        mgr.get_writer(&id).map_err(|e| e.to_string())?
    };
    let mut w = writer.lock().map_err(|e| e.to_string())?;
    w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn resize_terminal(
    state: State<AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let master = {
        let mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
        mgr.get_master(&id).map_err(|e| e.to_string())?
    };
    let m = master.lock().map_err(|e| e.to_string())?;
    m.resize(portable_pty::PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn kill_terminal(state: State<AppState>, id: String) -> Result<(), String> {
    let mut mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
    mgr.kill(&id);
    if let Ok(mut bufs) = state.pty_buffers.lock() {
        bufs.remove(&id);
    }
    if let Ok(mut infos) = state.terminal_infos.lock() {
        infos.retain(|t| t.id != id);
    }
    Ok(())
}

#[tauri::command]
fn sync_workspaces(
    state: State<AppState>,
    workspaces: Vec<workspace_manager::WorkspaceData>,
    active_idx: usize,
) -> Result<(), String> {
    let mut provider = state.workspace_provider.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut mgr) = *provider {
        mgr.sync(workspaces, active_idx);
    } else {
        let mut mgr = workspace_manager::WorkspaceManager::new(state.terminal_infos.clone());
        mgr.sync(workspaces, active_idx);
        *provider = Some(mgr);
    }
    Ok(())
}

#[tauri::command]
async fn start_ws_server(state: State<'_, AppState>, port: u16) -> Result<String, String> {
    {
        let handle = state.ws_handle.lock().map_err(|e| e.to_string())?;
        if handle.is_some() {
            return Err("Already running".into());
        }
    }

    let h = ws_server::start(
        port,
        state.pty_manager.clone(),
        state.pty_broadcast.clone(),
        state.terminal_infos.clone(),
        state.pty_buffers.clone(),
        state.workspace_provider.clone(),
    );

    {
        let mut handle = state.ws_handle.lock().map_err(|e| e.to_string())?;
        *handle = Some(h);
    }

    let ip = ws_server::get_local_ip();
    Ok(format!("{}:{}", ip, port))
}

#[tauri::command]
fn stop_ws_server(state: State<AppState>) -> Result<(), String> {
    let mut handle = state.ws_handle.lock().map_err(|e| e.to_string())?;
    if let Some(h) = handle.take() {
        h.shutdown();
    }
    Ok(())
}

#[tauri::command]
fn ws_server_status(state: State<AppState>) -> Result<serde_json::Value, String> {
    let handle = state.ws_handle.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "running": handle.is_some(),
        "ip": ws_server::get_local_ip(),
    }))
}

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result: Vec<FileEntry> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let path = e.path().to_string_lossy().to_string();
            let is_dir = e.file_type().ok()?.is_dir();
            Some(FileEntry { name, path, is_dir })
        })
        .collect();
    result.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(result)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_cwd() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| get_home_dir())
}

#[tauri::command]
fn get_home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "C:\\".to_string())
}

#[tauri::command]
async fn browser_open(app: tauri::AppHandle, url: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize};

    let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    if let Some(existing) = app.get_webview("browser-panel") {
        existing.navigate(parsed_url).map_err(|e: tauri::Error| e.to_string())?;
        existing.set_position(LogicalPosition::new(x, y)).map_err(|e: tauri::Error| e.to_string())?;
        existing.set_size(LogicalSize::new(width, height)).map_err(|e: tauri::Error| e.to_string())?;
        return Ok(());
    }

    let window = app.get_webview_window("main").ok_or("No main window")?;
    let raw_window = window.as_ref().window();

    let webview = tauri::WebviewBuilder::new(
        "browser-panel",
        tauri_utils::config::WebviewUrl::External(parsed_url),
    );

    raw_window.add_child(
        webview,
        LogicalPosition::new(x, y),
        LogicalSize::new(width, height),
    ).map_err(|e: tauri::Error| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn browser_navigate(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let webview = app.get_webview("browser-panel").ok_or("Browser not open")?;
    webview.navigate(url.parse().map_err(|e: url::ParseError| e.to_string())?).map_err(|e: tauri::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn browser_resize(app: tauri::AppHandle, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize};
    let webview = app.get_webview("browser-panel").ok_or("Browser not open")?;
    webview.set_position(LogicalPosition::new(x, y)).map_err(|e: tauri::Error| e.to_string())?;
    webview.set_size(LogicalSize::new(width, height)).map_err(|e: tauri::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn browser_close(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("browser-panel") {
        webview.close().map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_hide(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("browser-panel") {
        use tauri::LogicalPosition;
        webview.set_position(LogicalPosition::new(-9999.0_f64, -9999.0_f64))
            .map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--enable-gpu-rasterization --enable-zero-copy --disable-pinch --disable-features=BackForwardCache,TranslateUI --enable-features=CanvasOopRasterization",
    );

    let (pty_broadcast, _) = broadcast::channel::<(String, String)>(1024);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            pty_manager: Arc::new(Mutex::new(PtyManager::new())),
            pty_buffers: Arc::new(Mutex::new(HashMap::new())),
            ws_handle: Mutex::new(None),
            pty_broadcast,
            terminal_infos: Arc::new(Mutex::new(Vec::new())),
            workspace_provider: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            spawn_terminal,
            write_terminal,
            resize_terminal,
            kill_terminal,
            has_terminal,
            get_terminal_buffer,
            list_dir,
            read_file,
            get_home_dir,
            get_cwd,
            open_folder,
            start_ws_server,
            stop_ws_server,
            ws_server_status,
            sync_workspaces,
            browser_open,
            browser_navigate,
            browser_resize,
            browser_close,
            browser_hide,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
