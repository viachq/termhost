import { useWorkspaceStore } from "../../store/workspaceStore";
import { usePanelStore } from "../../store/panelStore";
import { WS_COLORS } from "../../constants/themes";
import s from "./Sidebar.module.css";

interface Props {
  onSwitchWorkspace: (idx: number) => void;
  onEditWorkspace: (idx: number) => void;
  onNewWorkspace: () => void;
  onDeleteWorkspace: (idx: number) => void;
}

export default function Sidebar({ onSwitchWorkspace, onEditWorkspace, onNewWorkspace, onDeleteWorkspace }: Props) {
  const workspaces = useWorkspaceStore((st) => st.workspaces);
  const activeIdx = useWorkspaceStore((st) => st.activeWorkspaceIdx);
  const sidebarVisible = usePanelStore((st) => st.sidebarVisible);

  return (
    <div className={`${s.sidebar} ${sidebarVisible ? "" : s.collapsed}`}>
      <div className={s.sectionHeader}>
        <span className={s.sectionTitle}>WORKSPACES</span>
        <button className={s.iconBtn} title="New Workspace" onClick={onNewWorkspace}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M7 1a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 017 1z" />
          </svg>
        </button>
      </div>
      <div className={s.list}>
        {workspaces.map((ws, idx) => {
          const isActive = idx === activeIdx;
          return (
            <div
              key={idx}
              className={`${s.item} ${isActive ? s.active : ""}`}
              onClick={() => onSwitchWorkspace(idx)}
              onDoubleClick={() => onEditWorkspace(idx)}
            >
              <div className={s.dot} style={{ background: WS_COLORS[ws.color % WS_COLORS.length] }} />
              <span className={s.name}>{ws.name}</span>
              <span className={`${s.badge} ${isActive ? s.activeBadge : s.inactiveBadge}`}>
                {ws.panes.length}
              </span>
              <button
                className={s.close}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteWorkspace(idx);
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
