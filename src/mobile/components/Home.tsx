import type { MutableRefObject } from "react";
import type { TerminalInfo, WorkspaceInfo } from "../types";
import { useMobileStore } from "../store/mobileStore";
import { haptic } from "../haptics";
import { Icon } from "./Icon";

const ACTIVITY_WINDOW_MS = 8000;

interface Props {
  terminals: TerminalInfo[];
  activeTerminalId: string | null;
  workspaces: WorkspaceInfo[];
  activeWorkspaceIdx: number;
  connected: boolean;
  lastOutputAt: MutableRefObject<Record<string, number>>;
  onSelectTerminal: (id: string) => void;
  onNewTerminal: () => void;
  onSwitchWorkspace: (idx: number) => void;
  onManageWorkspaces: () => void;
  onOpenFiles: () => void;
  onOpenClipboard: () => void;
  onOpenSettings: () => void;
  onOpenScreen: () => void;
  onDeleteTerminal: (id: string) => void;
}

export function Home({
  terminals,
  activeTerminalId,
  workspaces,
  activeWorkspaceIdx,
  connected,
  lastOutputAt,
  onSelectTerminal,
  onNewTerminal,
  onSwitchWorkspace,
  onManageWorkspaces,
  onOpenFiles,
  onOpenClipboard,
  onOpenSettings,
  onDeleteTerminal,
}: Props) {
  const { pinnedIds, togglePinned, termOrder, moveTerminal } = useMobileStore();

  // Pinned first, then by saved custom order; terminals not yet in termOrder
  // (new ones) fall back to daemon order, appended after known ones.
  const orderIndex = (id: string) => {
    const i = termOrder.indexOf(id);
    return i === -1 ? termOrder.length + terminals.findIndex((t) => t.id === id) : i;
  };
  const sortedTerminals = [...terminals].sort((a, b) => {
    const ap = pinnedIds.includes(a.id) ? 1 : 0;
    const bp = pinnedIds.includes(b.id) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return orderIndex(a.id) - orderIndex(b.id);
  });
  const orderedIds = sortedTerminals.map((t) => t.id);

  const tap = (fn: () => void) => () => {
    haptic();
    fn();
  };

  const deleteTerminal = (t: TerminalInfo) => {
    if (!window.confirm(`Delete "${t.label}"? This ends the process.`)) return;
    haptic();
    onDeleteTerminal(t.id);
  };

  return (
    <div className="m-home">
      <div className="m-home-header">
        <span className="m-home-title">
          termhost
          <span className={`m-conn-dot ${connected ? "on" : ""}`} />
        </span>
        <span className="m-home-header-actions">
          <button className="m-home-tile-icon accent" onClick={tap(onNewTerminal)} aria-label="New terminal">
            <Icon name="plus" size={18} />
          </button>
          <button className="m-home-tile-icon" onClick={tap(onManageWorkspaces)} aria-label="New workspace">
            <Icon name="layers" size={18} />
          </button>
          <button className="m-home-tile-icon" onClick={tap(onOpenScreen)} aria-label="Screen view">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </button>
          <button className="m-home-tile-icon" onClick={tap(onOpenFiles)} aria-label="Files">
            <Icon name="files" size={18} />
          </button>
          <button className="m-icon-btn" onClick={tap(onOpenClipboard)} aria-label="Remote">
            <Icon name="drive" />
          </button>
          <button className="m-icon-btn" onClick={tap(onOpenSettings)} aria-label="Settings">
            <Icon name="settings" />
          </button>
        </span>
      </div>

      {workspaces.length > 0 && (
        <div className="m-home-chips">
          {workspaces.map((w, i) => (
            <button
              key={w.name}
              className={`m-home-chip ${i === activeWorkspaceIdx ? "active" : ""}`}
              onClick={tap(() => onSwitchWorkspace(i))}
            >
              {w.name}
            </button>
          ))}
          <button className="m-home-chip manage" onClick={tap(onManageWorkspaces)} aria-label="Manage workspaces">
            <Icon name="more" size={14} />
          </button>
        </div>
      )}

      <div className="m-home-terms">
        {terminals.length === 0 && (
          <div className="m-drawer-empty">No terminals yet — tap the + above.</div>
        )}
        {sortedTerminals.map((t, i) => {
          const recentlyActive =
            Date.now() - (lastOutputAt.current[t.id] ?? 0) < ACTIVITY_WINDOW_MS;
          const pinned = pinnedIds.includes(t.id);
          return (
            <button
              key={t.id}
              className={`m-drawer-term ${t.id === activeTerminalId ? "active" : ""}`}
              onClick={tap(() => onSelectTerminal(t.id))}
            >
              <span className={`m-term-dot ${recentlyActive ? "live" : ""}`} />
              <span className="m-term-info">
                <span className="m-term-label">{t.label}</span>
                {t.cwd && <span className="m-term-cwd">{t.cwd}</span>}
              </span>
              <span className="m-term-actions">
                <span
                  className={`m-term-order-btn ${i === 0 ? "disabled" : ""}`}
                  onClick={(e) => { e.stopPropagation(); haptic(); moveTerminal(orderedIds, t.id, "up"); }}
                  role="button"
                  aria-label="Move up"
                >
                  ↑
                </span>
                <span
                  className={`m-term-order-btn ${i === sortedTerminals.length - 1 ? "disabled" : ""}`}
                  onClick={(e) => { e.stopPropagation(); haptic(); moveTerminal(orderedIds, t.id, "down"); }}
                  role="button"
                  aria-label="Move down"
                >
                  ↓
                </span>
                <span
                  className={`m-term-pin ${pinned ? "on" : ""}`}
                  onClick={(e) => { e.stopPropagation(); haptic(); togglePinned(t.id); }}
                  role="button"
                  aria-label={pinned ? "Unpin" : "Pin"}
                >
                  <svg width={15} height={15} viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14l-1.5-1.5a2 2 0 0 1-.5-1.32V8a1 1 0 0 1 1-1 2 2 0 0 0 0-4H6a2 2 0 0 0 0 4 1 1 0 0 1 1 1v6.18a2 2 0 0 1-.5 1.32L5 17z" />
                  </svg>
                </span>
                <span
                  className="m-term-delete"
                  onClick={(e) => { e.stopPropagation(); deleteTerminal(t); }}
                  role="button"
                  aria-label="Delete terminal"
                >
                  <Icon name="close" size={14} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
