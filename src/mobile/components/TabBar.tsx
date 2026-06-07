import { useMobileStore } from "../store/mobileStore";

interface Props {
  onSelect: (id: string) => void;
  onWorkspaceClick: () => void;
}

const WS_COLORS = [
  "#e94560", "#533483", "#3498db", "#2ecc71",
  "#f39c12", "#e74c3c", "#9b59b6", "#1abc9c",
];

export function TabBar({ onSelect, onWorkspaceClick }: Props) {
  const { terminals, activeTerminalId, workspaces, activeWorkspaceIdx } =
    useMobileStore();

  const wsColor = WS_COLORS[workspaces[activeWorkspaceIdx]?.color ?? 0] || WS_COLORS[0];
  const wsName = workspaces[activeWorkspaceIdx]?.name || "—";

  return (
    <div className="m-tabbar">
      <button
        className="m-tabbar-ws"
        style={{ borderColor: wsColor, color: wsColor }}
        onClick={onWorkspaceClick}
      >
        {wsName}
      </button>
      <div className="m-tabbar-tabs">
        {terminals.map((t) => (
          <button
            key={t.id}
            className={`m-tab ${t.id === activeTerminalId ? "active" : ""}`}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
