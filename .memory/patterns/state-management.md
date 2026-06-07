---
updated: 2026-06-07
tags: [patterns, state]
related: [[overview]]
---
# State Management

Frontend: **Zustand** stores (7 total). Backend: `Arc<Mutex<>>` for shared state.

## Zustand Stores

- `settingsStore` — uiTheme, activeThemeKey, font, cursor, scale (each setter persists to localStorage)
- `workspaceStore` — workspaces[], activeWorkspaceIdx, homeDir
- `terminalStore` — splitRoot (tree), terminalOrder, focusedTerminalId + module-level `terminalRefs = Map<string, TerminalRef>` (imperative refs outside Zustand)
- `panelStore` — sidebar/files/browser/search/notification visibility, activeView
- `fileViewerStore` — fileTabs[], activeTabId
- `notificationStore` — notifications[], sound
- `fileBrowserStore` — currentBrowsePath, detectedDrives

## localStorage Keys

All prefixed `terminalhub-`:
- `workspaces-v2` — workspace configs (JSON array)
- `active-ws` — active workspace index
- `ui-theme`, `theme`, `fontsize`, `fontfamily`, `cursorstyle`, `uiscale` — UI settings

## Backend State

- `PtyManager` — HashMap of terminal ID → PTY instance
- `tokio::sync::broadcast` — multicast PTY output to WebSocket clients
- Shutdown via `oneshot::channel`
