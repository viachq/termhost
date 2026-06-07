#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod buffer;
mod pty_manager;

use buffer::BufferManager;
use pty_manager::{PtyManager, create_pty};
use terminalhub_shared::protocol::*;

use std::collections::HashMap;
use std::io::Write;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::windows::named_pipe::{ServerOptions, PipeMode};
use tokio::sync::{broadcast, Mutex as TokioMutex, Notify};

const PIPE_NAME: &str = r"\\.\pipe\terminalhub-pty-v1";
const IDLE_TIMEOUT_SECS: u64 = 300;

struct DaemonState {
    pty_manager: std::sync::Mutex<PtyManager>,
    buffer_manager: std::sync::Mutex<BufferManager>,
    terminal_infos: std::sync::Mutex<Vec<TerminalInfo>>,
    broadcast_tx: broadcast::Sender<(String, String)>,
    client_count: std::sync::atomic::AtomicU32,
    activity: Notify,
}

#[tokio::main]
async fn main() {
    let (broadcast_tx, _) = broadcast::channel::<(String, String)>(2048);

    let state = Arc::new(DaemonState {
        pty_manager: std::sync::Mutex::new(PtyManager::new()),
        buffer_manager: std::sync::Mutex::new(BufferManager::new()),
        terminal_infos: std::sync::Mutex::new(Vec::new()),
        broadcast_tx,
        client_count: std::sync::atomic::AtomicU32::new(0),
        activity: Notify::new(),
    });

    // Write PID file
    if let Some(dir) = dirs::data_local_dir() {
        let pid_dir = dir.join("TerminalHub");
        let _ = std::fs::create_dir_all(&pid_dir);
        let _ = std::fs::write(pid_dir.join("daemon.pid"), std::process::id().to_string());
    }

    eprintln!("terminalhub-daemon started on {}", PIPE_NAME);

    let state_idle = state.clone();
    tokio::spawn(async move {
        idle_watcher(state_idle).await;
    });

    loop {
        let server = match ServerOptions::new()
            .first_pipe_instance(false)
            .pipe_mode(PipeMode::Byte)
            .create(PIPE_NAME)
        {
            Ok(s) => s,
            Err(e) => {
                // Pipe may already exist from a previous instance, retry
                eprintln!("Failed to create pipe: {}, retrying in 1s", e);
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                continue;
            }
        };

        if server.connect().await.is_err() {
            continue;
        }

        let state = state.clone();
        state.client_count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        state.activity.notify_one();

        tokio::spawn(async move {
            handle_client(server, state.clone()).await;
            state.client_count.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
            state.activity.notify_one();
        });
    }
}

async fn idle_watcher(state: Arc<DaemonState>) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        let clients = state.client_count.load(std::sync::atomic::Ordering::Relaxed);
        let has_terminals = state.pty_manager.lock()
            .map(|m| m.list_ids().len() > 0)
            .unwrap_or(false);

        if clients == 0 && !has_terminals {
            eprintln!("No clients and no terminals, starting idle countdown...");
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(IDLE_TIMEOUT_SECS)) => {
                    let clients = state.client_count.load(std::sync::atomic::Ordering::Relaxed);
                    let has_terminals = state.pty_manager.lock()
                        .map(|m| m.list_ids().len() > 0)
                        .unwrap_or(false);
                    if clients == 0 && !has_terminals {
                        eprintln!("Idle timeout reached, shutting down");
                        std::process::exit(0);
                    }
                }
                _ = state.activity.notified() => {
                    eprintln!("Activity detected, cancelling idle shutdown");
                }
            }
        }
    }
}

async fn handle_client(pipe: tokio::net::windows::named_pipe::NamedPipeServer, state: Arc<DaemonState>) {
    let (reader, writer) = tokio::io::split(pipe);
    let reader = Arc::new(TokioMutex::new(reader));
    let writer = Arc::new(TokioMutex::new(writer));

    // Subscribe to broadcast for output push
    let mut broadcast_rx = state.broadcast_tx.subscribe();
    let writer_push = writer.clone();

    let push_task = tokio::spawn(async move {
        loop {
            match broadcast_rx.recv().await {
                Ok((id, data)) => {
                    let resp = DaemonResponse::Output { id, data };
                    if send_response(&writer_push, &resp).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    });

    // Read requests
    loop {
        let frame = match read_frame(&reader).await {
            Ok(Some(f)) => f,
            Ok(None) | Err(_) => break,
        };

        let request: DaemonRequest = match serde_json::from_slice(&frame) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("Invalid request: {}", e);
                continue;
            }
        };

        let response = handle_request(&state, request).await;
        if let Some(resp) = response {
            if send_response(&writer, &resp).await.is_err() {
                break;
            }
        }
    }

    push_task.abort();
}

async fn read_frame(
    reader: &Arc<TokioMutex<tokio::io::ReadHalf<tokio::net::windows::named_pipe::NamedPipeServer>>>,
) -> Result<Option<Vec<u8>>, std::io::Error> {
    let mut r = reader.lock().await;
    let mut len_buf = [0u8; 4];
    match r.read_exact(&mut len_buf).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > 16 * 1024 * 1024 {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "frame too large"));
    }
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf).await?;
    Ok(Some(buf))
}

