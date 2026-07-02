import { useState, useRef, useEffect } from "react";

export interface PaletteAction {
  id: string;
  label: string;
  sublabel?: string;
  run: () => void;
}

interface Props {
  actions: PaletteAction[];
  onClose: () => void;
}

export function CommandPalette({ actions, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? actions.filter(
        (a) => a.label.toLowerCase().includes(q) || a.sublabel?.toLowerCase().includes(q)
      )
    : actions;

  return (
    <div className="m-palette-scrim" onClick={onClose}>
      <div className="m-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="m-palette-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && filtered[0]) {
              filtered[0].run();
              onClose();
            }
          }}
          placeholder="Jump to a terminal or workspace…"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <div className="m-palette-list">
          {filtered.length === 0 && <div className="m-drawer-empty">No matches</div>}
          {filtered.map((a) => (
            <button
              key={a.id}
              className="m-palette-item"
              onClick={() => { a.run(); onClose(); }}
            >
              <span className="m-palette-item-label">{a.label}</span>
              {a.sublabel && <span className="m-palette-item-sub">{a.sublabel}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
