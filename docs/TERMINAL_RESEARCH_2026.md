# Comprehensive Terminal & Workspace App Research for Multi-Agent AI Coding Workflows
**Research Date: March 28, 2026**

---

## TABLE OF CONTENTS
1. [Executive Summary](#executive-summary)
2. [Comparison Matrix](#comparison-matrix)
3. [Detailed Reviews (27+ apps)](#detailed-reviews)
4. [Additional Multi-Agent Tools Discovered](#additional-tools)
5. [Recommendations by Use Case](#recommendations)

---

## EXECUTIVE SUMMARY

The terminal landscape in 2026 has split into three tiers:
- **AI-Native Workspaces**: Warp, Wave, BridgeSpace, Cursor, VS Code, Zed -- built around multi-agent orchestration
- **Performance Terminals**: Alacritty, Ghostty, Kitty, WezTerm, Rio -- GPU-accelerated, minimal overhead
- **Traditional/Legacy Terminals**: tmux, iTerm2, Windows Terminal, ConEmu, Cmder, MobaXterm -- stable, proven, extensible

For **multi-agent AI coding workflows**, the standout tools are: **Warp** (best integrated AI terminal), **tmux + NTM/Claude Squad** (best open-source orchestration), **Wave Terminal** (best open-source AI terminal), **VS Code** (best IDE-based multi-agent platform), and **BridgeSpace** (purpose-built for agentic vibe coding).

---

## COMPARISON MATRIX

| App | Multi-Pane | Save/Restore Layout | Auto-Run on Startup | AI Integration | Free/OSS | RAM Usage | Code Editor | Profiles/Templates | Voice Input | MCP Support | GitHub Stars | Last Updated | Platform |
|-----|-----------|---------------------|---------------------|----------------|----------|-----------|-------------|-------------------|-------------|-------------|-------------|-------------|----------|
| **Wave Terminal** | Yes (drag & drop blocks) | Yes (Workspaces + Tabs) | Yes (wsh commands) | Yes (BYOK: OpenAI, Claude, Gemini, Ollama) | Yes, Apache-2.0 | ~200-300 MB (Electron) | Yes (built-in editor) | Yes (Workspaces) | No | No (community MCP server exists) | ~10k+ | Mar 2026 (v0.14.4) | Win/Mac/Linux |
| **Warp Terminal** | Yes (split panes) | Yes (session save/restore) | Yes (preconfigured sessions) | Yes (native, deep: suggestions, agents, debugging) | Freemium, closed-source | ~150-250 MB (Rust/Metal) | No | Yes (Workflows/Sessions) | No | **Yes** (full MCP support) | ~26k | Mar 2026 | Win/Mac/Linux |
| **Tabby (Terminus)** | Yes (split panes) | Yes (saved layouts) | Yes (profiles) | Yes (MCP server for AI assistants) | Yes, MIT | ~200-350 MB (Electron) | No | Yes (extensive profiles) | No | **Yes** (MCP server) | 69.8k | Jan 2026 (v1.0.230) | Win/Mac/Linux |
| **Hyper** | Yes (split panes via plugin) | No (manual) | Yes (via config) | No | Yes, MIT | 300-400 MB (Electron) | No | Yes (multiple profiles) | No | No | ~44.6k | Sporadic | Win/Mac/Linux |
| **Windows Terminal** | Yes (split panes, broadcast) | Partial (issue #8590 open) | Yes (command line args, profiles) | No (native) | Yes, MIT | ~50-100 MB (C++) | No | Yes (JSON profiles) | No | No | 102.4k | Mar 2026 | Windows only |
| **Zellij** | Yes (floating + stacked panes) | Yes (layouts in KDL) | Yes (layout files) | No (native) | Yes, MIT | ~50-200 MB (Rust, can spike to GB) | No | Yes (layouts) | No | No | ~29.9k | Mar 2026 (v0.44) | Mac/Linux (no Windows) |
| **tmux** | Yes (panes + windows) | Yes (plugins: tmux-resurrect) | Yes (.tmux.conf) | No (but NTM, Claude Squad, AMUX extend it) | Yes, ISC | ~5-15 MB (C) | No | Yes (session configs) | No | No | 43.7k | Mar 2026 | Mac/Linux (WSL on Win) |
| **iTerm2** | Yes (split panes) | Yes (arrangements) | Yes (profiles + triggers) | Yes (built-in LLM chat, Ollama) | Yes, GPL-2.0 | 500 MB - 3 GB | No | Yes (extensive profiles) | No | No | ~15.8k | 2026 | macOS only |
| **Alacritty** | No (single window only) | No | Yes (via config) | No | Yes, Apache-2.0 | ~30 MB | No | No (single config) | No | No | 58.5k | 2026 | Win/Mac/Linux |
| **WezTerm** | Yes (split panes, tabs) | Yes (Lua scripting) | Yes (wezterm.lua startup) | No | Yes, MIT | ~320 MB (Rust) | No | Yes (Lua-based) | No | No | ~23.3k | 2026 (v0.17.1) | Win/Mac/Linux |
| **Kitty** | Yes (splits via kitten) | Yes (session files) | Yes (startup sessions) | No | Yes, GPL-3.0 | 60-100 MB | No | Yes (sessions) | No | No | ~23.2k | 2026 | Mac/Linux (no Windows) |
| **Ghostty** | Yes (splits) | No (not yet) | Yes (via config) | No | Yes, MIT (Hack Club 501c3) | ~60-200 MB (Zig) | No | No (single config) | No | No | 45.2k | Mar 2026 (v1.3.0) | Mac/Linux (no Windows yet) |
| **Rio** | Yes (split panes) | No | Yes (via config) | No | Yes, MIT | ~40-80 MB (Rust/WebGPU) | No | No | No | No | 6.4k | 2026 (rewrite to v1.0) | Win/Mac/Linux |
| **Contour** | No | No | Yes (via config) | No | Yes, Apache-2.0 | ~30-60 MB (C++) | No | Yes (profiles) | No | No | ~2.9k | 2026 | Win/Mac/Linux/BSD |
| **Cmder** | Yes (via ConEmu) | Yes (tasks) | Yes (startup tasks) | No | Yes, MIT | ~50-100 MB | No | Yes (tasks/profiles) | No | No | ~26.8k | 2026 | Windows only |
| **ConEmu** | Yes (tabs + splits) | Yes (tasks) | Yes (tasks) | No | Yes, BSD | ~30-60 MB (C++) | No | Yes (tasks) | No | No | ~8.7k (est.) | Low activity | Windows only |
| **MobaXterm** | Yes (tabs, multi-exec) | Yes (sessions) | Yes (macros) | No | Freemium, closed-source | ~100-200 MB | No | Yes (sessions) | No | No | N/A (not on GitHub) | 2026 | Windows only |
| **Termius** | Yes (tabs) | Yes (synced hosts) | Yes (snippets) | Yes (AI autocomplete, snippets) | Freemium, closed-source | ~150-250 MB | No | Yes (host groups) | No | No | N/A (not on GitHub) | Mar 2026 | Win/Mac/Linux/iOS/Android |
| **Blink Shell** | Yes (tabs) | Yes (hosts) | Yes (startup commands) | Partial (AI Writing Tools) | Freemium, open-source core | ~50-100 MB | Yes (Vim built-in) | Yes (hosts) | No | No | 6.6k | 2026 | iOS/iPadOS only |
| **Amazon Q (Fig)** | No (overlay on existing terminal) | No | Yes (autocomplete on startup) | **Yes** (deep: autocomplete, chat, agents) | Yes, MIT + Apache-2.0 | ~50-150 MB (overlay) | No | No | No | No | N/A (varies) | Mar 2026 | Win/Mac/Linux |
| **Cursor IDE** | Yes (editor + terminal panes) | Yes (workspace layouts) | Yes (tasks.json) | **Yes** (deep: 8 parallel agents, composer, tab) | Freemium, closed-source | 500 MB - 2 GB (Electron/VS Code fork) | **Yes** (full IDE) | Yes (4 layout presets) | No | **Yes** (full MCP marketplace) | N/A | Mar 2026 | Win/Mac/Linux |
| **VS Code** | Yes (editor + terminal panes) | Yes (workspaces) | Yes (tasks.json, terminal profiles) | **Yes** (Copilot agents, local+cloud agents) | Yes, MIT | 400 MB - 1.5 GB (Electron) | **Yes** (full IDE) | Yes (profiles, workspaces) | No | **Yes** (full MCP via Copilot) | ~102k+ (combined) | Mar 2026 | Win/Mac/Linux/Web |
| **Zed** | Yes (editor + terminal panel) | Yes (workspaces) | Yes (tasks) | **Yes** (Agent Panel, external agents) | Yes, GPL-3.0 | ~150-300 MB (Rust, 120fps) | **Yes** (full editor) | Yes | No | **Yes** (full MCP, OAuth) | 75k+ | Mar 2026 | Mac/Linux (Win preview) |
| **BridgeSpace** | **Yes** (2x2, 3x4, 4x4 grids) | Yes (workspace templates) | Yes (pre-configured grids) | **Yes** (BridgeSwarm multi-agent, BridgeCode) | Freemium, closed-source | ~100-200 MB (Tauri v2) | **Yes** (built-in editor) | Yes (templates) | **Yes** (BridgeVoice, Whisper) | **Yes** (BridgeMCP) | N/A (new, 2026) | 2026 | Win/Mac/Linux |
| **SuperFile** | Yes (multi-panel) | Partial | Yes (config) | No | Yes, MIT | <10 MB (Go) | No (file manager) | Yes (themes) | No | No | ~16.9k | 2026 (v1.5.0) | Mac/Linux |

---

## DETAILED REVIEWS

---

### 1. WAVE TERMINAL
**Website:** https://www.waveterm.dev/
**GitHub:** https://github.com/wavetermdev/waveterm
**License:** Apache-2.0 (fully open source)

**Tech Stack:** Go backend + TypeScript/Electron frontend
**GitHub Stars:** ~10k+ (growing)
**Last Update:** March 27, 2026 (v0.14.4)
**Platform:** Windows, macOS, Linux

**Key Features:**
- Flexible drag-and-drop block interface: terminals, editors, web browsers, AI assistants as blocks
- Tabs organized under Workspaces in navigation pane
- Wave AI: context-aware assistant reading terminal output, scrollback, files
- BYOK support: OpenAI, Claude, Gemini, Azure, Ollama, LM Studio
- `wsh` command system for CLI-based workspace management
- Built-in graphical file editor for remote files
- Durable SSH sessions surviving network interruptions
- Connected file management via `wsh file` (copy/sync between hosts)

**Performance:** ~200-300 MB RAM (Electron-based). Moderate startup time. GPU rendering not available.

**Multi-Agent Suitability:** GOOD. Multiple AI assistant blocks + terminals in one workspace. No native multi-agent orchestration but flexible layout. No MCP support natively (community server exists). No voice input.

**Pricing:** Completely free. No login required. Future paid features for team collaboration only.

---

### 2. WARP TERMINAL
**Website:** https://www.warp.dev/
**GitHub:** https://github.com/warpdotdev/Warp (issue tracker; client partially closed-source)
**License:** Freemium, closed-source (plans to open-source UI framework)

**Tech Stack:** Rust + Metal (macOS GPU API), WASM for web
**GitHub Stars:** ~26k
**Last Update:** March 2026
**Platform:** Windows, macOS, Linux

**Key Features:**
- AI-first terminal with natural language command suggestions
- Multi-agent capability: run multiple AI agents in parallel, track progress
- Session save/restore: windows, panes, commands as preconfigured sessions
- Intelligent completions for hundreds of CLI tools
- SOC 2 compliant, Zero Data Retention with LLM providers
- Full MCP support with 26% token optimization for MCP tasks
- MCP search subagent that discovers only needed tools
- Warp-style "command blocks" for organized output
- GPU-accelerated rendering at >144 FPS

**Performance:** ~150-250 MB RAM. Very fast rendering via Metal/GPU. Low latency input.

**Multi-Agent Suitability:** EXCELLENT. Purpose-built for multi-agent workflows. Native AI agent orchestration, MCP integration, session management, parallel agent execution.

**Pricing:**
- Free: Terminal features free forever; 75 AI credits/month (150 for first 2 months)
- Build: $20/month
- Business: $50/month (SSO, ZDR)
- BYOK available on paid plans

---

### 3. TABBY (formerly TERMINUS)
**Website:** https://tabby.sh/
**GitHub:** https://github.com/Eugeny/tabby
**License:** MIT (fully open source)

**Tech Stack:** TypeScript (78%), Pug (12%), SCSS (4.7%), JavaScript, C++ (Electron-based)
**GitHub Stars:** 69.8k
**Last Update:** January 2026 (v1.0.230)
**Platform:** Windows, macOS, Linux (also web app for SSH/SFTP/Telnet)

**Key Features:**
- Integrated SSH, Telnet, serial client with connection manager
- Split panes and tabbed interface
- Plugin system installable from Settings UI
- MCP server integration for AI assistants (Cursor, Windsurf)
- Portable app mode on Windows
- SFTP file transfer built-in
- Web-based SSH/SFTP/Telnet client (self-hostable)
- Highly customizable theming and profiles

**Performance:** ~200-350 MB RAM (Electron). Moderate startup. Reliable for SSH workflows.

**Multi-Agent Suitability:** MODERATE. MCP server lets AI assistants interact with Tabby, but no native AI agent orchestration. Strong for SSH-heavy multi-server workflows.

**Pricing:** Completely free and open source.

---

### 4. HYPER TERMINAL
**Website:** https://hyper.is/
**GitHub:** https://github.com/vercel/hyper
**License:** MIT (fully open source)

**Tech Stack:** JavaScript/TypeScript, Electron, React, Redux
**GitHub Stars:** ~44.6k
**Last Update:** Sporadic/infrequent
**Platform:** Windows, macOS, Linux

**Key Features:**
- Plugin ecosystem built on React components and Redux actions
- Sixel image support
- Multiple profiles with color schemes
- Search with regex, case sensitivity, whole word matching
- Beautiful, highly themeable

**Performance:** 300-400 MB RAM (Electron). Higher resource usage. Slower than GPU-accelerated alternatives.

**Multi-Agent Suitability:** LOW. No AI integration, no MCP, no native multi-agent features. Plugin ecosystem has stagnated. Development activity has slowed significantly.

**Pricing:** Free and open source.

---

### 5. WINDOWS TERMINAL
**Website:** https://aka.ms/terminal
**GitHub:** https://github.com/microsoft/terminal
**License:** MIT (fully open source)

**Tech Stack:** C++, XAML, DirectWrite (GPU-accelerated text rendering)
**GitHub Stars:** 102.4k
**Last Update:** March 2026
**Platform:** Windows only

**Key Features:**
- Split panes (vertical/horizontal) with keyboard shortcuts
- Pane zooming and input broadcasting to multiple panes
- Full Unicode and emoji support with GPU-accelerated rendering
- JSON-based profile system (highly configurable)
- Multiple shell support (PowerShell, CMD, WSL, Git Bash, etc.)
- Quake mode (dropdown terminal)

**Performance:** ~50-100 MB RAM. Fast, native C++ performance. Low latency.

**Multi-Agent Suitability:** LOW-MODERATE. Good pane management and profile system but no AI integration, no MCP, no layout save/restore (still an open issue #8590). Best used as a host terminal for AI tools running inside it.

**Pricing:** Free and open source. Ships with Windows 11.

---

### 6. ZELLIJ
**Website:** https://zellij.dev/
**GitHub:** https://github.com/zellij-org/zellij
**License:** MIT (fully open source)

**Tech Stack:** Rust, WebAssembly (plugin system)
**GitHub Stars:** ~29.9k
**Last Update:** March 2026 (v0.44)
**Platform:** macOS, Linux (no Windows support)

**Key Features:**
- Floating and stacked panes with mode-based navigation
- KDL-based layout files for workspace definition
- WebAssembly plugin system (any language that compiles to WASM)
- Built-in plugin manager (v0.41+)
- True multiplayer collaboration
- Built-in web client
- Real-time keybinding toolbar

**Performance:** ~50-200 MB RAM but known to spike to multiple GB under heavy use. Actively optimizing. Written in Rust.

**Multi-Agent Suitability:** MODERATE-GOOD. Excellent layout system and plugin architecture. No native AI but WASM plugins could enable it. Great for tmux-like multi-agent pane management without tmux's complexity.

**Pricing:** Free and open source.

---

### 7. TMUX
**Website:** https://github.com/tmux/tmux/wiki
**GitHub:** https://github.com/tmux/tmux
**License:** ISC (fully open source)

**Tech Stack:** C
**GitHub Stars:** 43.7k
**Last Update:** March 28, 2026
**Platform:** macOS, Linux, BSDs (WSL on Windows)

**Key Features:**
- Session/window/pane hierarchy
- Detachable sessions (survive disconnection)
- Highly scriptable via shell commands
- Extensive plugin ecosystem (TPM - tmux plugin manager)
- tmux-resurrect for session save/restore
- Extremely lightweight and stable

**Performance:** ~5-15 MB RAM. The most lightweight option. Minimal CPU overhead. Near-zero latency.

**Multi-Agent Suitability:** EXCELLENT (with extensions). The foundation of the 2026 multi-agent revolution:
- **NTM (Named Tmux Manager):** Spawns, tiles, and coordinates multiple AI agents across panes with file reservation, context compaction detection, dashboard
- **Claude Squad (5.8k stars):** Manages Claude Code, Codex, Aider, OpenCode, Amp in separate git worktree workspaces
- **AMUX:** Web dashboard for running dozens of parallel AI agents with self-healing watchdog
- **tmai:** Tmux Multi Agents Interface for monitoring and controlling multiple AI agents
- **multi-agent-workflow-kit:** Reusable toolkit for tmux + git worktree workflows

**Pricing:** Free and open source.

---

### 8. iTERM2
**Website:** https://iterm2.com/
**GitHub:** https://github.com/gnachman/iTerm2
**License:** GPL-2.0 (fully open source)

**Tech Stack:** Objective-C/Swift (native macOS)
**GitHub Stars:** ~15.8k
**Last Update:** 2026
**Platform:** macOS only

**Key Features:**
- Split panes (horizontal/vertical)
- Window arrangements (save/restore)
- Extensive profile system with triggers
- Built-in AI chat window with terminal context awareness
- Ollama integration for local AI (privacy-preserving)
- GPU-accelerated scrolling
- Python scripting API
- Inline images (iTerm2 image protocol)
- Shell integration for command tracking

**Performance:** 500 MB - 3 GB RAM (depends on scrollback settings and tab count). 35% faster command processing than default Terminal.app. Recommend 4+ GB system RAM.

**Multi-Agent Suitability:** MODERATE. AI chat integration is useful but not multi-agent oriented. Excellent profile/arrangement system for setting up multi-pane workflows. macOS only limits cross-platform teams.

**Pricing:** Free and open source.

---

### 9. ALACRITTY
**Website:** https://alacritty.org/
**GitHub:** https://github.com/alacritty/alacritty
**License:** Apache-2.0 (fully open source)

**Tech Stack:** Rust, OpenGL
**GitHub Stars:** 58.5k
**Last Update:** 2026 (v0.12.0)
**Platform:** Windows, macOS, Linux

**Key Features:**
- GPU-accelerated rendering via OpenGL
- Minimal, no tabs, no splits (by design)
- YAML/TOML configuration
- Vi mode for scrollback
- Smallest memory footprint in GPU-accelerated tier

**Performance:** ~30 MB RAM. The lightest GPU-accelerated terminal. Fastest raw input latency. Minimal CPU usage.

**Multi-Agent Suitability:** LOW. No panes, no tabs, no AI. By design, it's a minimal terminal emulator. Must be paired with tmux/Zellij for multi-pane workflows. Excellent as the "inner terminal" inside a multiplexer.

**Pricing:** Free and open source.

---

### 10. WEZTERM
**Website:** https://wezterm.org/
**GitHub:** https://github.com/wezterm/wezterm
**License:** MIT (fully open source)

**Tech Stack:** Rust, GPU-accelerated, Lua 5.4 configuration
**GitHub Stars:** ~23.3k
**Last Update:** 2026 (v0.17.1)
**Platform:** Windows, macOS, Linux

**Key Features:**
- Built-in multiplexer (tabs, panes, windows)
- Client-server architecture for persistent sessions
- Full Lua 5.4 scripting for configuration and automation
- Hot-reload configuration
- Deep SSH support with native key handling
- Ligatures, true color, emoji, Sixel images
- Regex search through scrollback
- Event-driven API for user scripts

**Performance:** ~320 MB RAM. Higher than Alacritty/Kitty but feature-rich. GPU-accelerated rendering.

**Multi-Agent Suitability:** MODERATE. Lua scripting enables powerful automation for multi-agent workflows. Built-in multiplexer eliminates need for tmux. Can programmatically create pane layouts. No AI integration or MCP.

**Pricing:** Free and open source.

---

### 11. KITTY
**Website:** https://sw.kovidgoyal.net/kitty/
**GitHub:** https://github.com/kovidgoyal/kitty
**License:** GPL-3.0 (fully open source)

**Tech Stack:** C + Python, GPU-accelerated (OpenGL)
**GitHub Stars:** ~23.2k
**Last Update:** 2026
**Platform:** macOS, Linux (no Windows)

**Key Features:**
- GPU-accelerated with fastest throughput (2x faster than next best)
- Kitten plugin system (extensible via Python)
- Inline image rendering (Kitty image protocol, widely adopted)
- Built-in window splits
- Session startup files
- Remote file transfer via kittens
- Extensive Unicode support

**Performance:** 60-100 MB RAM. Fastest throughput benchmark of all terminals. Low latency. Mature and stable.

**Multi-Agent Suitability:** LOW-MODERATE. Good splits and session support. Kitten plugins could automate multi-agent setups. No AI integration or MCP. 30% market share on Arch Linux.

**Pricing:** Free and open source.

---

### 12. GHOSTTY
**Website:** https://ghostty.org/
**GitHub:** https://github.com/ghostty-org/ghostty
**License:** MIT (under Hack Club 501(c)(3) non-profit)

**Tech Stack:** Zig (core libghostty), Swift/AppKit/SwiftUI (macOS), GTK4 (Linux)
**GitHub Stars:** 45.2k (fastest-growing terminal in 2025-2026)
**Last Update:** March 2026 (v1.3.0)
**Platform:** macOS, Linux (Windows: libghostty supports it, but no native app yet)

**Key Features:**
- Platform-native UI (Swift on Mac, GTK4 on Linux)
- GPU-accelerated rendering
- Supports Kitty graphics protocol, clipboard sequences, synchronized rendering
- Light/dark mode notifications
- 6-month release cycle (1.4 planned September 2026)
- Created by Mitchell Hashimoto (Vagrant/Terraform creator)

**Performance:** ~60-200 MB RAM normally. 2-5x rendering throughput vs competitors in some benchmarks. Known memory leak with Claude Code CLI sessions (being fixed). Best Mac all-rounder performance.

**Multi-Agent Suitability:** LOW. No AI integration, no MCP, limited window management. Good as the "inner terminal" for speed. Memory leak with Claude Code is a concern for multi-agent workflows.

**Pricing:** Free and open source.

---

### 13. RIO TERMINAL
**Website:** https://rioterm.com/
**GitHub:** https://github.com/raphamorim/rio
**License:** MIT (fully open source)

**Tech Stack:** Rust, WebGPU/WGPU (Sugarloaf renderer)
**GitHub Stars:** 6.4k
**Last Update:** 2026 (rewriting to v1.0)
**Platform:** Windows, macOS, Linux (also browser via WASM)

**Key Features:**
- WebGPU-powered rendering (Sugarloaf architecture)
- Split panes
- Font ligatures
- iTerm2 and Kitty image protocol support
- Can run in browsers via WebAssembly
- Multi-window support

**Performance:** ~40-80 MB RAM. Fast WebGPU rendering. Low CPU usage due to GPU offloading.

**Multi-Agent Suitability:** LOW. In the middle of a major v1.0 rewrite. Split panes exist but ecosystem is immature. No AI, no MCP. Browser support via WASM is unique and interesting for remote multi-agent dashboards.

**Pricing:** Free and open source.

---

### 14. CONTOUR TERMINAL
**Website:** https://contour-terminal.org/
**GitHub:** https://github.com/contour-terminal/contour
**License:** Apache-2.0 (fully open source)

**Tech Stack:** C++ (modern), GPU-accelerated, OpenGL
**GitHub Stars:** ~2.9k
**Last Update:** 2026
**Platform:** Windows, macOS, Linux, FreeBSD, OpenBSD

**Key Features:**
- Vi-like input modes for selection and copy/paste
- Vi-like scrolloff
- Blurred transparent backgrounds (Windows 10+, KDE, GNOME)
- Synchronized rendering
- Text reflow
- Sixel inline images
- Clickable hyperlinks (OSC 8)
- Page buffer capture VT extension

**Performance:** ~30-60 MB RAM. Fast native C++ performance.

**Multi-Agent Suitability:** VERY LOW. No pane splitting, no AI, no MCP. Niche terminal focused on correctness and modern VT sequences. Widest platform support (including BSDs).

**Pricing:** Free and open source.

---

### 15. CMDER
**Website:** https://cmder.app/
**GitHub:** https://github.com/cmderdev/cmder
**License:** MIT (fully open source)

**Tech Stack:** ConEmu wrapper + bundled tools (Git, SSH, etc.)
**GitHub Stars:** ~26.8k
**Last Update:** 2026
**Platform:** Windows only

**Key Features:**
- Portable (no installation needed, carry on USB)
- Bundled Git, SSH, PowerShell
- ConEmu as underlying terminal (tabs, splits, tasks)
- Windows Terminal directory tracking (OSC 9;9)
- Startup tasks for predefined layouts
- Multiple shell support (CMD, PowerShell, Bash, Mintty)

**Performance:** ~50-100 MB RAM. Efficient due to ConEmu backend.

**Multi-Agent Suitability:** LOW. Windows-only, no AI, legacy project. Good for Windows users who need a portable Git+terminal bundle. Better to use Windows Terminal or Warp on Windows now.

**Pricing:** Free and open source.

---

### 16. CONEMU
**Website:** https://conemu.github.io/
**GitHub:** https://github.com/ConEmu/ConEmu
**License:** BSD (fully open source)

**Tech Stack:** C++ (native Windows)
**GitHub Stars:** ~8.7k (estimated)
**Last Update:** Low activity (legacy)
**Platform:** Windows only

**Key Features:**
- Tabs and split consoles
- Quake-style dropdown
- Tasks for predefined startup configurations
- Runs any WinAPI or Unix PTY console app
- Automatic URL highlighting
- Doesn't use CPU/GPU for inactive tabs (efficient)

**Performance:** ~30-60 MB RAM. Very efficient. Minimal resource usage for inactive tabs.

**Multi-Agent Suitability:** VERY LOW. Legacy Windows terminal. Superseded by Windows Terminal and Warp. No AI, no MCP.

**Pricing:** Free and open source.

---

### 17. MOBAXTERM
**Website:** https://mobaxterm.mobatek.net/
**License:** Freemium, closed-source

**Tech Stack:** Proprietary (Windows native)
**GitHub Stars:** N/A (not on GitHub)
**Last Update:** 2026
**Platform:** Windows only

**Key Features:**
- All-in-one: SSH, RDP, VNC, FTP, SFTP, X11 server
- Built-in SFTP browser with drag-and-drop
- Macro recording and playback
- Session manager with folders
- Network tools (ping, traceroute, port scan)
- Tabbed interface, multi-execution on multiple servers
- Portable edition available

**Performance:** ~100-200 MB RAM. Efficient for the feature set.

**Pricing:**
- Home Edition: Free (limited to 10 saved sessions)
- Professional: ~$69/user/year

**Multi-Agent Suitability:** LOW. Windows-only, no AI, no MCP. Best for sysadmins managing many servers. Multi-exec feature could be repurposed for running commands on multiple hosts.

---

### 18. TERMIUS
**Website:** https://termius.com/
**License:** Freemium, closed-source

**Tech Stack:** Electron-based (cross-platform)
**GitHub Stars:** N/A (not on GitHub)
**Last Update:** March 2026
**Platform:** Windows, macOS, Linux, iOS, Android

**Key Features:**
- SSH client with host syncing across all devices
- AI-powered autocomplete (free for all users since 2026)
- AI snippet generation and text-to-command
- Remote session sharing for troubleshooting
- Biometric keys (Windows Hello)
- Snippets for automating routine tasks
- SFTP, port forwarding, jump hosts

**Performance:** ~150-250 MB RAM. Moderate.

**Pricing:**
- Starter: Free (limited features)
- Pro: $10/month (annual billing)
- Team: $20/user/month
- Business: $30/user/month (SOC2, SAML SSO)

**Multi-Agent Suitability:** LOW-MODERATE. AI autocomplete is useful but limited. Cross-platform sync including mobile is unique. No MCP, no multi-agent orchestration. Best for SSH-focused mobile+desktop workflows.

---

### 19. BLINK SHELL
**Website:** https://blink.sh/
**GitHub:** https://github.com/blinksh/blink
**License:** Open-source core, freemium

**Tech Stack:** Swift (native iOS)
**GitHub Stars:** 6.6k
**Last Update:** 2026
**Platform:** iOS/iPadOS only

**Key Features:**
- Most complete SSH implementation on iOS
- Mosh support with ProxyJump
- Built-in Vim editor
- Code command for VS Code integration
- AI Writing Tools on keyboard
- Blazingly fast terminal and SFTP
- Interactive commands (less, bc, ping6)

**Performance:** ~50-100 MB RAM. Fast for iOS.

**Pricing:** $19.99/year subscription (14-day free trial)

**Multi-Agent Suitability:** LOW. iOS-only. No multi-agent features. Useful for monitoring agent sessions from iPad. AI limited to keyboard writing tools.

---

### 20. AMAZON Q DEVELOPER CLI (formerly FIG)
**Website:** https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line.html
**GitHub:** https://github.com/aws/amazon-q-developer-cli
**License:** MIT + Apache-2.0 (open source)

**Tech Stack:** Rust (CLI), overlays on existing terminals
**GitHub Stars:** Growing (open-sourced in 2025)
**Last Update:** March 2026
**Platform:** Windows, macOS, Linux

**Key Features:**
- IDE-style autocomplete dropdown for 500+ CLI tools
- Inline "ghost text" suggestions
- Natural language chat in terminal
- Agentic CLI experience: iterative code changes from natural language
- Works as overlay on any existing terminal
- Theming support

**Performance:** ~50-150 MB RAM (runs as overlay process alongside your terminal)

**Multi-Agent Suitability:** MODERATE. Strong AI capabilities but runs as overlay, not standalone terminal. No pane management. Best combined with another terminal (e.g., Windows Terminal + Amazon Q overlay). No MCP.

**Pricing:** Free tier available. Requires AWS account for advanced features.

---

### 21. CURSOR IDE (Terminal)
**Website:** https://cursor.com/
**License:** Freemium, closed-source

**Tech Stack:** Electron (VS Code fork), AI-first architecture
**GitHub Stars:** N/A (closed source)
**Last Update:** March 2026
**Platform:** Windows, macOS, Linux

**Key Features:**
- Full IDE with integrated terminal
- **8 parallel AI agents** (since Cursor 2.0) with isolated git worktrees
- 5 interaction modes: Tab, Cmd-K, Chat, Composer, Agent
- 4 layout presets: agent, editor, zen, browser
- Async subagents that spawn their own subagents (tree of work)
- Full MCP marketplace: Figma, Linear, Stripe, Vercel, AWS
- Terminal AI: instant command suggestions, error debugging
- Multi-model support: GPT-5, Claude 4, Gemini 2.5

**Performance:** 500 MB - 2 GB RAM (Electron/VS Code fork). Heavy but feature-rich.

**Multi-Agent Suitability:** EXCELLENT. Purpose-built for multi-agent coding. 8 parallel agents, MCP marketplace, subagent trees, layout presets. The leading IDE for multi-agent workflows as of March 2026.

**Pricing:**
- Hobby: Free (limited)
- Pro: $20/month ($16/month annual) -- includes MCP, cloud agents
- Pro+: $60/month
- Ultra: $200/month (20x usage, priority)
- Teams: $40/user/month
- Enterprise: Custom

---

### 22. VS CODE (Terminal)
**Website:** https://code.visualstudio.com/
**GitHub:** https://github.com/microsoft/vscode
**License:** MIT (open source)

**Tech Stack:** Electron, TypeScript
**GitHub Stars:** ~102k+ (combined repos)
**Last Update:** March 2026
**Platform:** Windows, macOS, Linux, Web

**Key Features:**
- Full IDE with integrated terminal (split panes)
- **Multi-Agent Development Platform** (since v1.109, January 2026)
- Run Claude, Codex, and Copilot agents side by side
- Agent Sessions view: local, background, and cloud agents in one place
- Agent HQ preview: centralized UI for agent management
- Terminal Agents: shell commands triggered by agent plans
- Full MCP support via Copilot
- Tasks.json for automated startup commands
- Extension marketplace (50k+ extensions)

**Performance:** 400 MB - 1.5 GB RAM. Moderate to heavy depending on extensions.

**Multi-Agent Suitability:** EXCELLENT. Officially positioned as "Your Home for Multi-Agent Development." Unified agent session management, terminal agent capabilities, MCP support, cloud+local agents. Free with Copilot.

**Pricing:**
- VS Code: Free
- Copilot Free: Limited requests
- Copilot Pro: $10/month (300 premium requests)
- Copilot Business: $19/user/month
- Copilot Enterprise: $39/user/month

---

### 23. ZED (Terminal)
**Website:** https://zed.dev/
**GitHub:** https://github.com/zed-industries/zed
**License:** GPL-3.0 (open source)

**Tech Stack:** Rust (native, 120fps rendering)
**GitHub Stars:** 75k+
**Last Update:** March 2026
**Platform:** macOS, Linux (Windows in preview)

**Key Features:**
- Agent Panel with tool calling for agentic editing
- Built-in tools: codebase search, file editing, terminal commands
- MCP support with OAuth for remote servers
- Multiple MCP servers simultaneously
- Agent Client Protocol (ACP) for external agents: Gemini CLI, Claude Code, Codex CLI, OpenCode
- GPU-accelerated at 120fps
- Multiplayer collaboration (real-time)
- Created by Atom/Tree-sitter founders
- $32M Sequoia funding

**Performance:** ~150-300 MB RAM. 120fps rendering. Fastest editor by benchmarks. Rust-native performance.

**Multi-Agent Suitability:** EXCELLENT. Full MCP support, Agent Panel, external agent integration via ACP, tool calling, 120fps performance means smooth multi-agent interaction. Open source. Spring 2026 targeting v1.0.

**Pricing:**
- Editor: Free (no AI)
- Free tier: 50 AI prompts
- Pro: 500 AI prompts + BYOK + Ollama

---

### 24. BRIDGESPACE (BridgeMind)
**Website:** https://www.bridgemind.ai/products/bridgespace
**License:** Freemium, closed-source

**Tech Stack:** Tauri v2 + React 19 (native desktop, low RAM vs Electron)
**GitHub Stars:** N/A (new product, 2026)
**Last Update:** 2026 (actively developing)
**Platform:** Windows, macOS, Linux

**Key Features:**
- **Multi-pane terminal grids:** 2 side-by-side, 2x2, 3x4, or 4x4 (16 terminals)
- **BridgeSwarm:** Multi-agent orchestration (builder, reviewer, scout, coordinator roles)
- **BridgeCode:** AI coding CLI
- **BridgeVoice:** Voice-to-code with on-device Whisper AI, sub-second latency, 99+ languages
- **BridgeMCP:** Full MCP server for project creation, task management, agent configuration
- Built-in code editor
- Warp-style command blocks
- Integrated task board
- Zero-wait parallel session startup

**Performance:** ~100-200 MB RAM (Tauri v2, fraction of Electron footprint). GPU-accelerated terminal rendering.

**Multi-Agent Suitability:** BEST-IN-CLASS for multi-agent. Purpose-built for "vibe coding" with multiple AI agents. Voice input, MCP, multi-agent swarms, visual task management. The most comprehensive multi-agent workspace tool discovered in this research.

**Pricing:**
- Basic: $20/month ($16/month annual) -- includes BridgeSpace
- Pro: Higher tier with BridgeMCP, BridgeCode, BridgeVoice, premium skills

---

### 25. SUPERFILE
**Website:** https://superfile.dev/
**GitHub:** https://github.com/yorukot/superfile
**License:** MIT (fully open source)

**Tech Stack:** Go
**GitHub Stars:** ~16.9k
**Last Update:** 2026 (v1.5.0)
**Platform:** macOS, Linux

**Key Features:**
- Modern TUI file manager
- Multi-panel layout
- Fuzzy file search
- Git integration (highlights, diffs, stage/unstage)
- Preview panes (text, images via libsixel, media metadata)
- Clipboard viewer, process list
- Themes and custom fonts
- Plugin extensibility

**Performance:** <10 MB RAM. Startup <100ms. Outperforms nnn and ranger on 10k+ file directories.

**Multi-Agent Suitability:** LOW. It's a file manager, not a terminal. Useful as a companion tool within a multi-agent terminal setup for file navigation. No AI, no MCP.

**Pricing:** Free and open source.

---

## ADDITIONAL TOOLS DISCOVERED

### 26. CLAUDE SQUAD
**GitHub:** https://github.com/smtg-ai/claude-squad
**Stars:** 5.8k | **License:** Open source
**What it does:** Manages multiple AI terminal agents (Claude Code, Codex, OpenCode, Amp) in separate workspaces with git worktree isolation. Profiles for named program configurations. Background task completion with auto-accept mode. Install as `cs`.

### 27. NTM (Named Tmux Manager)
**GitHub:** https://github.com/Dicklesworthstone/ntm
**Stars:** 187+ | **License:** Open source
**What it does:** Spawns, tiles, and coordinates multiple AI coding agents (Claude, Codex, Gemini) across tmux panes with a TUI command palette. File reservation tracking, context compaction detection, persistent orchestration state.

### 28. INTENT (Augment Code)
**Website:** https://www.augmentcode.com/blog/intent-a-workspace-for-agent-orchestration
**What it does:** Developer workspace for orchestrating agents. Brings agents, terminals, diffs, browsers, and git operations into one workspace. Each workspace backed by isolated git worktree. Released February 2026.

### 29. AMUX
**What it does:** Open-source multiplexer for running dozens of parallel AI coding agents via tmux. Web dashboard for live terminal peeking. Self-healing watchdog that auto-compacts context when it drops below 20%.

### 30. TMAI (Tmux Multi Agents Interface)
**GitHub:** https://github.com/trust-delta/tmai
**What it does:** Monitor and control multiple AI agents (Claude Code, etc.) running in tmux.

### 31. MOSHI (iOS)
**Website:** https://getmoshi.app/
**What it does:** SSH terminal for iOS specifically designed for Claude Code and AI agents. Alternative to Blink Shell.

---

## RECOMMENDATIONS BY USE CASE

### Best for Multi-Agent AI Coding (Overall)
1. **BridgeSpace** -- purpose-built, voice, MCP, multi-agent swarms
2. **Cursor IDE** -- 8 parallel agents, MCP marketplace, subagent trees
3. **VS Code** -- multi-agent platform, free, massive ecosystem
4. **Warp** -- best standalone terminal with AI agents + MCP

### Best Open Source Multi-Agent Setup
1. **tmux + Claude Squad** -- git worktree isolation, multiple agent types, 5.8k stars
2. **tmux + NTM** -- file locks, context compaction detection, TUI dashboard
3. **Zed** -- full MCP, Agent Panel, ACP, 75k+ stars, open source

### Best Performance (Lightweight Terminal + AI Layer)
1. **Alacritty + tmux + Claude Squad** -- 30 MB + 15 MB + agents
2. **Kitty + Zellij** -- 60 MB + pane management
3. **Ghostty** -- 60 MB, fastest rendering (but no Windows)

### Best for Windows
1. **Warp** -- full AI, MCP, cross-platform
2. **Windows Terminal + Amazon Q overlay** -- free, powerful profiles
3. **Tabby** -- SSH management, MCP server, cross-platform

### Best for SSH/Remote Server Management
1. **Tabby** -- 69.8k stars, SSH/SFTP/serial, web client, MCP
2. **MobaXterm** -- all-in-one (SSH, RDP, VNC, X11)
3. **Termius** -- cross-platform including mobile, AI autocomplete

### Best for iOS/iPad
1. **Blink Shell** -- most complete SSH on iOS
2. **Moshi** -- designed for AI agent interaction
3. **Termius** -- cross-device sync

### Best Voice-Enabled AI Coding
1. **BridgeSpace** (BridgeVoice with Whisper) -- only terminal with native voice
2. **Claude Code voice mode** (MCP server) -- works in any terminal

### Best Free + Open Source (No Compromises)
1. **Zed** -- GPL-3.0, AI features, MCP, 75k+ stars, 120fps
2. **Wave Terminal** -- Apache-2.0, AI integration, BYOK
3. **tmux** -- ISC, lightest weight, most extensible

---

## KEY FINDINGS

1. **The 2026 terminal landscape has fundamentally shifted toward multi-agent AI workflows.** Traditional terminal emulators without AI integration are being supplemented by orchestration tools (Claude Squad, NTM, AMUX) or replaced by AI-native terminals (Warp, Wave).

2. **MCP (Model Context Protocol) is the new differentiator.** Terminals with MCP support (Warp, Cursor, VS Code, Zed, BridgeSpace, Tabby) can plug into any AI tool ecosystem. Those without MCP are at a disadvantage for extensibility.

3. **tmux is experiencing a renaissance** as the foundation for multi-agent AI workflows, not despite being old, but because its simplicity, scriptability, and minimal overhead make it ideal for orchestrating many agent sessions.

4. **Electron-based terminals are losing ground** to Rust (Warp, WezTerm, Zed), Zig (Ghostty), and Tauri (BridgeSpace) for performance-sensitive use cases.

5. **Voice input remains extremely rare.** Only BridgeSpace offers native voice-to-code. Claude Code has a voice mode MCP server. No traditional terminal emulator supports voice.

6. **No single tool does everything.** The best multi-agent setup in 2026 is typically a combination: an AI-aware terminal or IDE (Cursor/VS Code/Zed) + a multiplexer/orchestrator (tmux/Claude Squad) + MCP servers for tool integration.

---

## Sources

- [Wave Terminal GitHub](https://github.com/wavetermdev/waveterm)
- [Wave Terminal Docs](https://docs.waveterm.dev/)
- [Warp Terminal](https://www.warp.dev/)
- [Warp Pricing](https://www.warp.dev/pricing)
- [Warp MCP Docs](https://docs.warp.dev/agent-platform/capabilities/mcp)
- [Tabby GitHub](https://github.com/Eugeny/tabby)
- [Hyper GitHub](https://github.com/vercel/hyper)
- [Windows Terminal GitHub](https://github.com/microsoft/terminal)
- [Zellij GitHub](https://github.com/zellij-org/zellij)
- [Zellij Website](https://zellij.dev/)
- [tmux GitHub](https://github.com/tmux/tmux)
- [NTM GitHub](https://github.com/Dicklesworthstone/ntm)
- [Claude Squad GitHub](https://github.com/smtg-ai/claude-squad)
- [iTerm2 AI Plugin](https://iterm2.com/ai-plugin.html)
- [Alacritty GitHub](https://github.com/alacritty/alacritty)
- [WezTerm GitHub](https://github.com/wezterm/wezterm)
- [Kitty Website](https://sw.kovidgoyal.net/kitty/)
- [Ghostty Website](https://ghostty.org/)
- [Ghostty GitHub](https://github.com/ghostty-org/ghostty)
- [Rio GitHub](https://github.com/raphamorim/rio)
- [Contour GitHub](https://github.com/contour-terminal/contour)
- [Cmder GitHub](https://github.com/cmderdev/cmder)
- [ConEmu GitHub](https://github.com/ConEmu/ConEmu)
- [MobaXterm Website](https://mobaxterm.mobatek.net/)
- [Termius Pricing](https://termius.com/pricing)
- [Blink Shell GitHub](https://github.com/blinksh/blink)
- [Amazon Q Developer CLI GitHub](https://github.com/aws/amazon-q-developer-cli)
- [Cursor Features](https://cursor.com/features)
- [Cursor Pricing](https://cursor.com/docs/models-and-pricing)
- [VS Code Multi-Agent Blog](https://code.visualstudio.com/blogs/2026/02/05/multi-agent-development)
- [VS Code Agent Docs](https://code.visualstudio.com/docs/copilot/agents/overview)
- [Zed Website](https://zed.dev/)
- [Zed AI Docs](https://zed.dev/docs/ai/overview)
- [BridgeSpace Website](https://www.bridgemind.ai/products/bridgespace)
- [BridgeMCP Docs](https://docs.bridgemind.ai/docs/mcp)
- [SuperFile GitHub](https://github.com/yorukot/superfile)
- [Linux Terminal Statistics 2026](https://commandlinux.com/statistics/linux-terminal-emulator-popularity-statistics/)
- [Terminal Emulators 2026 Comparison](https://dasroot.net/posts/2026/03/linux-terminal-emulators-alacritty-kitty-wezterm/)
- [Agentmaxxing Guide](https://vibecoding.app/blog/agentmaxxing)
- [Best Agentic IDEs 2026 (DataCamp)](https://www.datacamp.com/blog/best-agentic-ide)
