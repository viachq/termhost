import { useCallback, useRef, useEffect, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { useMobileStore } from "./store/mobileStore";
import { useSocket } from "./hooks/useSocket";
import type { ServerMessage } from "./types";
import { ConnectScreen } from "./components/ConnectScreen";
import { Toolbar } from "./components/Toolbar";
import { InputRow } from "./components/InputRow";
import { uploadFile } from "./api";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { ClipboardPage } from "./components/ClipboardPage";
import { CustomizeToolbar } from "./components/CustomizeToolbar";
import { Toast } from "./components/Toast";
import { Home } from "./components/Home";
import { Settings } from "./components/Settings";
import { FilesPage } from "./components/FilesPage";
import { SearchBar } from "./components/SearchBar";
import { SnippetBar } from "./components/SnippetBar";
import { ScreenView } from "./components/ScreenView";
import { haptic } from "./haptics";

type TermSize = { cols: number; rows: number };

export function App() {
  const {
    connection,
    host,
    terminals,
    activeTerminalId,
    showWorkspacePicker,
    workspaces,
    activeWorkspaceIdx,
    setTerminals,
    setActiveTerminalId,
    setWorkspaces,
    setShowWorkspacePicker,
    showToast,
    fontSize,
    theme,
    accent,
    snippets,
  } = useMobileStore();

  const [showSearch, setShowSearch] = useState(false);
  const searchRegistry = useRef<Map<string, SearchAddon>>(new Map());
  const registerSearch = useCallback((id: string, addon: SearchAddon) => {
    searchRegistry.current.set(id, addon);
  }, []);
  const unregisterSearch = useCallback((id: string) => {
    searchRegistry.current.delete(id);
  }, []);

  // Reflect theme/accent prefs onto the document so all screens (Home, Files,
  // Settings, the terminal chrome) pick them up via the existing CSS variables.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty(
      "--accent-soft",
      accent.length === 7 ? `${accent}1f` : accent
    );
  }, [theme, accent]);

  // "home" = dashboard (workspace chips, terminal cards, quick actions).
  // "terminal" = the focused fullscreen terminal + keybar + input dock.
  const [view, setView] = useState<"home" | "terminal">("home");
  const [showClipboard, setShowClipboard] = useState(false);
