import { useState, useRef, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { usePanelStore } from "../../store/panelStore";
import VoiceInput from "./VoiceInput";
import s from "./Titlebar.module.css";

interface Props {
  onSwitchWorkspace: (idx: number) => void;
  onNewWorkspace: () => void;
  onDeleteWorkspace: (idx: number) => void;
}

export default function Titlebar({ onSwitchWorkspace, onNewWorkspace, onDeleteWorkspace }: Props) {
  const workspaces = useWorkspaceStore((st) => st.workspaces);
  const activeIdx = useWorkspaceStore((st) => st.activeWorkspaceIdx);
  const updateWorkspace = useWorkspaceStore((st) => st.updateWorkspace);
  const explorerOpen = usePanelStore((st) => st.explorerOpen);
  const toggleExplorer = usePanelStore((st) => st.toggleExplorer);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIdx !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingIdx]);

  const startEditing = useCallback((idx: number, name: string) => {
    setEditingIdx(idx);
    setEditValue(name);
  }, []);

  const saveEditing = useCallback(() => {
    if (editingIdx !== null) {
      const name = editValue.trim() || "Workspace";
      if (name !== workspaces[editingIdx]?.name) {
        updateWorkspace(editingIdx, { name });
      }
      setEditingIdx(null);
    }
  }, [editingIdx, editValue, workspaces, updateWorkspace]);

  const cancelEditing = useCallback(() => {
    setEditingIdx(null);
  }, []);

  useEffect(() => {
    const handler = () => {
      const idx = useWorkspaceStore.getState().activeWorkspaceIdx;
      const ws = useWorkspaceStore.getState().workspaces[idx];
      if (ws) startEditing(idx, ws.name);
    };
    window.addEventListener("agentworkspace:edit-workspace", handler);
    return () => window.removeEventListener("agentworkspace:edit-workspace", handler);
  }, [startEditing]);

  return (
    <div className={s.titlebar}>
      <div className={s.tabs}>
        {workspaces.map((ws, idx) => {
          const isActive = idx === activeIdx;
          const isEditing = editingIdx === idx;
          return (
            <div
              key={idx}
              className={`${s.tab} ${isActive ? s.tabActive : ""} ${isEditing ? s.tabEditing : ""}`}
              onClick={() => { if (!isEditing) onSwitchWorkspace(idx); }}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  className={s.tabInput}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEditing();
                    if (e.key === "Escape") cancelEditing();
                  }}
                  onBlur={saveEditing}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className={s.tabName}
                  onDoubleClick={() => startEditing(idx, ws.name)}
                >
                  {ws.name}
                </span>
              )}
              {!isEditing && (
                <button
                  className={s.tabClose}
                  onClick={(e) => { e.stopPropagation(); onDeleteWorkspace(idx); }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
                  </svg>
                </button>
              )}
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
        <VoiceInput />
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
