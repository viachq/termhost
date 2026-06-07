# Memory Index

> Auto-maintained catalog. Update after any changes to notes.

## architecture/

- [overview.md](architecture/overview.md) — what TerminalHub is, entry points, build commands
- [tech-stack.md](architecture/tech-stack.md) — Tauri + React + TypeScript + Zustand + CSS Modules
- [split-tree-layout.md](architecture/split-tree-layout.md) — binary tree pane layout, focus nav, resize

## decisions/

- [vanilla-js.md](decisions/vanilla-js.md) — vanilla JS → React migration (completed June 2026)
- [dual-codebase.md](decisions/dual-codebase.md) — WPF legacy vs Tauri [?]

## patterns/

- [state-management.md](patterns/state-management.md) — 7 Zustand stores, localStorage keys, backend state
- [tauri-ipc.md](patterns/tauri-ipc.md) — invoke/emit pattern, event naming

## gotchas/

- [platform-assumptions.md](gotchas/platform-assumptions.md) — hardcoded powershell, Windows paths [?]
- [frontend-monolith.md](gotchas/frontend-monolith.md) — RESOLVED: migrated to React components
- [xterm-css-pitfalls.md](gotchas/xterm-css-pitfalls.md) — global CSS reset breaks cursor coords, scrollbar 15px fallback, zoom issues
- [xterm-scrollbar-strategy.md](gotchas/xterm-scrollbar-strategy.md) — 1px invisible scrollbar trick, focused-pane scrollbar, bg matching

## domain/

- [workspace-model.md](domain/workspace-model.md) — workspace, pane, split, theme concepts
- [similar-projects.md](domain/similar-projects.md) — tmux, cmux, wmux, BridgeSpace context [?]
