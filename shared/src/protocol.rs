use serde::{Deserialize, Serialize};

// --- Shared types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalInfo {
    pub id: String,
    pub label: String,
    pub cwd: String,
    pub command: String,
    pub title: String,
    pub workspace: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceInfo {
    pub name: String,
    pub color: u8,
    #[serde(rename = "terminalCount")]
    pub terminal_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceData {
    pub name: String,
    pub color: u8,
    pub terminal_ids: Vec<String>,
}

// --- IPC Protocol ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DaemonRequest {
    Spawn {
        seq: u32,
        id: String,
        cwd: String,
        command: Option<String>,
        cols: u16,
        rows: u16,
    },
    Write {
        id: String,
        data: String,
    },
    Resize {
        seq: u32,
        id: String,
        cols: u16,
        rows: u16,
    },
    Kill {
        seq: u32,
        id: String,
    },
    HasTerminal {
        seq: u32,
        id: String,
    },
    GetBuffer {
        seq: u32,
        id: String,
    },
    ListTerminals {
        seq: u32,
    },
    SubscribeAll,
    StartWsServer {
        seq: u32,
        port: u16,
    },
    StopWsServer {
        seq: u32,
    },
    WsServerStatus {
        seq: u32,
    },
    SyncWorkspaces {
        seq: u32,
        workspaces: Vec<WorkspaceData>,
        active_idx: usize,
    },
    Ping {
        seq: u32,
    },
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DaemonResponse {
    Ok { seq: u32 },
    Error { seq: u32, message: String },
    SpawnResult { seq: u32, id: String },
    HasResult { seq: u32, exists: bool },
    BufferData { seq: u32, id: String, data: String },
    TerminalList { seq: u32, terminals: Vec<TerminalInfo> },
    Output { id: String, data: String },
    TerminalExited { id: String, code: Option<i32> },
    WsStatus { seq: u32, running: bool, ip: String },
    Pong { seq: u32 },
    ShowWindow,
}

// --- Frame encoding/decoding ---

pub fn encode_frame(msg: &[u8]) -> Vec<u8> {
    let len = msg.len() as u32;
    let mut frame = Vec::with_capacity(4 + msg.len());
    frame.extend_from_slice(&len.to_le_bytes());
    frame.extend_from_slice(msg);
    frame
}

pub fn encode_message<T: Serialize>(msg: &T) -> Result<Vec<u8>, serde_json::Error> {
    let json = serde_json::to_vec(msg)?;
    Ok(encode_frame(&json))
}
