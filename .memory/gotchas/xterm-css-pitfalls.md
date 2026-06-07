---
updated: 2026-06-07
tags: [gotchas, xterm, css, cursor, scrollbar]
related: [[tech-stack], [overview]]
---
# xterm.js CSS Pitfalls

## Global CSS Reset + xterm

`* { margin: 0; padding: 0; box-sizing: border-box; }` was suspected of breaking xterm coordinates. GitHub issues #3579, #1283, #993 report problems with global resets. However, the actual root cause turned out to be `body.style.zoom` (see below). The global reset alone does NOT break xterm in practice — tested and confirmed.

## Scrollbar Fallback Width = 15px Gap

When `::-webkit-scrollbar { width: 0 }` hides the scrollbar globally, xterm's `Viewport.ts:70` measures `offsetWidth - scrollArea.offsetWidth = 0` and falls back to `FALLBACK_SCROLL_BAR_WIDTH = 15`. FitAddon then subtracts 15px from available width, leaving a visible gap on the right side.

**Key files**:
- `node_modules/@xterm/xterm/src/browser/Viewport.ts:15,70` — fallback constant and measurement
- `node_modules/@xterm/addon-fit/src/FitAddon.ts:67-88` — `availableWidth = parentElementWidth - elementPaddingHor - scrollbarWidth`

**Fix applied**: Use 1px transparent scrollbar for `.xterm .xterm-viewport` so xterm measures a real 1px width. Show 6px scrollbar on focused pane only. Remaining ~1-9px gap is due to xterm rendering only whole character cells — masked by matching container background to terminal theme background.

## CSS Zoom Breaks xterm Coordinates (ROOT CAUSE)

`document.body.style.zoom` is the primary cause of both cursor offset and width gap issues. CSS zoom scales DOM visually but xterm.js canvas coordinates (getBoundingClientRect, mouse events) don't account for zoom factor. This causes:
- Mouse click/selection offset (click one line, different line gets selected)
- FitAddon calculates wrong grid size → gap on right/bottom
- Coordinates desync between visual position and canvas position

**Fix**: Replace `body.style.zoom` with Tauri's webview-level zoom: `getCurrentWebview().setZoom(scale)` from `@tauri-apps/api/webview`. Webview zoom is handled by the browser engine itself, so xterm.js (and all DOM APIs) see consistent coordinates.

## .xterm Width/Height 100% Breaks Cursor

Setting `.xterm { width: 100%; height: 100% }` makes the .xterm container larger than the canvas content. Since `.xterm-viewport` is positioned absolute with `top:0; bottom:0`, it stretches to fill, creating a mismatch between the viewport size and the actual rendered content area. This breaks SelectionService coordinate mapping.

**Fix**: Don't set width/height on `.xterm` — let xterm manage its own sizing via FitAddon.

## WebGL Renderer Inline Styles

WebglRenderer.ts sets inline `width` and `height` on `.xterm-screen` (lines 191-192). Any CSS that conflicts with these inline styles will cause rendering/coordinate issues.