async fn send_response(
    writer: &Arc<TokioMutex<tokio::io::WriteHalf<tokio::net::windows::named_pipe::NamedPipeServer>>>,
    resp: &DaemonResponse,
) -> Result<(), std::io::Error> {
    let frame = encode_message(resp).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let mut w = writer.lock().await;
    w.write_all(&frame).await?;
    w.flush().await?;
    Ok(())
}

async fn handle_request(state: &Arc<DaemonState>, req: DaemonRequest) -> Option<DaemonResponse> {
    match req {
        DaemonRequest::Ping { seq } => Some(DaemonResponse::Pong { seq }),

        DaemonRequest::Shutdown => {
            eprintln!("Shutdown requested");
            tokio::spawn(async { tokio::time::sleep(std::time::Duration::from_millis(100)).await; std::process::exit(0); });
            Some(DaemonResponse::Ok { seq: 0 })
        }

        DaemonRequest::Spawn { seq, id, cwd, command, cols, rows } => {
            {
                let mgr = state.pty_manager.lock().unwrap();
                if mgr.has(&id) {
                    return Some(DaemonResponse::SpawnResult { seq, id });
                }
            }

            let resolved_cwd = if cwd.is_empty() {
                dirs::home_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| "C:\\".to_string())
            } else {
                cwd
            };

            let label = command.as_deref()
                .filter(|c| !c.is_empty())
                .map(|c| if c.len() > 30 { format!("{}...", &c[..30]) } else { c.to_string() })
                .unwrap_or_else(|| format!("PS: {}", resolved_cwd.split('\\').last().unwrap_or("shell")));

            if let Ok(mut infos) = state.terminal_infos.lock() {
                infos.push(TerminalInfo { id: id.clone(), label });
            }

            let buffer = {
                let mut bm = state.buffer_manager.lock().unwrap();
                bm.create(&id)
            };

            let broadcast_tx = state.broadcast_tx.clone();
            let id_clone = id.clone();

            match create_pty(&resolved_cwd, command.as_deref(), cols, rows, move |data| {
                BufferManager::append(&buffer, data.as_bytes());
                let _ = broadcast_tx.send((id_clone.clone(), data));
            }) {
                Ok(instance) => {
                    let mut mgr = state.pty_manager.lock().unwrap();
                    mgr.register(id.clone(), instance);
                    state.activity.notify_one();
                    Some(DaemonResponse::SpawnResult { seq, id })
                }
                Err(e) => Some(DaemonResponse::Error { seq, message: e.to_string() }),
            }
        }

        DaemonRequest::Write { id, data } => {
            let writer = {
                let mgr = state.pty_manager.lock().unwrap();
                mgr.get_writer(&id).ok()
            };
            if let Some(w) = writer {
                if let Ok(mut w) = w.lock() {
                    let _ = w.write_all(data.as_bytes());
                }
            }
            None // Write is fire-and-forget, no response needed
        }

        DaemonRequest::Resize { seq, id, cols, rows } => {
            let master = {
                let mgr = state.pty_manager.lock().unwrap();
                mgr.get_master(&id).ok()
            };
            if let Some(m) = master {
                if let Ok(m) = m.lock() {
                    match m.resize(portable_pty::PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }) {
                        Ok(_) => return Some(DaemonResponse::Ok { seq }),
                        Err(e) => return Some(DaemonResponse::Error { seq, message: e.to_string() }),
                    }
                }
            }
            Some(DaemonResponse::Error { seq, message: format!("PTY {} not found", id) })
        }

        DaemonRequest::Kill { seq, id } => {
            {
                let mut mgr = state.pty_manager.lock().unwrap();
                mgr.kill(&id);
            }
            {
                let mut bm = state.buffer_manager.lock().unwrap();
                bm.remove(&id);
            }
            {
                let mut infos = state.terminal_infos.lock().unwrap();
                infos.retain(|t| t.id != id);
            }
            state.activity.notify_one();
            Some(DaemonResponse::Ok { seq })
        }

        DaemonRequest::HasTerminal { seq, id } => {
            let exists = state.pty_manager.lock().unwrap().has(&id);
            Some(DaemonResponse::HasResult { seq, exists })
        }

        DaemonRequest::GetBuffer { seq, id } => {
            let data = state.buffer_manager.lock().unwrap().get_data(&id).unwrap_or_default();
            Some(DaemonResponse::BufferData { seq, id, data })
        }

        DaemonRequest::ListTerminals { seq } => {
            let terminals = state.terminal_infos.lock().unwrap().clone();
            Some(DaemonResponse::TerminalList { seq, terminals })
        }

        DaemonRequest::SubscribeAll => {
            // Client is auto-subscribed via broadcast in handle_client
            None
        }

        // WS server and workspace commands — will be implemented when ws_server moves here
        DaemonRequest::StartWsServer { seq, .. } => {
            Some(DaemonResponse::Error { seq, message: "WS server not yet implemented in daemon".into() })
        }
        DaemonRequest::StopWsServer { seq } => {
            Some(DaemonResponse::Error { seq, message: "WS server not yet implemented in daemon".into() })
        }
        DaemonRequest::WsServerStatus { seq } => {
            Some(DaemonResponse::WsStatus { seq, running: false, ip: "127.0.0.1".into() })
        }
        DaemonRequest::SyncWorkspaces { seq, .. } => {
            Some(DaemonResponse::Ok { seq })
        }
    }
}
