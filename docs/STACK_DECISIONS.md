# Stack Decisions & Research Summary

## Bridgemind Stack Analysis (March 2026)

Bridgemind builds four products. Here is their confirmed stack:

### BridgeSpace (Desktop Terminal App)
- **Tauri v2** + **Rust** backend
- **React 19** frontend
- **xterm.js** with WebGL GPU acceleration
- **node-pty** for shell spawning
- OSC 133 shell integration (Warp-style command blocks)
- Up to 16 parallel agent panes
- Integrated Kanban, editor panes, multi-agent swarm orchestration
- 20+ themes
- Subscription: $16–$40/month

### BridgeVoice (Voice-to-Code Desktop App)
- **Tauri 2.0** + **Rust**
- Local STT via **whisper.cpp** compiled in Rust (75MB–3.1GB models)
- Cloud STT via Groq Whisper Large-v3-Turbo
- Sub-500ms latency, universal text injection
- Subscription: Pro tier only ($40/month)

### BridgeMCP (MCP Server)
- Local MCP server on user's machine
- Encrypted API communication
- Supports Claude Code, Cursor, Windsurf, BridgeSpace
- Shared knowledge base (50KB/task), live sync across editors

### BridgeCode (CLI — not yet released)
- npm package (`npm install -g bridgecode`)
- Node.js / TypeScript
- Multi-file AI code generation

### Web Platform (bridgemind.ai)
- Next.js + Tailwind CSS + Redux
- Hosted on Vercel

---

## Industry Terminal App Stacks

| App | Framework | Frontend | Backend | Terminal |
|-----|-----------|----------|---------|----------|
| Wave Terminal | Electron | React + Jotai | Go | xterm.js v6 |
| Hyper | Electron | React + Redux | Node.js | xterm.js + WebGL |
| Tabby | Electron | Angular | Node.js | xterm.js + WebGL |
| Cursor | Electron (VS Code fork) | TypeScript | Node.js + Cloud | xterm.js |
| Warp | Custom Rust | Custom GPU UI | Rust | Custom GPU-rendered |
| Zed | Custom Rust (GPUI) | GPUI | Rust | Custom |
| Alacritty | Custom Rust | OpenGL | Rust | portable-pty |
| WezTerm | Custom Rust | GPU-accelerated | Rust | portable-pty |
| BridgeSpace | Tauri v2 | React 19 | Rust | xterm.js + WebGL |

---

## Our Decision: Electron + Upgraded Stack

### Why Electron over Tauri v2

1. **Working MVP already exists** — rewriting the runtime gains nothing right now
2. **node-pty on Electron is battle-tested** — used by VS Code, Wave, Hyper, Tabby
3. **tauri-plugin-pty is young** — fewer users, less documentation, more edge cases on Windows
4. **Ecosystem depth** — Electron has solutions for every problem we will hit
5. **No Rust requirement** — faster iteration in pure TypeScript
6. **Every major terminal app except BridgeSpace uses Electron** — proven path
7. **Memory/bundle size is not our bottleneck** — features are

Tauri v2 is a valid future migration target once the product stabilizes. Not now.

### Chosen Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop runtime | **Electron** (keep) | Proven, working MVP |
| Build tooling | **electron-vite** | Replace current manual dev script, proper main/preload/renderer separation, fast HMR |
| Frontend framework | **React 19** (keep) | Already using it |
| Language | **TypeScript** (keep) | Already using it |
| Terminal rendering | **xterm.js v6** (keep) + **xterm-addon-webgl** | GPU-accelerated rendering, smooth scrolling |
| PTY | **node-pty** (keep) | Battle-tested |
| State management | **Zustand** | Replace prop-drilling through App.tsx, minimal boilerplate, great TS support |
| Styling | **Tailwind CSS v4** + **shadcn/ui** | Fast UI iteration, production-ready accessible components |
| Data persistence | **better-sqlite3** | Replace localStorage, proper workspace/template storage, queryable |
| AI integration | **Anthropic SDK** + **OpenAI SDK** in main process | LLM access from main process, stream to renderer |
| MCP | **@modelcontextprotocol/sdk** | MCP client for tool integration |
| Voice (later) | **Whisper API** (cloud) + **Web Speech API** (offline fallback) | Voice-to-code like BridgeVoice |
| Packaging | **electron-builder** | Cross-platform builds, auto-updates |

