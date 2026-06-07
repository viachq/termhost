---
updated: 2026-06-07
tags: [architecture, stack, dependencies]
related: [[overview]]
---
# Tech Stack

## Frontend
- **React 18** + **TypeScript** — hooks only, no class components
- **Zustand** — lightweight state management (7 stores)
- **CSS Modules** (`.module.css`) per component + global CSS custom properties for theming
- **Vite 6.x** + `@vitejs/plugin-react@^4` — build tool, dev server (port 1420, HMR)
- **xterm.js 5.5.0** — terminal emulation (+ fit, search, web-links addons)
- **Monaco Editor 0.52.2** — file viewer (lazy-loaded)
- **marked 18.0.5** — Markdown rendering
- **Tauri API v2.11.0** — IPC to backend

## Backend (Rust)
- **Tauri 2.x** — desktop framework
- **portable-pty 0.8** — cross-platform PTY (ConPTY on Windows)
- **tokio 1.x** — async runtime
- **warp 0.3** — WebSocket server for mobile client
- **serde/serde_json** — serialization

## Legacy (not active)
- **C# 11 / .NET 8.0** — WPF desktop app embedding Alacritty
