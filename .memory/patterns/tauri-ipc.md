---
updated: 2026-06-07
tags: [patterns, tauri, ipc]
related: [[overview], [daemon-architecture]]
---
# Tauri IPC

## Frontend → Backend (invoke)

All terminal commands proxy through Tauri to daemon via named pipe:
`spawn_terminal`, `write_terminal`, `resize_terminal`, `kill_terminal`, `has_terminal`, `get_terminal_buffer`, `list_terminals`, `shutdown_daemon`, `daemon_status`, `sync_workspaces`

Local commands (no daemon): `list_dir`, `read_file`, `open_folder`, `get_cwd`, `get_home_dir`, `browser_open`, `browser_close`, `browser_hide`, `browser_navigate`, `browser_resize`

## Backend → Frontend (events)

- `pty-data-{id}` — terminal output (routed from daemon push)
- `pty-exit-{id}` — terminal exited
- `daemon-close-prompt` — emitted when window close with active terminals

## Terminal ID Format

`term-{timestamp}-{counter}` — generated on frontend.

## DaemonIndicator

Titlebar component polls `daemon_status()` every 5s. Shows green/yellow/red dot + terminal count. Dropdown lists terminals grouped by workspace with kill controls.

## CloseDialog

Listens for `daemon-close-prompt`. Options: Cancel, Hide to tray, Close window, Kill all & quit.
