---
updated: 2026-06-07
tags: [architecture, overview, tauri, xterm]
related: [[tech-stack], [split-tree-layout]]
---
# Project Overview

TerminalHub is a cross-platform terminal multiplexer/workspace manager. Users can manage multiple terminal workspaces with split pane layouts, run terminals with different working directories and startup commands, edit/view files (Monaco + Markdown), and access terminals remotely via WebSocket on mobile.

Two implementations coexist in the repo — legacy C# WPF (MainWindow.xaml, Models/, Services/, Controls/) and active Tauri (src-tauri/ + src/). The Tauri version is the current active one; WPF is legacy/experimental.

## Entry Points

- **Frontend**: `index.html` → `src/main.tsx` → React `<App />`
- **Backend**: `src-tauri/src/lib.rs::run()` (Tauri builder setup)
- **Legacy WPF**: `MainWindow::OnLoaded()` (not actively developed)

## Key Directories

```
src/main.tsx              ← React entry point
src/App.tsx               ← layout shell, hooks, routing
src/store/                ← 7 Zustand stores
src/components/           ← React components (titlebar, sidebar, terminal, splitpane, panels, fileviewer, pages, search)
src/hooks/                ← custom hooks (keyboard, zoom, drag, resize, split tree)
src/constants/            ← themes, presets, file icons
src/styles/               ← global.css, markdown.css
src-tauri/src/lib.rs      ← Tauri commands, file ops, WS server mgmt
src-tauri/src/pty_manager.rs  ← PTY process management
src-tauri/src/ws_server.rs    ← WebSocket server for mobile
```

## Build & Dev

```bash
npm run dev           # Tauri dev (vite:dev + Rust backend + window)
npm run build         # Tauri production build
npm run vite:dev      # Frontend only (localhost:1420)
npm run vite:build    # Frontend build to dist/
```
