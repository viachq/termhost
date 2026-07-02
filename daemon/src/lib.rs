//! Shared between the two daemon binaries: `termhostd` (the
//! WS/HTTP server and all business logic — restarted often during dev/updates)
//! and `pty-host` (owns the actual PTY processes — should almost never need
//! restarting, so terminals survive a daemon update instead of dying with it).

pub mod pty_client;
pub mod pty_ipc;
pub mod pty_manager;
