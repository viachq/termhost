---
updated: 2026-06-10
tags: [mobile, remote, websocket, tailscale, pwa]
related: [[daemon-architecture]]
---
# Mobile / Remote Access

## What exists

- Mobile web client: `src/mobile/` (React + xterm.js), built by `npm run mobile:build` (`vite.mobile.config.ts`, vite-plugin-singlefile) into `dist-mobile/mobile.html`, which the daemon embeds via `include_str!` and serves at `/`.
- WS server: `daemon/src/ws_server.rs` (warp, port 9090, binds 0.0.0.0). Toggled from desktop Settings → Remote Access (`start_ws_server` Tauri command → daemon).
- Settings shows BOTH connect URLs when running: `get_local_ips()` (ws_server.rs) enumerates interfaces via `if-addrs` crate, classifies Tailscale (100.64/10) vs LAN (private ranges), returns Tailscale-first. Carried in `WsStatus.ips: Vec<String>` (protocol.rs). Both SettingsPanel.tsx and SettingsPage.tsx render each labeled 🏠 Home (LAN) / 🌐 Tailscale. So "2 modes" = pick the right URL on phone, no toggle.
- Mobile client has: connect screen, terminal tabs, workspaces, key toolbar, clipboard-to-PC page. PWA manifest exists (`dist-mobile/mobile-manifest.json`); **no service worker yet**.
- ClipboardPage (`src/mobile/components/ClipboardPage.tsx`) has a target switch: 📋 Clipboard (WS `{type:"clipboard"}` → arboard sets PC clipboard) vs ⌨️ Terminal (WS `{type:"input", id, data}` → daemon writes straight to that PTY). Terminal mode: a `<select>` to pick the tab (defaults to active) + "Press Enter ⏎" checkbox (appends `\r`). Target+enter persisted in localStorage (`th-clip-target`, `th-clip-enter`). Handlers `onClipboard`/`onTerminal` in `src/mobile/App.tsx`. Lets you drive agents/terminals from the phone with zero touches on the PC.

## Session 2026-07-01 — Windows-PC mode bring-up (verified)

Goal narrowed: a **generic agent-agnostic remote terminal on the phone** (any PTY — Claude Code / Codex / opencode), NOT a Claude-specific wrapper. Daemon is already agent-agnostic (knows only PTYs). OSS landscape: agent-wrappers (siteboon/claudecodeui, QuivrHQ/247-claude-code-remote, Claude Squad) vs generic web terminals (ttyd, wetty, gotty, muxplex) vs native SSH (Blink/Termius). Niche gap = polished mobile UI + agent-agnostic + no SSH app — that's this project.

Network model decided: **Tailscale ≠ a mode**. One axis = which host's daemon. Local = phone hits LAN `192.168.0.104:9090` directly (no VPN, no battery). Remote (only when away) = tunnel: **Cloudflare Tunnel** (nothing on phone, zero phone battery, `cloudflared` runs on PC) preferred over always-on Tailscale for battery. Mobile client already auto-connects to `window.location.host` (served-by-daemon case done).

**Live daemon is the OLD build** (PID 6864, started 2026-06-30): WsStatus has no `token`, `terminals` payload has **no cols/rows** → mobile view-mode falls back to 80×24 (part of the "garbled" look). Self-tested via Python pipe IPC + raw WS handshake (scratchpad/ws_test*.py): HTTP page serves my rebuilt bundle, WS 101 + `terminals` frame OK. I started WS on the live daemon via StartWsServer IPC, so **port 9090 is listening now** (no Settings toggle needed for an immediate phone test).

