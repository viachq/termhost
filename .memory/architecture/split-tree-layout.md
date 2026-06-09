---
updated: 2026-06-07
tags: [architecture, ui, layout]
related: [[overview]]
---
# Split Tree Layout System

Terminal panes are organized as a binary tree per workspace.

## Node Types

- **Leaf**: `{ type: "leaf", id, _cwd?, _command? }`
- **Split**: `{ type: "split", direction: "horizontal"|"vertical", ratio: 0.1-0.9, first, second }`

## Key Files

- `src/hooks/useSplitTree.ts` — panesToTree, instantiateTree, splitPaneInTree, removePaneFromTree
- `src/components/splitpane/SplitContainer.tsx` — recursive tree renderer, zoom support
- `src/components/splitpane/SplitDivider.tsx` — draggable 1px divider
- `src/hooks/useDividerDrag.ts` — mouse tracking, ratio clamped [0.1, 0.9]

## Zoom (Maximize)

`zoomedTerminalId` in terminalStore. When set, SplitContainer renders only that leaf at full size. Toggle via Ctrl+Shift+M or maximize button in PaneHeader. Zoom resets on workspace switch or zoomed terminal close.

## Pane Header

Floating toolbar (top-right, visible on hover): split-H, split-V, maximize/restore, close. Split buttons hidden when zoomed. Maximize hidden when single pane.

## Focus Navigation

Ctrl+Alt+Arrow — geometric distance to nearest pane (spatial, not grid-based).

## Keyboard Shortcuts

- Ctrl+Shift+H — split horizontal
- Ctrl+Shift+J — split vertical
- Ctrl+Shift+M — toggle zoom/maximize
- Ctrl+W — close pane
- Ctrl+Alt+Arrow — navigate focus
- Ctrl+Tab / Ctrl+Shift+Tab — cycle terminals
- Ctrl+1-9 — jump to terminal
- F11 — fullscreen
