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
      } catch (e: any) {
        showToast(`Upload failed: ${e.message}`);
      }
    },
    [host, showToast]
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

function TerminalViewWrapper({
  id,
  active,
  isActive,
  cols,
  rows,
  fontSize,
  onData,
  onResize,
  onActivate,
  onRegister,
  onUnregister,
  onRegisterSearch,
  onUnregisterSearch,
}: {
  id: string;
  active: boolean;
  isActive: boolean;
  cols?: number;
  rows?: number;
  fontSize: number;
  onData: (data: string) => void;
  onResize: (id: string, cols: number, rows: number, claim?: boolean) => void;
  onActivate: () => void;
  onRegister: (id: string, term: Terminal) => void;
  onUnregister: (id: string) => void;
  onRegisterSearch: (id: string, addon: SearchAddon) => void;
  onUnregisterSearch: (id: string) => void;
}) {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lastSentRef = useRef({ c: 0, r: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const initializedRef = useRef(false);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  // Active mode: fit to container + claim PTY size via resize(claim:true).
  // Passive mode: render at canonical PTY size, CSS-scale font to fit viewport.
  const assertSize = useCallback((claim: boolean = false) => {
    const term = termRef.current;
    const el = containerRef.current;
    const fit = fitRef.current;
    if (!term || !el || !fit) return;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    const fs = fontSizeRef.current;
    if (term.options.fontSize !== fs) term.options.fontSize = fs;
    try { fit.fit(); } catch {}
    const c = term.cols;
    const r = term.rows;
    if (c > 0 && r > 0 && (c !== lastSentRef.current.c || r !== lastSentRef.current.r)) {
      lastSentRef.current = { c, r };
      onResize(id, c, r, claim);
    }
  }, [id, onResize]);

  // CSS-scale when not active: render canonical PTY grid scaled to fit viewport.
  const applyScale = useCallback(() => {
    const term = termRef.current;
    const el = containerRef.current;
    if (!term || !el || !cols || !rows) return;
    if (el.clientWidth === 0) return;
    const targetFs = Math.max(5, Math.min(12, el.clientWidth / (cols * 0.6)));
    if (term.options.fontSize !== targetFs) {
      term.options.fontSize = targetFs;
    }
    if (term.cols !== cols || term.rows !== rows) {
      term.resize(cols, rows);
      lastSentRef.current = { c: cols, r: rows };
    }
  }, [cols, rows]);

  const refCallback = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && !initializedRef.current) {
        initializedRef.current = true;
        containerRef.current = el;

        const term = new Terminal({
          fontSize: fontSizeRef.current,
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          theme: {
            background: "#0a0a0a",
            foreground: "#d4d4d4",
            cursor: "#e94560",
            cursorAccent: "#0a0a0a",
            selectionBackground: "rgba(83,52,131,0.4)",
            black: "#1e1e1e",
            red: "#f44747",
            green: "#6a9955",
            yellow: "#d7ba7d",
            blue: "#569cd6",
            magenta: "#c586c0",
            cyan: "#4ec9b0",
            white: "#d4d4d4",
            brightBlack: "#808080",
            brightRed: "#f44747",
            brightGreen: "#6a9955",
            brightYellow: "#d7ba7d",
            brightBlue: "#569cd6",
            brightMagenta: "#c586c0",
            brightCyan: "#4ec9b0",
            brightWhite: "#ffffff",
          },
          cursorBlink: true,
          scrollback: 5000,
        });

        const fit = new FitAddon();
        term.loadAddon(fit);
        fitRef.current = fit;

        const search = new SearchAddon();
        term.loadAddon(search);
        onRegisterSearch(id, search);

        term.open(el);
        const ta = (term as unknown as { textarea?: HTMLTextAreaElement }).textarea;
        if (ta) {
          ta.setAttribute("autocorrect", "off");
          ta.setAttribute("autocapitalize", "off");
          ta.setAttribute("autocomplete", "off");
          ta.spellcheck = false;
        }
        term.onData(onData);

        termRef.current = term;
        onRegister(id, term);

        requestAnimationFrame(() => {
          if (isActiveRef.current) {
            assertSize(false);
          } else {
            applyScale();
          }
        });

        const ro = new ResizeObserver(() => {
          if (isActiveRef.current) {
            assertSize(false);
          } else {
            applyScale();
          }
        });
        ro.observe(el);
        roRef.current = ro;
      }
    },
    [id, onData, onRegister, onRegisterSearch, assertSize, applyScale]
  );

  // Live font-size changes from Settings apply immediately to the active terminal.
  useEffect(() => {
    if (active && isActiveRef.current) assertSize(true);
  }, [fontSize, active, assertSize]);

  // Tab switch: if active, try to claim; if passive, apply scale.
  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        if (isActiveRef.current) {
          assertSize(true);
        } else {
          applyScale();
        }
      });
    }
  }, [active, assertSize, applyScale]);

  // Follow canonical PTY size from daemon (set by another client).
  useEffect(() => {
    const term = termRef.current;
    if (!term || !cols || !rows) return;
    if (cols === lastSentRef.current.c && rows === lastSentRef.current.r) return;
    if (term.cols !== cols || term.rows !== rows) {
      try { term.resize(cols, rows); } catch {}
    }
    // If passive and canonical size changed, re-apply CSS-scale.
    if (!isActiveRef.current) {
      applyScale();
    }
  }, [cols, rows, applyScale]);

  useEffect(() => {
    return () => {
      roRef.current?.disconnect();
      onUnregister(id);
      onUnregisterSearch(id);
      termRef.current?.dispose();
    };
  }, [id, onUnregister, onUnregisterSearch]);

  // User taps the terminal: claim ownership + assert phone size.
  const handlePointerDown = useCallback(() => {
    onActivate();
    assertSize(true);
  }, [onActivate, assertSize]);

  return (
    <div
      ref={refCallback}
      className="m-terminal"
      onPointerDown={handlePointerDown}
      style={{ display: active ? "block" : "none" }}
    />
  );
}
