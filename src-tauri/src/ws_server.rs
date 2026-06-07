use crate::pty_manager::PtyManager;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use warp::Filter;

#[derive(Serialize, Clone)]
pub struct TerminalInfo {
    pub id: String,
    pub label: String,
}

#[derive(Serialize, Clone)]
pub struct WorkspaceInfo {
    pub name: String,
    pub color: u8,
    #[serde(rename = "terminalCount")]
    pub terminal_count: usize,
}

pub struct WsServerHandle {
    shutdown_tx: tokio::sync::oneshot::Sender<()>,
}

impl WsServerHandle {
    pub fn shutdown(self) {
        let _ = self.shutdown_tx.send(());
    }
}

use crate::workspace_manager::WorkspaceManager;

pub type WorkspaceProvider = Arc<Mutex<Option<WorkspaceManager>>>;

pub trait WorkspaceOps: Send {
    fn list(&self) -> (Vec<WorkspaceInfo>, usize);
    fn switch(&mut self, idx: usize) -> Vec<TerminalInfo>;
    fn create(&mut self, name: String, color: u8);
    fn delete(&mut self, idx: usize);
}

pub fn start(
    port: u16,
    pty_manager: Arc<Mutex<PtyManager>>,
    broadcast_tx: broadcast::Sender<(String, String)>,
    terminal_infos: Arc<Mutex<Vec<TerminalInfo>>>,
    pty_buffers: Arc<Mutex<HashMap<String, Arc<Mutex<Vec<u8>>>>>>,
    workspace_provider: WorkspaceProvider,
) -> WsServerHandle {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();

    let html_route = warp::path::end()
        .map(|| warp::reply::html(include_str!("../../dist-mobile/mobile.html")));

    let mgr = pty_manager.clone();
    let bc = broadcast_tx.clone();
    let infos = terminal_infos.clone();
    let bufs = pty_buffers.clone();
    let ws_prov = workspace_provider.clone();

    let ws_route = warp::path("ws")
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let m = mgr.clone();
            let b = bc.clone();
            let i = infos.clone();
            let bf = bufs.clone();
            let wp = ws_prov.clone();
            ws.on_upgrade(move |socket| handle_ws(socket, m, b, i, bf, wp))
        });

    let routes = html_route.or(ws_route);

    let (_, server) = warp::serve(routes)
        .bind_with_graceful_shutdown(([0, 0, 0, 0], port), async {
            let _ = shutdown_rx.await;
        });

    tokio::spawn(server);
    WsServerHandle { shutdown_tx }
}