Changes made this session (all compile; daemon changes NEED SWAP per [[daemon-restart-gotcha]] from a non-daemon terminal — I never restarted the live daemon):
- **#4 input (DONE + verified live):** `src/mobile/components/Toolbar.tsx` — added ⇧Tab (`\x1b[Z`, Claude/Codex mode-cycle), ⏎ (`\r`), ^R, Home/End. Verified served live via headless-Chrome CDP screenshot (keys present in DOM). No swap needed.
- **#1 WS auto-start (DONE):** `daemon/src/main.rs` `daemon_main()` auto-starts ws_server. Env `AGENT_WS_AUTOSTART` (default on), `AGENT_WS_PORT` (default 9090).
- **#5 vt100 snapshot (DONE, tested):** new `daemon/src/screen.rs` `ScreenManager` (vt100 0.15 crate) — per-PTY parser fed the same bytes; `snapshot()` = `contents_formatted()`. Wired: create on Spawn, `feed` in PTY callback, `resize` on IPC Resize + WS control-resize, `remove` on Kill (main.rs); new `get_screen` WS msg → `{"type":"screen",...}` (ws_server.rs). Client: `get_screen`/`screen` types, `handleMessage` "screen"→reset+write, `registerTerminal` requests `get_screen` on mount (App.tsx). 2 deterministic `cargo test`s pass (positioned redraw reconstructs; scrolled-off excluded).

**PROVEN via self-testing (no phone):** started WS on live daemon via pipe IPC (StartWsServer) → 9090 listening now; raw WS handshake + `get_buffer` round-trip OK; headless-Chrome CDP screenshot of `192.168.0.104:9090` at 412×915 renders the mobile UI. **Root cause of "blank/garbled terminal" found:** raw byte-replay (`get_buffer`) of a PSReadLine/Claude-Code buffer scrolls the prompt off-screen → blank (confirmed: browser blank + pyte replay of the real 5KB buffer showed the Claude UI while linear tail was newlines). Hence `get_screen`/vt100 is the correct fix. **Caveat:** a snapshot can catch a blank mid-redraw frame (both pyte and vt100 agree on a capture taken during an active clear) — self-heals on next live output; acceptable.

