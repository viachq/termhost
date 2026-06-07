---
updated: 2026-06-07
tags: [patterns, tauri, ipc]
related: [[overview]]
---
# Tauri IPC

## Frontend → Backend
`invoke("command_name", { args })` with async/await.

Available commands: `spawn_terminal`, `write_to_terminal`, `resize_terminal`, `kill_terminal`, `list_dir`, `read_file`, `start_ws_server`, `stop_ws_server`, `open_in_browser`.

## Backend → Frontend
Events via `app.emit()`. Terminal output: `pty-data-{id}` per terminal.

## Terminal ID Format
`term-{timestamp}-{counter}` — generated on frontend.
