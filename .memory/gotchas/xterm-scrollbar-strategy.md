---
updated: 2026-06-07
tags: [gotchas, xterm, scrollbar, css]
related: [[xterm-css-pitfalls]]
---
# xterm Scrollbar Strategy

## Current Approach

Three-tier scrollbar CSS:

1. **Global**: `::-webkit-scrollbar { width: 0; height: 0; }` — hide all scrollbars by default
2. **xterm viewport**: `.xterm .xterm-viewport::-webkit-scrollbar { width: 1px; }` with transparent track/thumb — 1px invisible scrollbar so xterm measures a real width (avoids 15px fallback)
3. **Focused pane**: `[data-pane-focused="true"] .xterm .xterm-viewport::-webkit-scrollbar { width: 6px; }` — visible scrollbar on active terminal only

## Why Not `core.viewport.scrollBarWidth = 0`

Directly overriding the scrollBarWidth property on xterm's viewport object causes desync between render dimensions and coordinate calculations. The 1px CSS approach is safer because xterm reads the real measured value.

## Background Color Matching

Since xterm renders only whole character cells, there's always a sub-cell-width remainder on the right. The container and pane element backgrounds are set to match the terminal theme background (`el.style.background = themeBg`) so the gap is invisible.
