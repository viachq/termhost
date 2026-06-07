import { useWorkspaceStore } from "../../store/workspaceStore";
import { usePanelStore } from "../../store/panelStore";
import { WS_COLORS } from "../../constants/themes";
import s from "./Titlebar.module.css";

interface Props {
  onSwitchWorkspace: (idx: number) => void;
  onEditWorkspace: (idx: number) => void;
  onNewWorkspace: () => void;
  onDeleteWorkspace: (idx: number) => void;
}

export default function Titlebar({ onSwitchWorkspace, onEditWorkspace, onNewWorkspace, onDeleteWorkspace }: Props) {
  const workspaces = useWorkspaceStore((st) => st.workspaces);
  const activeIdx = useWorkspaceStore((st) => st.activeWorkspaceIdx);
  const explorerOpen = usePanelStore((st) => st.explorerOpen);
  const toggleExplorer = usePanelStore((st) => st.toggleExplorer);

  return (
    <div className={s.titlebar}>
      <div className={s.tabs}>
        {workspaces.map((ws, idx) => {
          const isActive = idx === activeIdx;
          const color = WS_COLORS[ws.color % WS_COLORS.length];
          return (
            <div
              key={idx}
              className={`${s.tab} ${isActive ? s.tabActive : ""}`}
              onClick={() => onSwitchWorkspace(idx)}
              onDoubleClick={() => onEditWorkspace(idx)}
            >
              <span className={s.tabDot} style={{ background: color }} />
              <span className={s.tabName}>{ws.name}</span>
              <button
                className={s.tabClose}
                onClick={(e) => { e.stopPropagation(); onDeleteWorkspace(idx); }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
                </svg>
              </button>
            </div>
          );
        })}
        <button className={s.newTab} onClick={onNewWorkspace} title="New Workspace (Ctrl+Shift+T)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 2v8M2 6h8" />
          </svg>
        </button>
      </div>
      <div className={s.drag} data-tauri-drag-region />
      <div className={s.right}>
        <button
          className={`${s.btn} ${explorerOpen ? s.btnActive : ""}`}
          title="Panel (Ctrl+B)"
          onClick={() => toggleExplorer(usePanelStore.getState().explorerTab)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>
      </div>
    </div>
  );
}