### What We Remove / Replace

| Current | Replacement | Reason |
|---------|-------------|--------|
| Hand-written App.css | Tailwind CSS v4 | Faster styling, utility-first |
| State via useState + prop drilling | Zustand stores | Scales better, cleaner |
| localStorage for templates | SQLite via better-sqlite3 | Queryable, reliable, no size limits |
| scripts/dev.mjs (manual Vite+Electron) | electron-vite | Standard tooling, handles main/preload/renderer |

---

## Next Steps — Ordered

### Phase 1: Stack Upgrade (foundation)

1. **Install and configure Tailwind CSS v4**
   - Add tailwind, configure with Vite
   - Migrate App.css to utility classes
   - Install shadcn/ui, set up component primitives (button, input, select, tabs)

2. **Add Zustand for state management**
   - Create `src/stores/workspace-store.ts` — workspaces, active workspace, CRUD
   - Create `src/stores/template-store.ts` — templates, save/load
   - Refactor App.tsx to consume stores instead of local useState

3. **Add xterm-addon-webgl**
   - Install `@xterm/addon-webgl`
   - Load in TerminalPane.tsx for GPU-accelerated rendering
   - Keep canvas renderer as fallback

4. **Add better-sqlite3 for persistence**
   - Create database in Electron main process (user data directory)
   - Tables: workspaces, templates, settings
   - IPC handlers for CRUD operations
   - Migrate from localStorage

### Phase 2: Core Features

5. **Add/remove/duplicate panes**
   - Add pane button in workspace view
   - Remove pane (with confirmation if live session)
   - Duplicate pane (clone config, start new PTY)

6. **Workspace persistence**
   - Save workspace state to SQLite on changes
   - Reopen last session on app start
   - Workspace export/import as JSON

7. **Better template management**
   - Edit template name/description
   - Delete custom templates
   - Reorder templates

8. **Keyboard shortcuts**
   - Focus pane by number (Ctrl+1 through Ctrl+9)
   - New workspace (Ctrl+N)
   - Close workspace (Ctrl+W)
   - Restart pane (Ctrl+Shift+R)

### Phase 3: Polish

9. **Theming system**
   - Dark theme variations (already dark, add options)
   - Terminal color schemes (Dracula, One Dark, Catppuccin, etc.)
   - Per-pane or per-workspace theme

10. **Warp-style command blocks**
    - OSC 133 shell integration
    - Collapsible command output blocks
    - Visual separation between commands

11. **Drag and resize panes**
    - Replace fixed grid with resizable layout
    - Drag panes to reorder
    - Save layout dimensions per workspace

### Phase 4: AI Integration

12. **MCP client**
    - Implement MCP client in main process using @modelcontextprotocol/sdk
    - Connect to local MCP servers via stdio
    - Expose tools/resources to renderer

13. **LLM integration**
    - Anthropic SDK in main process
    - Chat/command panel per pane or global
    - Stream responses to terminal or side panel

14. **Voice input (BridgeVoice equivalent)**
    - Whisper API integration for cloud transcription
    - Web Speech API for offline commands
    - Push-to-talk hotkey, inject text into focused pane

### Phase 5: Distribution

15. **electron-builder setup**
    - Windows installer (.exe / .msi)
    - Auto-update via electron-updater
    - Code signing

16. **Migrate to electron-vite**
    - Replace scripts/dev.mjs with electron-vite config
    - Proper main/preload/renderer build pipeline
    - This can happen earlier if it becomes painful
