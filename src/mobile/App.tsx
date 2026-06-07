import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useMobileStore } from "./store/mobileStore";
import { useSocket } from "./hooks/useSocket";
import type { ServerMessage } from "./types";
import { ConnectScreen } from "./components/ConnectScreen";
import { TabBar } from "./components/TabBar";
import { Toolbar } from "./components/Toolbar";
import { InputRow } from "./components/InputRow";
import { WorkspacePicker } from "./components/WorkspacePicker";

export function App() {
  const {
    connection,
    terminals,
    activeTerminalId,
    showWorkspacePicker,
    setTerminals,
    setActiveTerminalId,
    setWorkspaces,
    setShowWorkspacePicker,
  } = useMobileStore();

  const termRegistry = useRef<Map<string, { term: Terminal; fit: FitAddon }>>(
    new Map()
  );

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "terminals":
          setTerminals(msg.data);
          if (msg.data.length > 0) {
            const current = useMobileStore.getState().activeTerminalId;
            if (!current || !msg.data.find((t) => t.id === current)) {
              setActiveTerminalId(msg.data[0].id);
            }
          }
          break;
        case "output":
        case "buffer":
          termRegistry.current.get(msg.id)?.term.write(msg.data);
          break;
        case "workspaces":
          setWorkspaces(msg.data, msg.activeIdx);
          break;
      }
    },
    [setTerminals, setActiveTerminalId, setWorkspaces]
  );

  const { connect, send } = useSocket(handleMessage);

  const handleConnect = useCallback(
    (host: string) => connect(host),
    [connect]
  );

  useEffect(() => {
    const loc = window.location;
    if (loc.port && loc.hostname !== "localhost" && loc.hostname !== "127.0.0.1") {
      connect(loc.host);
    } else {
      const saved = localStorage.getItem("th-mobile-host");
      if (saved) connect(saved);
    }
  }, [connect]);

  const handleTerminalData = useCallback(
    (data: string) => {
      const id = useMobileStore.getState().activeTerminalId;
      if (id) send({ type: "input", id, data });
    },
    [send]
  );

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      const id = useMobileStore.getState().activeTerminalId;
      if (id) send({ type: "resize", id, cols, rows });
    },
    [send]
  );

  const handleSelectTerminal = useCallback(
    (id: string) => {
      setActiveTerminalId(id);
      send({ type: "input", id, data: "" });
    },
    [setActiveTerminalId, send]
  );

  const handleSwitchWorkspace = useCallback(
    (idx: number) => {
      send({ type: "switch_workspace", idx });
    },
    [send]
  );

  const handleCreateWorkspace = useCallback(
    (name: string, color: number) => {
      send({ type: "create_workspace", name, color });
    },
    [send]
  );

  const handleDeleteWorkspace = useCallback(
    (idx: number) => {
      send({ type: "delete_workspace", idx });
    },
    [send]
  );

  const registerTerminal = useCallback(
    (id: string, term: Terminal, fit: FitAddon) => {
      termRegistry.current.set(id, { term, fit });
    },
    []
  );

  const unregisterTerminal = useCallback((id: string) => {
    termRegistry.current.delete(id);
  }, []);

  if (connection !== "connected") {
    return <ConnectScreen onConnect={handleConnect} />;
  }

  return (
    <div className="m-app">
      <TabBar
        onSelect={handleSelectTerminal}
        onWorkspaceClick={() => setShowWorkspacePicker(true)}
      />

      <div className="m-terminal-area">
        {terminals.map((t) => (
          <TerminalViewWrapper
            key={t.id}
            id={t.id}
            active={t.id === activeTerminalId}
            onData={handleTerminalData}
            onResize={handleResize}
            onRegister={registerTerminal}
            onUnregister={unregisterTerminal}
          />
        ))}
      </div>

      <Toolbar onKey={handleTerminalData} />
      <InputRow onSend={handleTerminalData} />

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
  onData,
  onResize,
  onRegister,
  onUnregister,
}: {
  id: string;
  active: boolean;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onRegister: (id: string, term: Terminal, fit: FitAddon) => void;
  onUnregister: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);

  const refCallback = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && !initializedRef.current) {
        initializedRef.current = true;

        const term = new Terminal({
          fontSize: 13,
          fontFamily: "'Cascadia Mono', 'Courier New', monospace",
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

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(el);
        term.onData(onData);
        term.onResize(({ cols, rows }) => onResize(cols, rows));

        termRef.current = term;
        fitRef.current = fitAddon;
        onRegister(id, term, fitAddon);

        requestAnimationFrame(() => fitAddon.fit());

        const ro = new ResizeObserver(() => {
          if (fitRef.current) fitRef.current.fit();
        });
        ro.observe(el);
      }
    },
    [id, onData, onResize, onRegister]
  );

  useRef(() => {
    return () => {
      onUnregister(id);
      termRef.current?.dispose();
    };
  });

  return (
    <div
      ref={refCallback}
      className="m-terminal"
      style={{ display: active ? "block" : "none" }}
    />
  );
}