const [showFiles, setShowFiles] = useState(false);
const [showSettings, setShowSettings] = useState(false);
const [showScreen, setShowScreen] = useState(false);
const [showCustomizeToolbar, setShowCustomizeToolbar] = useState(false);
const [keysOpen, setKeysOpen] = useState(() => localStorage.getItem("th-keys-open") !== "0");
const [activeStates, setActiveStates] = useState<Record<string, boolean>>({});

  // Last time each terminal produced output — drives the home screen's "recently
  // active" dot so you can see which agent is doing something without opening it.
  const lastOutputAt = useRef<Record<string, number>>({});
  // Ticks while the home screen is visible so the dot fades out ~8s after output
  // stops, even with no new messages arriving to trigger a render.
  const [, tick] = useState(0);
  useEffect(() => {
    if (view !== "home") return;
    const t = setInterval(() => tick((v) => v + 1), 2000);
    return () => clearInterval(t);
  }, [view]);

  // A tap on "New terminal" spawns async; once the daemon's next terminal list
  // includes an id we haven't seen before, jump straight into it.
  const pendingSpawnRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const toggleKeys = useCallback(() => {
    setKeysOpen((v) => {
      const n = !v;
      localStorage.setItem("th-keys-open", n ? "1" : "0");
      return n;
    });
  }, []);

  const termRegistry = useRef<Map<string, Terminal>>(new Map());
  // Canonical PTY grid per terminal, fed by the daemon (view mode renders to it).
  const [sizes, setSizes] = useState<Record<string, TermSize>>({});

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "terminals": {
          if (pendingSpawnRef.current) {
            const fresh = msg.data.find((t) => !knownIdsRef.current.has(t.id));
            if (fresh) {
              setActiveTerminalId(fresh.id);
              setView("terminal");
              pendingSpawnRef.current = false;
            }
          }
          knownIdsRef.current = new Set(msg.data.map((t) => t.id));

          setTerminals(msg.data);
          setSizes((prev) => {
            const next = { ...prev };
            for (const t of msg.data) {
              if (t.cols && t.rows) next[t.id] = { cols: t.cols, rows: t.rows };
            }
            return next;
          });
          if (msg.data.length > 0) {
            const current = useMobileStore.getState().activeTerminalId;
            if (!current || !msg.data.find((t) => t.id === current)) {
              setActiveTerminalId(msg.data[0].id);
            }
          }
          break;
        }
        case "output":
          lastOutputAt.current[msg.id] = Date.now();
          termRegistry.current.get(msg.id)?.write(msg.data);
          break;
        case "buffer":
          termRegistry.current.get(msg.id)?.write(msg.data);
          break;
        case "screen": {
          // Clean current-screen snapshot: reset then paint so a freshly attached
          // phone shows the live screen instead of a blank/scrolled-off terminal.
          const term = termRegistry.current.get(msg.id);
          if (term) {
            term.reset();
            term.write(msg.data);
          }
          break;
        }
        case "resize":
          setSizes((prev) => ({ ...prev, [msg.id]: { cols: msg.cols, rows: msg.rows } }));
          break;
        case "resize_rejected":
          setActiveStates((prev) => ({ ...prev, [msg.id]: false }));
          break;
        case "workspaces":
          setWorkspaces(msg.data, msg.activeIdx);
          break;
        case "clipboard_ok":
          showToast(
            msg.ok
              ? msg.image
                ? "Image → PC clipboard · Alt+V in Claude"
                : "Copied to PC clipboard"
              : "Failed to copy"
          );
          break;
      }
    },
    [setTerminals, setActiveTerminalId, setWorkspaces, showToast]
  );

  const { connect, disconnect, send } = useSocket(handleMessage);
  // Share WS send with ScreenView for MJPEG mode
  useEffect(() => { (window as any).__screenSendRef = { current: send }; }, [send]);

  const handleConnect = useCallback((host: string) => connect(host), [connect]);

  const handleTerminalData = useCallback(
    (data: string) => {
      const id = useMobileStore.getState().activeTerminalId;
      if (id) send({ type: "input", id, data });
    },
    [send]
  );

  const handleResize = useCallback(
    (id: string, cols: number, rows: number, claim?: boolean) => {
      send({ type: "resize", id, cols, rows, claim });
    },
    [send]
  );

  const handleSelectTerminal = useCallback(
    (id: string) => {
      setActiveTerminalId(id);
      setView("terminal");
    },
    [setActiveTerminalId]
  );

  // Swipe left/right (within the terminal view) cycles to the next/previous
  // terminal. Deliberately horizontal-only, with a velocity+distance gate, so
  // it doesn't fight xterm's own vertical scroll/selection touch handling.
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, []);
  const handleSwipeEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = swipeRef.current;
      swipeRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const dt = Date.now() - start.t;
      if (dt > 500 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
      const list = useMobileStore.getState().terminals;
      if (list.length < 2) return;
      const curId = useMobileStore.getState().activeTerminalId;
      const idx = list.findIndex((x) => x.id === curId);
      if (idx === -1) return;
      const next = dx < 0
        ? list[(idx + 1) % list.length]
        : list[(idx - 1 + list.length) % list.length];
      haptic();
      setActiveTerminalId(next.id);
    },
    [setActiveTerminalId]
  );

  const handleSwitchWorkspace = useCallback(
    (idx: number) => send({ type: "switch_workspace", idx }),
    [send]
  );

  const handleCreateWorkspace = useCallback(
    (name: string, color: number) => send({ type: "create_workspace", name, color }),
    [send]
  );

  const handleDeleteWorkspace = useCallback(
    (idx: number) => send({ type: "delete_workspace", idx }),
    [send]
  );

  const handleSpawn = useCallback((cwd?: string) => {
    pendingSpawnRef.current = true;
    send({ type: "spawn", wsIdx: useMobileStore.getState().activeWorkspaceIdx, cwd });
  }, [send]);

const handleOpenInTerminal = useCallback((cwd: string) => {
  setShowFiles(false);
  handleSpawn(cwd);
}, [handleSpawn]);

