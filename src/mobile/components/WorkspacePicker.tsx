import { useState } from "react";
import { useMobileStore } from "../store/mobileStore";

const WS_COLORS = [
  "#e94560", "#533483", "#3498db", "#2ecc71",
  "#f39c12", "#e74c3c", "#9b59b6", "#1abc9c",
];

interface Props {
  onSwitch: (idx: number) => void;
  onCreate: (name: string, color: number) => void;
  onDelete: (idx: number) => void;
  onClose: () => void;
}

export function WorkspacePicker({ onSwitch, onCreate, onDelete, onClose }: Props) {
  const { workspaces, activeWorkspaceIdx } = useMobileStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // Matches the desktop app: no color picker — colors auto-cycle by creation
  // order, renamed/recolored later isn't a thing there either, just a name.
  const handleCreate = () => {
    const name = newName.trim() || "Workspace";
    onCreate(name, workspaces.length % 8);
    setNewName("");
    setCreating(false);
  };

  return (
    <div className="m-ws-overlay" onClick={onClose}>
      <div className="m-ws-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-ws-header">
          <span>Workspaces</span>
          <button className="m-ws-close" onClick={onClose}>✕</button>
        </div>

        <div className="m-ws-list">
          {workspaces.map((ws, i) => (
            <div
              key={i}
              className={`m-ws-item ${i === activeWorkspaceIdx ? "active" : ""}`}
              onClick={() => { onSwitch(i); onClose(); }}
            >
              <span
                className="m-ws-dot"
                style={{ background: WS_COLORS[ws.color] || WS_COLORS[0] }}
              />
              <span className="m-ws-name">{ws.name}</span>
              <span className="m-ws-count">{ws.terminalCount}</span>
              {workspaces.length > 1 && (
                <button
                  className="m-ws-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(i);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {creating ? (
          <div className="m-ws-create-form">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Workspace name"
              autoFocus
            />
            <div className="m-ws-create-actions">
              <button onClick={() => setCreating(false)}>Cancel</button>
              <button className="primary" onClick={handleCreate}>Create</button>
            </div>
          </div>
        ) : (
          <button className="m-ws-add" onClick={() => setCreating(true)}>
            + New Workspace
          </button>
        )}
      </div>
    </div>
  );
}
