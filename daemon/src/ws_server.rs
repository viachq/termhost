use futures_util::{SinkExt, StreamExt};
use std::io::Write;
use std::sync::Arc;
use agent_workspace_shared::protocol::*;
use tokio::sync::broadcast;
use warp::Filter;
use warp::multipart::FormData;
use futures_util::TryStreamExt;

use crate::DaemonState;

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

    let html_route = warp::path::end()
        .map(|| warp::reply::html(include_str!("../../dist-mobile/mobile.html")));

    let st = state.clone();
    let ws_route = warp::path("ws")
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let s = st.clone();
            ws.on_upgrade(move |socket| handle_ws(socket, s))
        });

    let routes = html_route.or(ws_route);

    let (_, server) = warp::serve(routes)
        .bind_with_graceful_shutdown(([0, 0, 0, 0], port), async {
            let _ = shutdown_rx.await;
        });

    tokio::spawn(server);

    let ip = get_local_ip();
    let addr = format!("{}:{}", ip, port);
    (WsServerHandle { shutdown_tx }, addr)
}

async fn handle_ws(ws: warp::ws::WebSocket, state: Arc<DaemonState>) {
    let (mut ws_tx, mut ws_rx) = ws.split();

    let infos_msg = {
        let infos = state.terminal_infos.lock().unwrap();
        let simple: Vec<serde_json::Value> = infos.iter().map(|t| {
            serde_json::json!({"id": t.id, "label": t.label})
        }).collect();
        serde_json::json!({"type": "terminals", "data": simple}).to_string()
    };
    let _ = ws_tx.send(warp::ws::Message::text(infos_msg)).await;

    let mut broadcast_rx = state.broadcast_tx.subscribe();
    let ws_tx = Arc::new(tokio::sync::Mutex::new(ws_tx));
    let ws_tx2 = ws_tx.clone();

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
                Ok(crate::BroadcastMsg::ShowWindow) => {
                    // Not relevant for WS clients
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
                    Some("clipboard") => {
                        if let Some(text) = v["data"].as_str() {
                            let ok = arboard::Clipboard::new().and_then(|mut cb| cb.set_text(text)).is_ok();
                            let ack = serde_json::json!({"type":"clipboard_ok","ok":ok}).to_string();
                            let mut tx = ws_tx.lock().await;
                            let _ = tx.send(warp::ws::Message::text(ack)).await;
                        }
                    }
                    Some("input") => {
                        if let (Some(id), Some(data)) = (v["id"].as_str(), v["data"].as_str()) {
                            let writer = {
                                let mgr = state.pty_manager.lock().unwrap();
                                mgr.get_writer(id).ok()
                            };
                            if let Some(w) = writer {
                                if let Ok(mut w) = w.lock() {
                                    let _ = w.write_all(data.as_bytes());
                                }
                            }
                        }
                    }
                    Some("resize") => {
                        // WS clients (mobile) must never resize the shared PTY
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
                    Some("list") => {
                        let list_msg = {
                            let infos = state.terminal_infos.lock().unwrap();
                            let simple: Vec<serde_json::Value> = infos.iter().map(|t| {
                                serde_json::json!({"id": t.id, "label": t.label})
                            }).collect();
                            serde_json::json!({"type":"terminals","data":simple}).to_string()
                        };
                        let mut tx = ws_tx.lock().await;
                        let _ = tx.send(warp::ws::Message::text(list_msg)).await;
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
                                if let Some(ws) = ws_data.get(idx as usize) {
                                    let filtered: Vec<serde_json::Value> = infos.iter()
                                        .filter(|t| ws.terminal_ids.contains(&t.id))
                                        .map(|t| serde_json::json!({"id": t.id, "label": t.label}))
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
                    _ => {}
                }
            }
        }
    }

    fwd.abort();
}

pub fn get_local_ip_pub() -> String {
    get_local_ip()
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
