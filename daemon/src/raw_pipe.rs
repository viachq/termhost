//! Raw terminal pipe — lets external processes (like termhost-bridge)
//! connect to a specific terminal and perform raw I/O.

use crate::DaemonState;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

/// Start a raw pipe server for the given terminal.
/// Listens on `\\.\pipe\termhost-raw-<id>` and accepts one connection,
/// performing raw stdin/stdout forwarding for that terminal.
/// After the client disconnects, waits for a new connection.
pub async fn start_raw_pipe(state: Arc<DaemonState>, term_id: String) {
    let pipe_name = format!(r"\\.\pipe\termhost-raw-{}", term_id);
    tracing::debug!("Creating raw pipe: {pipe_name}");

    loop {
        // Create a new pipe instance.
        // First call creates the pipe, subsequent calls create additional instances.
        let server = match ServerOptions::new().create(&pipe_name) {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Failed to create raw pipe {pipe_name}: {e}");
                // Pipe may already exist with active connections; retry
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                continue;
            }
        };

        match server.connect().await {
            Ok(()) => {
                tracing::info!("Raw pipe connected for terminal {term_id}");
                handle_raw_pipe(server, state.clone(), term_id.clone()).await;
                tracing::info!("Raw pipe disconnected for terminal {term_id}, ready for next connection");
            }
            Err(e) => {
                tracing::error!("Raw pipe connect error for {pipe_name}: {e}");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

async fn handle_raw_pipe(pipe: NamedPipeServer, state: Arc<DaemonState>, term_id: String) {
    use crate::BroadcastMsg;

    let (mut reader, mut writer) = tokio::io::split(pipe);

    // Send existing terminal buffer so bridge sees current screen content
    let existing = state.buffer_manager.lock().unwrap().get_data(&term_id);
    drop(state.buffer_manager.lock());  // Release lock
    if let Some(buf) = existing {
        let _ = writer.write_all(buf.as_bytes()).await;
        let _ = writer.flush().await;
    }

    // Subscribe to terminal output via broadcast
    let rx = state.broadcast_tx.subscribe();

    // Reader task: pipe → PTY (keyboard input)
    let id_for_read = term_id.clone();
    let state_for_read = state.clone();
    let read_handle = tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    state_for_read.pty().write(&id_for_read, &data);
                }
                Err(e) => {
                    tracing::debug!("Raw pipe read error for {id_for_read}: {e}");
                    break;
                }
            }
        }
    });

    // Writer task: broadcast → pipe (terminal output)
    let id_for_write = term_id.clone();
    let write_handle = tokio::spawn(async move {
        let mut rx = rx;
        loop {
            match rx.recv().await {
                Ok(BroadcastMsg::TerminalOutput { id, data }) if id == id_for_write => {
                    if let Err(e) = writer.write_all(data.as_bytes()).await {
                        tracing::debug!("Raw pipe write error for {id}: {e}");
                        break;
                    }
                    let _ = writer.flush().await;
                }
                Ok(BroadcastMsg::TerminalResized { id: _, cols: _, rows: _ }) => {
                    // Resize notification — ignore for now
                }
                Ok(_) => continue,
                Err(_) => break,
            }
        }
    });

    // Wait for EITHER task to finish (bridge disconnects)
    tokio::select! {
        _ = read_handle => {},
        _ = write_handle => {},
    }
    tracing::info!("Raw pipe closed for terminal {term_id}");
}
