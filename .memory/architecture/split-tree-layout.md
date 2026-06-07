---
updated: 2026-06-07
tags: [architecture, ui, layout]
related: [[overview]]
---
# Split Tree Layout System

Terminal panes are organized as a binary tree.

## Node Types

- **Leaf node (pane)**: `{ id, cwd, command, label }`
- **Split node**: `{ type: "split", direction: "horizontal"|"vertical", ratio: 0.0-1.0, first, second }`

A workspace contains either a `splitTree` (complex layout) or flat `panes` array. `panesToTree()` converts flat panes to tree structure.

## Key Functions

- `renderSplitTree()` — recursively builds DOM from tree
- `rerenderTree()` — full re-render of current workspace layout
- `renderWorkspaceList()` — sidebar workspace list

## Focus Navigation

Uses geometric distance to nearest pane (spatial, not grid-based). Allows diagonal navigation.

## Resize

ResizeObserver triggers PTY resize via 100ms debounce to avoid overwhelming the backend.
