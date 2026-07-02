---
updated: 2026-06-07
tags: [domain, workspace, terminal]
related: [[split-tree-layout], [state-management]]
---
# Workspace & Terminal Model

## Core Concepts

| Concept | Meaning |
|---------|---------|
| **Workspace** | Named container for terminals (e.g., "Claude Dev", "Single Shell") |
| **Pane** | Individual terminal instance with cwd, command, label |
| **Split** | Layout node dividing space horizontally or vertically |
| **Terminal ID** | Unique: `term-{timestamp}-{counter}` |
| **Focus** | Active pane receiving keyboard input |
| **Activity Marker** | Pane tab highlights when background terminal produces output |
| **Theme** | xterm.js color palette (built-in: TermHost, CGA, Ubuntu) |
| **Mobile Client** | Remote WebSocket connection for accessing terminals from phone |
| **File Tab** | Open file in editor (Monaco for code, marked for Markdown) |

## Configuration Format

See `example-config.json` for workspace structure with commands like `claude` and `codex`.
