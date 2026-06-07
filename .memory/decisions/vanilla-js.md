---
updated: 2026-06-07
tags: [decisions, frontend, migration]
related: [[tech-stack]]
---
# Vanilla JS → React Migration (completed)

Originally the frontend was vanilla JavaScript with direct DOM manipulation (~1900 lines in one file). Migrated to React 18 + TypeScript + Zustand + CSS Modules in June 2026.

Reasons for migration: no component isolation, global state interdependencies, hard to scale features. The Tauri Rust backend was kept unchanged — only the frontend was rewritten.
