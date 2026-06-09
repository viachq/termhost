---
updated: 2026-06-07
tags: [patterns, state]
related: [[overview]]
---
# State Management

Frontend: **Zustand** stores. Backend: daemon owns PTY state; Tauri app is stateless proxy.

## Zustand Stores

- `settingsStore` — uiTheme, activeThemeKey, font, cursor, scale (each setter persists to localStorage)
- `workspaceStore` — workspaces[], activeWorkspaceIdx, homeDir; syncs workspace names to daemon
- `terminalStore` — splitRoot (tree), terminalOrder, focusedTerminalId, zoomedTerminalId, titles + module-level `terminalRefs = Map<string, TerminalRef>`, `workspaceTrees = Map<number, TreeNode>`
- `panelStore` — sidebar/files/browser/search/notification visibility, activeView, fullscreen
- `fileViewerStore` — fileTabs[], activeTabId
- `notificationStore` — notifications[], sound
- `fileBrowserStore` — currentBrowsePath, detectedDrives
- `browserStore` — browser tabs for built-in webview

## localStorage Keys

All prefixed `terminalhub-`:
- `workspaces-v2` — workspace configs (JSON array)
- `active-ws` — active workspace index
- `ui-theme`, `theme`, `fontsize`, `fontfamily`, `cursorstyle`, `uiscale` — UI settings

## Backend State (Daemon)

- `PtyManager` — HashMap of terminal ID → PTY instance
- `BufferManager` — 128KB ring buffer per terminal
- `terminal_infos` — HashMap of terminal metadata (id, label, cwd, command, title, workspace)
- `workspace_data` — synced from frontend for enriching terminal listings