async fn handle_ws(
    ws: warp::ws::WebSocket,
    pty_manager: Arc<Mutex<PtyManager>>,
    broadcast_tx: broadcast::Sender<(String, String)>,
    terminal_infos: Arc<Mutex<Vec<TerminalInfo>>>,
    pty_buffers: Arc<Mutex<HashMap<String, Arc<Mutex<Vec<u8>>>>>>,
    workspace_provider: WorkspaceProvider,
) {
    let (mut ws_tx, mut ws_rx) = ws.split();

    let infos_msg = {
        let infos = terminal_infos.lock().unwrap_or_else(|e| e.into_inner());
        serde_json::json!({"type": "terminals", "data": &*infos}).to_string()
    };
    let _ = ws_tx.send(warp::ws::Message::text(infos_msg)).await;

    let mut pty_rx = broadcast_tx.subscribe();
    let ws_tx = Arc::new(tokio::sync::Mutex::new(ws_tx));
    let ws_tx2 = ws_tx.clone();

    let fwd = tokio::spawn(async move {
        loop {
            match pty_rx.recv().await {
                Ok((id, data)) => {
                    let msg = serde_json::json!({"type":"output","id":id,"data":data});
                    let mut tx = ws_tx2.lock().await;
                    if tx.send(warp::ws::Message::text(msg.to_string())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
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
                            let writer = {
                                if let Ok(mgr) = pty_manager.lock() {
                                    mgr.get_writer(id).ok()
                                } else {
                                    None
                                }
                            };
                            if let Some(w) = writer {
                                if let Ok(mut w) = w.lock() {
                                    let _ = w.write_all(data.as_bytes());
                                    let _ = w.flush();
                                }
                            }
                        }
                    }
                    Some("resize") => {
                        if let (Some(id), Some(cols), Some(rows)) = (
                            v["id"].as_str(),
                            v["cols"].as_u64(),
                            v["rows"].as_u64(),
                        ) {
                            if let Ok(mgr) = pty_manager.lock() {
                                if let Ok(master) = mgr.get_master(id) {
                                    if let Ok(m) = master.lock() {
                                        let _ = m.resize(portable_pty::PtySize {
                                            rows: rows as u16,
                                            cols: cols as u16,
                                            pixel_width: 0,
                                            pixel_height: 0,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    Some("get_buffer") => {
                        if let Some(id) = v["id"].as_str() {
                            let buf_data = {
                                if let Ok(bufs) = pty_buffers.lock() {
                                    bufs.get(id).and_then(|b| {
                                        b.lock().ok().map(|buf| {
                                            String::from_utf8_lossy(&buf).into_owned()
                                        })
                                    })
                                } else {
                                    None
                                }
                            };
                            if let Some(data) = buf_data {
                                let buf_msg = serde_json::json!({"type":"buffer","id":id,"data":data});
                                let mut tx = ws_tx.lock().await;
                                let _ = tx.send(warp::ws::Message::text(buf_msg.to_string())).await;
                            }
                        }
                    }
                    Some("list") => {
                        let list_msg = {
                            let infos = terminal_infos.lock().unwrap_or_else(|e| e.into_inner());
                            serde_json::json!({"type":"terminals","data":&*infos}).to_string()
                        };
                        let mut tx = ws_tx.lock().await;
                        let _ = tx.send(warp::ws::Message::text(list_msg)).await;
                    }
                    Some("list_workspaces") => {
                        let ws_msg = {
                            if let Ok(prov) = workspace_provider.lock() {
                                if let Some(ref ops) = *prov {
                                    let (ws_list, active_idx) = ops.list();
                                    serde_json::json!({"type":"workspaces","data":ws_list,"activeIdx":active_idx}).to_string()
                                } else {
                                    serde_json::json!({"type":"workspaces","data":[],"activeIdx":0}).to_string()
                                }
                            } else {
                                serde_json::json!({"type":"workspaces","data":[],"activeIdx":0}).to_string()
                            }
                        };
                        let mut tx = ws_tx.lock().await;
                        let _ = tx.send(warp::ws::Message::text(ws_msg)).await;
                    }
                    Some("switch_workspace") => {
                        if let Some(idx) = v["idx"].as_u64() {
                            let terminals_msg = {
                                if let Ok(mut prov) = workspace_provider.lock() {
                                    if let Some(ref mut ops) = *prov {
                                        let new_terminals = ops.switch(idx as usize);
                                        Some(serde_json::json!({"type":"terminals","data":new_terminals}).to_string())
                                    } else { None }
                                } else { None }
                            };
                            if let Some(msg_str) = terminals_msg {
                                let mut tx = ws_tx.lock().await;
                                let _ = tx.send(warp::ws::Message::text(msg_str)).await;
                            }
                        }
                    }
                    Some("create_workspace") => {
                        if let (Some(name), Some(color)) = (v["name"].as_str(), v["color"].as_u64()) {
                            let ws_msg = {
                                if let Ok(mut prov) = workspace_provider.lock() {
                                    if let Some(ref mut ops) = *prov {
                                        ops.create(name.to_string(), color as u8);
                                        let (ws_list, active_idx) = ops.list();
                                        Some(serde_json::json!({"type":"workspaces","data":ws_list,"activeIdx":active_idx}).to_string())
                                    } else { None }
                                } else { None }
                            };
                            if let Some(msg_str) = ws_msg {
                                let mut tx = ws_tx.lock().await;
                                let _ = tx.send(warp::ws::Message::text(msg_str)).await;
                            }
                        }
                    }
                    Some("delete_workspace") => {
                        if let Some(idx) = v["idx"].as_u64() {
                            let ws_msg = {
                                if let Ok(mut prov) = workspace_provider.lock() {
                                    if let Some(ref mut ops) = *prov {
                                        ops.delete(idx as usize);
                                        let (ws_list, active_idx) = ops.list();
                                        Some(serde_json::json!({"type":"workspaces","data":ws_list,"activeIdx":active_idx}).to_string())
                                    } else { None }
                                } else { None }
                            };
                            if let Some(msg_str) = ws_msg {
                                let mut tx = ws_tx.lock().await;
                                let _ = tx.send(warp::ws::Message::text(msg_str)).await;
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    fwd.abort();
}

pub fn get_local_ip() -> String {
    use std::net::UdpSocket;
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".into())
}
