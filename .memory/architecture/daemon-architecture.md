---
updated: 2026-06-07
tags: [architecture, daemon, ipc, pty]
related: [[overview], [tauri-ipc]]
---
# Sidecar Daemon Architecture

PTY processes live in a standalone `terminalhub-daemon.exe`, independent of the Tauri app. This means terminals survive Tauri restarts (dev hot-reload, window close/reopen).

## IPC: Named Pipes

Pipe: `\\.\pipe\terminalhub-pty-v1`
Protocol: length-prefixed JSON (`[u32 LE length][JSON payload]`)
Requests have `seq: u32` for correlation; push messages (Output, TerminalExited) have no seq.

## Cargo Workspace

Root `src-tauri/Cargo.toml` is both `[workspace]` and `[package]` (required for Tauri CLI).
- `[lib] path = "crates/app/src/lib.rs"`
- `[[bin]] path = "crates/app/src/main.rs"`
- Members: `[".", "crates/daemon", "crates/shared"]`, excludes `["crates/app"]`

## Daemon (`crates/daemon/`)

- Named pipe server with accept loop
- `PtyManager` — ConPTY via portable-pty 0.8
- `BufferManager` — 128KB ring buffer per terminal for replay on reconnect
- `DaemonState` — terminal_infos, workspace_data, client tracking
- Idle watcher: 5 min timeout when 0 clients + 0 terminals
- PID file: `%LOCALAPPDATA%\TerminalHub\daemon.pid`
- WS server: stubs (not yet migrated)

## App (`crates/app/`)

- `DaemonClient` — async named pipe client, seq-based request/response, push channel
- `lib.rs` — all terminal commands proxy to daemon; browser commands stay local
- `connect_to_daemon()`: tries pipe 3×, then launches daemon exe, retries 15×
- Push handler routes Output → `app.emit("pty-data-{id}")`, TerminalExited → `app.emit("pty-exit-{id}")`
- Tray icon with menu: Open, Kill all, Shutdown

## Reconnect Flow

1. App connects to existing daemon pipe
2. `ListTerminals` → get all live terminal IDs
3. Frontend: `hasTerminal(id)` → true → `getTerminalBuffer(id)` → replay in xterm.js
4. `SubscribeAll` → output streaming resumes
5. Existing TerminalInstance.tsx reconnect logic works unchanged

## Protocol (`crates/shared/`)

DaemonRequest: Spawn, Write, Resize, Kill, HasTerminal, GetBuffer, ListTerminals, SubscribeAll, SyncWorkspaces, Ping, Shutdown, StartWsServer, StopWsServer, WsServerStatus
DaemonResponse: Ok, Error, SpawnResult, HasResult, BufferData, TerminalList, Output, TerminalExited, WsStatus, Pong