const handleDeleteTerminal = useCallback(
    (id: string) => send({ type: "kill", id }),
    [send]
  );

  // Long-press the home-screen icon → "Quick text" / "New terminal" shortcuts
  // (manifest.json `shortcuts`) land here as ?shortcut=... — skip the Home
  // dashboard entirely so typing something at 2am is one tap, not three.
  const shortcutHandledRef = useRef(false);
  useEffect(() => {
    if (connection !== "connected" || shortcutHandledRef.current) return;
    const shortcut = new URLSearchParams(window.location.search).get("shortcut");
    if (!shortcut) return;
    shortcutHandledRef.current = true;
    if (shortcut === "text") {
      setShowClipboard(true);
    } else if (shortcut === "new") {
      handleSpawn();
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [connection, handleSpawn]);

  const handleClipboard = useCallback(
    (data: string) => send({ type: "clipboard", data }),
    [send]
  );

  const handleTypeGlobal = useCallback(
    (text: string) => send({ type: "type_global", text }),
    [send]
  );

  const handleKeyGlobal = useCallback(
    (key: string) => send({ type: "key_global", key }),
    [send]
  );

  const handleImage = useCallback(
    (name: string, data: string) => send({ type: "clipboard_image", name, data }),
    [send]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      try {
        const path = await uploadFile(host, file);
        showToast(`Uploaded: ${path}`);
        // Auto-inject file path into the active terminal so the AI agent
        // sees the reference directly (path injection, not clipboard-only).
        const activeId = useMobileStore.getState().activeTerminalId;
        if (activeId) {
          send({ type: "inject_file", id: activeId, path });
        }
      } catch (e: any) {
        showToast(`Upload failed: ${e.message}`);
      }
    },
    [host, showToast, send]
  );

  const handleSendToTerminal = useCallback(
    (id: string, data: string) => send({ type: "input", id, data }),
    [send]
  );

  const registerTerminal = useCallback(
    (id: string, term: Terminal) => {
      termRegistry.current.set(id, term);
      // Paint the current screen immediately — otherwise a freshly-attached phone
      // shows a blank terminal until the next byte of live output arrives.
      // get_screen = clean vt100 snapshot (new daemon); falls back silently if the
      // daemon predates it — get_buffer would scroll a redraw-shell prompt off-screen.
      send({ type: "get_screen", id });
    },
    [send]
  );

  const unregisterTerminal = useCallback((id: string) => {
    termRegistry.current.delete(id);
  }, []);

  // Repaint every open terminal whenever we (re)connect — a dropped socket misses
  // live output, so pull a fresh vt100 snapshot. On the very first connect the
  // registry is empty (each terminal requests its own screen on mount).
  useEffect(() => {
    if (connection === "connected") {
      for (const id of termRegistry.current.keys()) {
        send({ type: "get_screen", id });
      }
    }
  }, [connection, send]);

  if (connection !== "connected") {
    return <ConnectScreen onConnect={handleConnect} />;
  }

  return (
    <div className="m-app">
{view === "home" && (
  <Home
    terminals={terminals}
    activeTerminalId={activeTerminalId}
    workspaces={workspaces}
    activeWorkspaceIdx={activeWorkspaceIdx}
    connected={connection === "connected"}
    lastOutputAt={lastOutputAt}
    onSelectTerminal={handleSelectTerminal}
    onNewTerminal={handleSpawn}
    onSwitchWorkspace={handleSwitchWorkspace}
    onManageWorkspaces={() => setShowWorkspacePicker(true)}
    onOpenFiles={() => setShowFiles(true)}
    onOpenClipboard={() => setShowClipboard(true)}
    onOpenSettings={() => setShowSettings(true)}
    onOpenScreen={() => setShowScreen(true)}
    onDeleteTerminal={handleDeleteTerminal}
  />
)}
      <div className="m-terminal-shell" style={{ display: view === "terminal" ? "flex" : "none" }}>
        <div className="m-terminal-area" onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
          {terminals.map((t) => (
            <TerminalViewWrapper
              key={t.id}
              id={t.id}
              active={t.id === activeTerminalId}
              isActive={activeStates[t.id] ?? true}
              cols={sizes[t.id]?.cols}
              rows={sizes[t.id]?.rows}
              fontSize={fontSize}
              onData={handleTerminalData}
              onResize={handleResize}
              onActivate={() => setActiveStates((prev) => ({ ...prev, [t.id]: true }))}
              onRegister={registerTerminal}
              onUnregister={unregisterTerminal}
              onRegisterSearch={registerSearch}
              onUnregisterSearch={unregisterSearch}
            />
          ))}
        </div>

        {showSearch && (
          <SearchBar
            onFind={(q, backwards) => {
              const addon = activeTerminalId ? searchRegistry.current.get(activeTerminalId) : undefined;
              if (!addon || !q) return;
              backwards ? addon.findPrevious(q) : addon.findNext(q);
            }}
            onClose={() => setShowSearch(false)}
          />
        )}

        {snippets.length > 0 && (
          <SnippetBar
            snippets={snippets}
            onSend={(text) => {
              haptic();
              handleTerminalData(text + "\r");
            }}
          />
        )}

        {/* Quick action buttons: spawn terminal + copy screen */}
        <div className="m-quick-actions">
          <button className="m-quick-btn" onTouchStart={(e) => { e.preventDefault(); haptic(); handleSpawn(); }} onClick={() => { haptic(); handleSpawn(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            <span>New</span>
          </button>
          <button className="m-quick-btn" onTouchStart={(e) => { e.preventDefault(); haptic(); if (activeTerminalId) send({ type: "get_screen", id: activeTerminalId }); }} onClick={() => { haptic(); if (activeTerminalId) send({ type: "get_screen", id: activeTerminalId }); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <span>Screen</span>
          </button>
        </div>

        {keysOpen && <Toolbar onKey={handleTerminalData} />}
        <InputRow
          onImage={handleImage}
          onUpload={handleUpload}
          onMenu={() => setView("home")}
          onSearch={() => setShowSearch((v) => !v)}
          keysOpen={keysOpen}
          onToggleKeys={toggleKeys}
        />
      </div>

      {showCustomizeToolbar && (
        <CustomizeToolbar onClose={() => setShowCustomizeToolbar(false)} />
      )}

      {showSettings && (
        <div className="m-page-overlay">
          <div className="m-page-head">
            <button className="m-page-back" onClick={() => setShowSettings(false)} aria-label="Back">
              ‹
            </button>
            <span>Settings</span>
          </div>
          <Settings
            host={host}
            connected={connection === "connected"}
            onCustomizeToolbar={() => setShowCustomizeToolbar(true)}
            onChangeServer={() => {
              setShowSettings(false);
              disconnect();
            }}
            onSwitchHost={(h) => {
              setShowSettings(false);
              handleConnect(h);
            }}
          />
        </div>
      )}

      {showFiles && (
        <div className="m-page-overlay">
          <div className="m-page-head">
            <button className="m-page-back" onClick={() => setShowFiles(false)} aria-label="Back">
              ‹
            </button>
            <span>Files</span>
          </div>
          <FilesPage onOpenInTerminal={handleOpenInTerminal} />
        </div>
      )}

      {showClipboard && (
        <div className="m-page-overlay">
          <div className="m-page-head">
            <button className="m-page-back" onClick={() => setShowClipboard(false)} aria-label="Back">
              ‹
            </button>
            <span>Clipboard</span>
          </div>
          <ClipboardPage onClipboard={handleClipboard} onTerminal={handleSendToTerminal} onTypeGlobal={handleTypeGlobal} onKeyGlobal={handleKeyGlobal} />
        </div>
      )}

      {showScreen && (
        <div className="m-page-overlay">
          <div className="m-page-head">
            <button className="m-page-back" onClick={() => setShowScreen(false)} aria-label="Back">
              ‹
            </button>
            <span>Screen</span>
          </div>
          <ScreenView active={showScreen} />
        </div>
      )}

      <Toast />

      {showWorkspacePicker && (
        <WorkspacePicker
          onSwitch={handleSwitchWorkspace}
          onCreate={handleCreateWorkspace}
          onDelete={handleDeleteWorkspace}
          onClose={() => setShowWorkspacePicker(false)}
        />
      )}
    </div>
  );
}
