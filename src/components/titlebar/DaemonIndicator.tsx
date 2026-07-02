import { useState, useEffect, useRef, useCallback } from "react";
import { daemonStatus, shutdownDaemon, restartDaemon, listTerminals, killTerminal, wsServerStatus } from "../../hooks/useTauriIpc";
import QRLogin from "../QRLogin";
import s from "./DaemonIndicator.module.css";

interface TerminalEntry {
  id: string;
  label: string;
  cwd: string;
  command: string;
  title: string;
  workspace: string;
}

function terminalDisplayName(t: TerminalEntry): { name: string; detail: string } {
  const detail = t.cwd ? t.cwd.replace(/\\/g, "/") : "";
  if (t.command) {
    const cmd = t.command.split(/\s+/)[0];
    const base = cmd.includes("/") || cmd.includes("\\")
      ? cmd.split(/[/\\]/).pop()!
      : cmd;
    return { name: base, detail };
  }
  return { name: "PowerShell", detail };
}

type DaemonMode = "daemon" | "direct" | "unknown";

export default function DaemonIndicator() {
  const [mode, setMode] = useState<DaemonMode>("unknown");
  const [connected, setConnected] = useState(false);
  const [terminalCount, setTerminalCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [terminals, setTerminals] = useState<TerminalEntry[]>([]);
  const [confirming, setConfirming] = useState<"shutdown" | "killAll" | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [protocolMismatch, setProtocolMismatch] = useState(false);
  const [wsIps, setWsIps] = useState<string[]>([]);
  const [wsPort, setWsPort] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number>(0);

  const pollStatus = useCallback(async () => {
    try {
      const st = await daemonStatus();
      setMode("daemon");
      setConnected(st.connected);
      setTerminalCount(st.terminalCount);
      setProtocolMismatch(!!st.protocolMismatch);
    } catch {
      setMode("direct");
      setConnected(false);
      setTerminalCount(0);
    }
  }, []);

  useEffect(() => {
    pollStatus();
    timerRef.current = window.setInterval(pollStatus, 5000);
    return () => clearInterval(timerRef.current);
  }, [pollStatus]);

  useEffect(() => {
    if (!menuOpen) {
      setConfirming(null);
      return;
    }
    listTerminals()
      .then(setTerminals)
      .catch(() => setTerminals([]));
    wsServerStatus()
      .then((st) => {
        setWsIps(st.ips || []);
        setWsPort(st.port);
      })
      .catch(() => {
        setWsIps([]);
        setWsPort(0);
      });

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleKillTerminal = async (id: string) => {
    await killTerminal(id).catch(() => {});
    setTerminals((prev) => prev.filter((t) => t.id !== id));
    setTerminalCount((prev) => Math.max(0, prev - 1));
  };

  const handleKillAll = async () => {
    if (confirming !== "killAll") {
      setConfirming("killAll");
      return;
    }
    for (const t of terminals) {
      await killTerminal(t.id).catch(() => {});
    }
    setTerminals([]);
    setTerminalCount(0);
    setConfirming(null);
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await restartDaemon();
      await pollStatus();
      listTerminals().then(setTerminals).catch(() => {});
    } catch {
      // stays disconnected — user can retry
    } finally {
      setRestarting(false);
    }
  };

  const handleShutdown = async () => {
    if (confirming !== "shutdown") {
      setConfirming("shutdown");
      return;
    }
    await shutdownDaemon().catch(() => {});
    setConnected(false);
    setTerminalCount(0);
    setTerminals([]);
    setMenuOpen(false);
    setConfirming(null);
  };

  // Group terminals by workspace
  const grouped = new Map<string, TerminalEntry[]>();
  for (const t of terminals) {
    const ws = t.workspace || "No workspace";
    if (!grouped.has(ws)) grouped.set(ws, []);
    grouped.get(ws)!.push(t);
  }

  return (
    <div className={s.wrapper} ref={menuRef}>
      <button
        className={s.indicator}
        onClick={() => setMenuOpen(!menuOpen)}
        title={
          mode === "direct" ? "Direct mode" :
          connected ? `Daemon: ${terminalCount} terminals` : "Daemon disconnected"
        }
      >
        <span className={`${s.dot} ${
          mode === "direct" ? s.dotDirect :
          connected ? s.dotOn : s.dotOff
        }`} />
        {terminalCount > 0 && <span className={s.count}>{terminalCount}</span>}
      </button>

      {menuOpen && (
        <div className={s.menu}>
          <div className={s.menuHeader}>
            <span className={`${s.dot} ${
              mode === "direct" ? s.dotDirect :
              connected ? s.dotOn : s.dotOff
            }`} />
            <span>{
              mode === "direct" ? "Direct mode" :
              connected ? "Daemon active" : "Daemon disconnected"
            }</span>
          </div>

          {wsPort > 0 && wsIps.length > 0 && (
            <QRLogin ips={wsIps} port={wsPort} />
          )}

          {terminals.length > 0 && (
            <div className={s.terminalList}>
              {[...grouped.entries()].map(([wsName, items], gi) => (
                <div key={wsName}>
                  <div className={s.wsGroup} style={gi > 0 ? { marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 } : undefined}>
                    <span className={s.wsName}>{wsName}</span>
                    <span className={s.wsCount}>{items.length}</span>
                  </div>
                  {items.map((t) => {
                    const { name, detail } = terminalDisplayName(t);
                    return (
                      <div key={t.id} className={s.terminalItem}>
                        <div className={s.terminalInfo}>
                          <span className={s.terminalName}>{name}</span>
                          <span className={s.terminalDetail}>{detail}</span>
                        </div>
                        <button
                          className={s.killBtn}
                          onClick={() => handleKillTerminal(t.id)}
                          title="Kill terminal"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M3 3l6 6M9 3l-6 6" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {protocolMismatch && connected && (
            <div className={s.emptyMsg} style={{ color: "#e5a50a" }}>
              Daemon is outdated (protocol mismatch). Shutdown daemon, then restart it to update.
            </div>
          )}

          {terminals.length === 0 && connected && (
            <div className={s.emptyMsg}>No background terminals</div>
          )}

          <div className={s.menuActions}>
            {!connected && mode !== "direct" && (
              <button className={s.actionBtn} onClick={handleRestart} disabled={restarting}>
                {restarting ? "Restarting…" : "Restart daemon"}
              </button>
            )}
            {terminals.length > 0 && (
              <button
                className={`${s.actionBtn} ${confirming === "killAll" ? s.actionDanger : ""}`}
                onClick={handleKillAll}
              >
                {confirming === "killAll" ? "Confirm kill all?" : "Kill all terminals"}
              </button>
            )}
            {connected && (
              <button
                className={`${s.actionBtn} ${confirming === "shutdown" ? s.actionDanger : ""}`}
                onClick={handleShutdown}
              >
                {confirming === "shutdown" ? "Confirm shutdown?" : "Shutdown daemon"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
