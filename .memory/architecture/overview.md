---
updated: 2026-06-07
tags: [architecture, overview, tauri, xterm, daemon]
related: [[tech-stack], [split-tree-layout], [daemon-architecture]]
---
# Project Overview

TermHost (repo: termhost; formerly Agent Workspace, before that TerminalHub) is a Windows terminal multiplexer/workspace manager. Users manage multiple terminal workspaces with split pane layouts, run terminals with different working directories and startup commands, zoom individual panes to full workspace, and access a built-in browser panel.

GitHub: https://github.com/viachq/termhost

Two implementations coexist — legacy C# WPF (MainWindow.xaml, Models/, Services/, Controls/) and active Tauri 2.x (src-tauri/ + src/). The Tauri version is the current active one.

## Architecture

- **Frontend**: React + xterm.js in Tauri WebView2
- **Tauri app** (`crates/app/`): thin proxy, no PTY management — forwards all terminal commands to daemon via named pipe
- **Daemon** (`crates/daemon/`): standalone `termhostd.exe` owns all PTY processes, survives app restarts
- **Shared** (`crates/shared/`): IPC protocol types shared between app and daemon

## Entry Points

- **Frontend**: `index.html` → `src/main.tsx` → React `<App />`
- **Tauri app**: `src-tauri/crates/app/src/lib.rs::run()` (Tauri builder, daemon connection)
- **Daemon**: `src-tauri/crates/daemon/src/main.rs` (named pipe server, PTY manager)

## Key Directories

```
src/main.tsx              ← React entry point
src/App.tsx               ← layout shell, hooks, routing
src/store/                ← Zustand stores
src/components/           ← React components
src/hooks/                ← custom hooks (keyboard, zoom, drag, resize, split tree)
src-tauri/Cargo.toml      ← workspace root AND Tauri package
src-tauri/crates/app/     ← Tauri thin proxy (lib.rs, daemon_client.rs)
src-tauri/crates/daemon/  ← standalone PTY daemon
src-tauri/crates/shared/  ← IPC protocol (DaemonRequest/Response)
```

## Build & Dev

```bash
npm run dev           # Tauri dev (vite + Rust backend + daemon)
npm run build         # Tauri production build
```

Launch via desktop shortcut: `C:\Users\viach\Desktop\TermHost.lnk` → `start-dev.bat` → `npm run dev`
