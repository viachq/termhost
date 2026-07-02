//! Wire protocol between `termhostd` (client) and `pty-host`
//! (server) — a separate named pipe from the existing app<->daemon one.
//! Same 4-byte-LE-length + JSON framing convention as that protocol, just
//! generic over any AsyncRead/AsyncWrite half so it works for both the
//! server side (pty-host) and the client side (daemon).

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub const PTY_HOST_PIPE_NAME: &str = r"\\.\pipe\termhost-pty-host-v1";
pub const PTY_HOST_MUTEX_NAME: &str = "Global\\TermHostPtyHost\0";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PtyHostTerminalInfo {
    pub id: String,
    pub cwd: String,
    pub command: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum PtyHostRequest {
    Spawn { seq: u64, id: String, cwd: String, command: Option<String>, cols: u16, rows: u16 },
    Write { id: String, data: String },
    Resize { seq: u64, id: String, cols: u16, rows: u16 },
    Kill { seq: u64, id: String },
    List { seq: u64 },
}

#[derive(Serialize, Deserialize, Debug)]
pub enum PtyHostEvent {
    SpawnResult { seq: u64, id: String },
    Ok { seq: u64 },
    Error { seq: u64, message: String },
    ListResult { seq: u64, terminals: Vec<PtyHostTerminalInfo> },
    /// Pushed, not a response to any request — id's PTY produced output.
    Output { id: String, data: String },
    /// Pushed — the process behind id's PTY has exited.
    Exited { id: String },
}

pub async fn read_frame<R: AsyncRead + Unpin>(r: &mut R) -> std::io::Result<Option<Vec<u8>>> {
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

pub async fn write_frame<W: AsyncWrite + Unpin, T: Serialize>(w: &mut W, msg: &T) -> std::io::Result<()> {
    let body = serde_json::to_vec(msg).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let len = (body.len() as u32).to_le_bytes();
    w.write_all(&len).await?;
    w.write_all(&body).await?;
    w.flush().await?;
    Ok(())
}
