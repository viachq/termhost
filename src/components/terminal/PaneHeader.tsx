import { useTerminalStore, terminalRefs } from "../../store/terminalStore";
import s from "./Terminal.module.css";

interface Props {
  id: string;
  cwd?: string;
  onSplitH: () => void;
  onSplitV: () => void;
  onClose: () => void;
}

function getDir(title: string, fallbackCwd?: string) {
  const shorten = (p: string) => {
    let r = p.replace(/^[A-Z]:\\Users\\[^\\]+/i, "~");
    const sep = r.includes("/") ? "/" : "\\";
    const parts = r.split(sep).filter(Boolean);
    if (parts.length > 3) {
      r = "…" + sep + parts.slice(-2).join(sep);
    }
    return r;
  };
  if (title) {
    if (/\.exe/i.test(title)) {
      // exe path — ignore, use fallback
    } else {
      const match = title.match(/([A-Z]:\\[^\r\n]*)/i) || title.match(/(\/[^\r\n]*)/);
      if (match) return shorten(match[1].trim());
    }
  }
  if (fallbackCwd) return shorten(fallbackCwd);
  return "~";
}

export default function PaneHeader({ id, cwd, onSplitH, onSplitV, onClose }: Props) {
  const title = useTerminalStore((st) => st.titles[id] || "");
  const lastDir = terminalRefs.get(id)?.lastDir;
  const fullPath = title || lastDir || cwd || "";
  const dir = getDir(title, lastDir || cwd);

  return (
    <div className={s.header} onMouseDown={(e) => e.stopPropagation()}>
      <span className={s.paneLabel} title={fullPath}>{dir}</span>
      <div className={s.actions}>
        <button className={s.action} title="Split Horizontal" onClick={onSplitH}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="6" height="14" rx="1.5" />
            <rect x="9" y="1" width="6" height="14" rx="1.5" />
          </svg>
        </button>
        <button className={s.action} title="Split Vertical" onClick={onSplitV}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="14" height="6" rx="1.5" />
            <rect x="1" y="9" width="14" height="6" rx="1.5" />
          </svg>
        </button>
        <button className={`${s.action} ${s.actionClose}`} title="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3.17 2.23a.67.67 0 00-.94.94L5.06 6 2.23 8.83a.67.67 0 00.94.94L6 6.94l2.83 2.83a.67.67 0 00.94-.94L6.94 6l2.83-2.83a.67.67 0 00-.94-.94L6 5.06 3.17 2.23z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