**SWAP DONE + VERIFIED LIVE (2026-07-01):** swapped fresh daemon into `src-tauri/target/debug/` and relaunched app (new PID). Confirmed: WS auto-started on 9090 with no Settings toggle (#1); WsStatus now carries a token (new build); spawned a powershell PTY via IPC and loaded `192.168.0.104:9090` in headless-Chrome at 412×915 — the client requested get_screen and painted the PowerShell screen cleanly (aligned `Format-Table` columns, prompt, colours) where raw replay was blank before. The vt100 fix (#5) works end-to-end. (Swap procedure if needed again: copy `daemon/target/debug/termhostd.exe` → `src-tauri/target/debug/`, relaunch app, from a terminal NOT hosted by the daemon.)

**Batch 2 (2026-07-01, workflow-designed + verified, SWAPPED + TESTED):**
- **keep-awake DONE:** new `daemon/src/sleep_blocker.rs` — a dedicated guard thread calls `SetThreadExecutionState(ES_CONTINUOUS|ES_SYSTEM_REQUIRED)` (re-arm every 30s; display sleep still allowed), toggled from WS start/stop in main.rs (auto-start, StartWsServer, StopWsServer). Verifier flagged tokio thread-migration → hence the dedicated thread. Can't verify live without admin (`powercfg /requests` needs elevation); user can check it there.
- **phone-spawn DONE + TESTED:** new WS `spawn` arm in ws_server.rs (`make_ws_term_id` = `term-<millis>-<n>`; creates infos/sizes/buffer/screen/PTY; assigns to workspace if one exists, tolerates none → sends all terminals; rolls back on failure). Mobile: `spawn` in types.ts, `handleSpawn` in App.tsx, `+` button in TabBar.tsx. Verified: WS spawn 0→1 terminal; CDP click `+` 1→2 tabs, new terminal painted `PS C:\Users\viach>`. NOTE: daemon has 0 workspaces this session (app doesn't SyncWorkspaces to a fresh daemon) — that's why phone-spawn is workspace-tolerant; also why TabBar shows "—".
- **Claude Code TUI on mobile VERIFIED:** spawned `claude` PTY, CDP-screenshotted mobile at 412×915 → the real Claude Code interactive prompt (box borders, colours, `❯ 1. Yes / 2. No` menu, "Enter to confirm · Esc...") renders cleanly via vt100 get_screen. The core use case works.

**#3 desktop size re-assert — FULL, DEPLOYED + VERIFIED (2026-07-01):** the protocol-forwarding variant (not the minimal one) — this is what makes Control-from-phone NOT garble the PC. `DaemonResponse::TerminalResized{id,cols,rows}` added (protocol.rs); daemon push_task now forwards it instead of dropping (main.rs); daemon_client.rs response_seq treats it as unsolicited; lib.rs push receiver emits `pty-resize-<id>`; TerminalInstance.tsx setup() listens and `term.resize(cols,rows)` to FOLLOW (local only, no echo → no war), and the focus effect re-fits+resizeTerminal to RE-ASSERT the desktop size on pane click. Built daemon + full app (`cargo build src-tauri` → embeds ../dist via devUrl in debug; app runs against the running vite dev server). VERIFIED: a CDP phone asserted its width on the shared `autogram` terminal → the desktop pane rendered the Claude `/resume` picker in a clean narrow left column (followed, NOT garbled). Snap-back-on-click deployed but hand-verify (programmatic desktop clicks are risky — the user's own Claude Code session runs in a floating Windows Terminal window on the same screen). tmux active-client-wins now real.

**Modes unified — View/Control TOGGLE REMOVED (user: "no point having two modes"):** with #3 (desktop follows), the toggle was redundant. `src/mobile/App.tsx` now: one behavior — the phone `assertSize()` (FitAddon fit + send resize) on mount/ResizeObserver/active-tab/tap (onPointerDown), and a follow-effect that `term.resize()` to whatever size another client set, skipping our own echo (`lastSentRef`) so the two never fight. Removed the m-modebar UI, `mode` prop, `terminalMode` usage, `stateRef`, and the CHAR_W/CHAR_H estimate (FitAddon measures the real cell → fixes clipping on phones without Cascadia Mono). Verified via CDP: no toggle, terminal auto-fits readable. Model = "whoever interacted last owns the size": tap the phone → phone width; click the desktop pane → desktop width.

**DEV-MODE NOTE:** the running app was built with plain `cargo build` (debug) → it loads the frontend from `devUrl` http://localhost:1420, so **`npm run vite:dev` MUST be running** or the window shows ERR_CONNECTION_REFUSED. For a standalone app (embedded frontend, no dev server) build a release: `npm run tauri build`. This bit us once (see git). vite:dev currently running in background.

**Hot reload:** desktop frontend HMRs from vite:dev (:1420). The MOBILE client does NOT — it's a separate single-file bundle (`npm run mobile:build` → `dist-mobile/mobile.html`) the daemon serves statically. To avoid manual rebuilds, run `npx vite build --config vite.mobile.config.ts --watch` (auto-rebuilds on save; phone still needs a manual refresh). Started in background this session.

**Mobile redesign (2026-07-01):** cohesive monospace "pocket terminal" identity. `src/mobile/styles/mobile.css` refined tokens (--surface-2, --accent-soft, --mono), body set to mono. Bottom-nav glyphs (`&#xF120;` etc. = tofu — PUA icon-font that isn't loaded) replaced with inline SVG line icons (App.tsx). tmux-style tab pills, flat borderless key chips, input dock rewritten (`❯` sigil + icon buttons). `src/mobile/components/InputRow.tsx` + `TabBar.tsx` updated. Verified via CDP.

**Phone photo → Claude Code — DONE + VERIFIED:** the phone sends a picked image (FileReader base64) via a new WS `clipboard_image` message; daemon decodes (base64 → `image::load_from_memory` → RGBA8) and sets the PC clipboard via `arboard::set_image`; user pastes into Claude Code with Alt+V. Needed `base64 = "0.22"` + `image` features `["ico","png","jpeg"]` in daemon/Cargo.toml. Mobile: `📎` image button in InputRow (replaced the text-clip button; text clipboard still on the Clipboard tab). Verified end-to-end: sent a valid 8×8 PNG over WS → `Clipboard.GetImage()` returned 8×8. NOTE: base64 image over a WS text frame is fine for phone photos but heavy for huge images — downscale later if needed.

**Terminal-list "duplicate":** the two identical `PS: autogram` tabs are TWO REAL terminals in the same folder E:\code\autogram (user confirmed) — labels collide because the label is just `PS: <folder>`. Easy polish: disambiguate same-label terminals. The earlier "new terminal didn't show / output broke" was multi-client thrash (real phone + CDP emulator + desktop all asserting size on the shared PTY — no cross-client anti-war, only own-echo skip).

**Vision aligned (user, 2026-07-01; refined 2026-07-02):** product = "my Windows terminals in my pocket" — the laptop stays on and does the work; the phone is a REMOTE CONTROL for the laptop and its terminals (not a replacement for the laptop). In PRACTICE ~95% used to drive Claude Code / agents; raw shell commands almost never. So the MECHANISM is a generic agent-agnostic PTY-over-web, but the UX is tuned for driving an agent. Three pillars the user prioritized: (1) ideal terminal on phone, (2) connect from anywhere / survive LTE, (3) attach photo/file INTO the agent. Explicitly NOT wanted: push notifications, general file transfer (use Taildrop/LocalSend), clipboard sync (KDE Connect/Phone Link). File BROWSER: hidden (redundant with the terminal; user ~never browses files). Deep-research workflow verdict backs this: only own the "last inch" that binds bytes to the live agent session; everything else is a solved wheel.

**Mobile redesign v2 (DONE, verified):** minimalist "pocket terminal". Removed the top bar entirely (terminal fills from the top). Hamburger ☰ moved into the input dock (`.m-icon-btn.menu`). A left DRAWER now holds: brand+conn-dot, "+ New terminal", the TERMINALS list (tap to switch), Workspaces, Clipboard, connection footer. Bottom nav + Files tab removed (FilesPage/TabBar components kept but unused). Key strip is collapsible (Toolbar.tsx: ESSENTIAL keys Esc/^C/Tab/⇧Tab/arrows/⏎ always shown + "···" toggle for shell-nerdy extras). Input dock renamed "type a command…"→"message…". All mono, verified via CDP.

**C — robust reconnect (DONE):** `src/mobile/hooks/useSocket.ts` — exponential backoff (0.5s→5s cap) instead of fixed 3s; reconnect immediately on `online` + `visibilitychange`(visible) events (mobile drops the socket on lock/tower-handoff); on (re)connect App requests `get_screen` for every registered terminal to repaint missed output.

**B — attach file/photo INTO agent (NEXT, needs daemon swap):** replace the (Windows-broken) clipboard-image→Alt+V flow with: phone → daemon saves the file (e.g. `%LOCALAPPDATA%\AgentWorkspace\attachments\<ts>_<name>`) → daemon writes the quoted path + trailing space into the target PTY (`"C:\...\file" `). Path-in-prompt attaches real bytes for Claude Code/Codex/opencode; no Alt+V, can't no-op. The 📎 button already exists (currently sends `clipboard_image`); switch it to a new `attach` WS msg carrying the active terminal id.

**D — headless terminals (user's idea, LATER, daemon work):** already ~true (daemon hosts PTYs independent of any UI; killing the app keeps terminals — proven). Gaps to fully realize "terminal = a process we don't see, open on PC if we want": (1) desktop should DISCOVER all daemon terminals on connect (phone-spawned ones don't show on desktop yet); (2) host the shells in tmux so they survive even a DAEMON restart/update (PTYs are daemon children today → die on daemon restart; app-restart already survives).

**Claude TUI on mobile — FULLY VERIFIED (2026-07-01):** spawned real `claude` PTY. CDP at 412×915: (1) View mode renders the interactive prompt cleanly (box borders, colours, `❯ 1/2` menu); (2) Control mode redraws Claude wrapped to phone width (~62 cols), readable; (3) clicking the mobile `↓` toolbar key sent `\x1b[B` → Claude moved its menu selection 1→2 (screenshotted) — i.e. the phone DRIVES Claude interactively, response renders back. Full remote-control-of-Claude-from-phone loop proven. Regression-checked after the app rebuild: still clean.

SHOULD next: touch scroll, robust LTE reconnect (mosh-style), a manual #3 desktop check. NICE: screen-text introspection (screen_manager gives it) → Telegram "needs input" push; app should SyncWorkspaces to a fresh daemon on reconnect (this session the daemon had 0 workspaces → TabBar "—", phone-spawn made workspace-tolerant to cope). Native Android app only worth it for background push/Live-Activities — Telegram covers push far cheaper.

## Rendering fix — IMPLEMENTED (2026-06-23)

View/control modes shipped. Daemon now tracks PTY size per terminal (`DaemonState.terminal_sizes`), set on Spawn, updated on Resize (IPC) and on WS `resize` (control mode), removed on Kill. WS `terminals` payloads carry `cols`/`rows` (`term_to_json` in ws_server.rs). Desktop resizes broadcast `BroadcastMsg::TerminalResized` → forwarded to mobile as `{type:"resize",id,cols,rows}` (IPC push_task skips this variant — desktop drives its own size). Mobile (`src/mobile/App.tsx`): **View mode** (default) resizes xterm to the PTY's cols/rows and shrinks fontSize (CHAR_W≈0.6) to fit screen width — no more `fitAddon.fit()`. **Control mode** computes cols/rows from the phone at fontSize 13 and sends `resize` so the PTY redraws phone-sized (tmux-style active-client-wins; desktop re-asserts on next fit). Toggle persisted in `th-term-mode`. FitAddon removed from mobile.

## Auth token — IMPLEMENTED (2026-06-23)

`DaemonState.ws_token` = 16 random bytes hex (getrandom), per daemon process. Daemon injects `<script>window.__WS_TOKEN__="..."</script>` into the served page (`inject_token`), so the phone authenticates with zero typing. `/ws` and `/api/{dir,file,raw}` require matching `?token=` or reject (404 / 401). Token also in `WsStatus` (protocol.rs, serde default) and surfaced in desktop `ws_server_status` JSON for future Settings display. Mobile helper `src/mobile/api.ts` (`wsUrl`, `apiQuery`) appends the token everywhere. Dev (`mobile:dev`, no daemon) → no token → unauthenticated, fine.

**Status: code complete + compiles (daemon cargo build, mobile build, app cargo check all pass). NOT yet live — needs the daemon-exe swap (see [[daemon-restart-gotcha]]). App rebuild NOT required (serde ignores the extra token field on old app).**

## Known problem: broken terminal rendering on phone (historical — fixed above)

Root cause: PTY is sized by desktop (e.g. 120 cols); server intentionally ignores resize from WS clients; mobile calls `fitAddon.fit()` → local xterm ≈45 cols → wrapped/garbled output, TUI apps (Claude Code) completely broken.

Prior research (session 8966698b, 2026-06-09): 5 options compared, recommended `vt100` crate (~0.15) as server-side virtual screen buffer between PTY and broadcast (PTY at canonical size, per-client rendering; ~10h). Decision then: "Варіант 1 — зараз" = dumb viewer, resize blocked server-side. NOT implemented: no vt100 in Cargo.toml. The dumb-viewer decision was only half-done — server blocks resize, but mobile client still calls `fitAddon.fit()` locally, hence garbled output.

Key constraint: a TUI app draws frames for exactly ONE size — true independent dual-size renders of the same PTY are impossible (vt100 grid helps reflow plain text + clean snapshots, but TUI frames stay drawn for canonical width). Agreed direction (2026-06-10):
1. **View mode (default)**: mobile xterm = exact PTY cols/rows (`term.resize()`, no fit), fontSize computed to fit screen width; daemon must include cols/rows in `terminals` messages + push size changes.
2. **Control mode (toggle)**: phone resizes the real PTY to phone size (TUI apps redraw natively); desktop re-asserts its size when it regains focus. tmux-style "active client wins".

## Security gap

WS server has NO auth on 0.0.0.0 — anyone on LAN can write to terminals. Planned: token shown in desktop Settings, passed as `?token=` on connect. Mitigated meanwhile by using Tailscale instead of LAN exposure.

## Tailscale (set up 2026-06-10)

- Account: vjacheslav.rv@; PC `desktop-4b84653` = `100.116.133.124`, MagicDNS `desktop-4b84653.tail456323.ts.net`; phone "a24" (Android) already in tailnet.
- GUI client `tailscale-ipn.exe` added to HKCU Run autostart (service alone stays in NoState until GUI runs).
- Phone URL (works on LAN and remotely): `http://desktop-4b84653.tail456323.ts.net:9090` or `http://100.116.133.124:9090`.

## Size-gate: per-client independent rendering — IMPLEMENTED (2026-07-01)

**Problem:** both desktop and phone fight over the shared PTY size. Phone's `fitAddon.fit()` on ResizeObserver sends resize that overwrites the desktop's canonical size, causing garbled rendering for whichever client "lost."

**Solution (Variant 1 from research):** daemon tracks `active_client` per terminal. Only the active client may resize the PTY. The passive client CSS-scales the canonical grid to fit its viewport. No other project has solved this (Zellij #4253 open since June 2025).

**Daemon changes:**
- `DaemonState.active_clients: HashMap<String, String>` — maps terminal_id → "ws" or "desktop"
- `DaemonRequest::Write` (desktop input) → active = "desktop"
- `DaemonRequest::Resize` (desktop pane focus/ResizeObserver) → active = "desktop"
- WS `input` → active = "ws"
- WS `resize` with `claim: true` → always accept, active = "ws"
- WS `resize` without claim → only if active is "ws" or nobody → else sends `resize_rejected` to client

**Mobile changes (`src/mobile/App.tsx`):**
- `activeStates: Record<string, boolean>` per terminal — tracks if phone is the active client
- `resize_rejected` handler → sets terminal to inactive (passive mode)
- `TerminalViewWrapper` has two modes:
  - **Active** (default): `fitAddon.fit()` + resize PTY with `claim: true` on user tap (`onPointerDown`)
  - **Passive**: CSS-scale xterm to canonical PTY cols/rows: computes `fontSize = min(12, containerWidth / (cols * 0.6))` so the full canonical grid fits the phone viewport without wrapping
- Tab switch activates: if active → `assertSize(true)` claims; if passive → `applyScale()` re-scales

**Desktop (no changes needed):**
- IPC Resize already sets active to "desktop" (main.rs)
- Desktop always claims on pane focus (existing behavior)
- Desktop follow via `TerminalInstance.tsx` `pty-resize` listener stays local-only

**Verification:** daemon + mobile both compile clean (cargo build + tsc --noEmit)

## Planned work order

1. ~~Fix rendering (cols/rows in protocol, view/control modes)~~ → Size-gate (completed)
2. ~~Auth token~~ (completed)
3. ~~Files/mobile HTTP endpoints~~ (completed)
4. Attach file INTO agent (phone→daemon saves→writes path into PTY)
5. Service worker for full PWA install
