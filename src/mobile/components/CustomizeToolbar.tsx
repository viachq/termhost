import { useState, useEffect, useCallback, useRef } from "react";
import type { ToolbarKey, ToolbarPreset } from "../types";
import { TOOLBAR_PRESETS, saveToolbarKeys, saveToolbarPreset, loadToolbarKeys } from "../types";

interface Props {
  onClose: () => void;
}

const ALL_AVAILABLE_KEYS: ToolbarKey[] = [
  { id: "esc", label: "Esc", data: "\x1b" },
  { id: "ctrl-c", label: "^C", data: "\x03", accent: true },
  { id: "ctrl-d", label: "^D", data: "\x04" },
  { id: "ctrl-z", label: "^Z", data: "\x1a" },
  { id: "ctrl-r", label: "^R", data: "\x12" },
  { id: "ctrl-l", label: "^L", data: "\x0c" },
  { id: "ctrl-a", label: "^A", data: "\x01" },
  { id: "ctrl-e", label: "^E", data: "\x05" },
  { id: "tab", label: "Tab", data: "\t" },
  { id: "shift-tab", label: "⇧Tab", data: "\x1b[Z" },
  { id: "up", label: "↑", data: "\x1b[A" },
  { id: "down", label: "↓", data: "\x1b[B" },
  { id: "left", label: "←", data: "\x1b[D" },
  { id: "right", label: "→", data: "\x1b[C" },
  { id: "home", label: "Home", data: "\x1b[H" },
  { id: "end", label: "End", data: "\x1b[F" },
  { id: "enter", label: "⏎", data: "\r" },
  { id: "arrows", label: "⬄", data: "", accent: true },
];

export function CustomizeToolbar({ onClose }: Props) {
  const [activeKeys, setActiveKeys] = useState<ToolbarKey[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [activePreset, setActivePreset] = useState<ToolbarPreset>("essential");

  useEffect(() => {
    const { preset, keys } = loadToolbarKeys();
    setActivePreset(preset);
    setActiveKeys(keys);
  }, []);

  const addKey = useCallback((k: ToolbarKey) => {
    if (activeKeys.some((ak) => ak.id === k.id)) {
      setActiveKeys((prev) => prev.filter((ak) => ak.id !== k.id));
    } else {
      setActiveKeys((prev) => [...prev, k]);
    }
    setActivePreset("custom");
  }, [activeKeys]);

  const clearAll = useCallback(() => {
    setActiveKeys([]);
    setActivePreset("custom");
  }, []);

  const resetToPreset = useCallback((p: ToolbarPreset) => {
    if (p === "custom") return;
    saveToolbarPreset(p);
    const { keys } = loadToolbarKeys();
    setActivePreset(p);
    setActiveKeys(keys);
  }, []);

  const saveCustom = useCallback(() => {
    saveToolbarKeys(activeKeys);
    onClose();
  }, [activeKeys, onClose]);

  // Drag to reorder
  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverIdx.current = idx;
  }, []);

  const handleDrop = useCallback(() => {
    const fromIdx = dragIdx;
    const toIdx = dragOverIdx.current;
    if (fromIdx !== null && toIdx !== null && toIdx !== fromIdx) {
      setActiveKeys((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
      setActivePreset("custom");
    }
    setDragIdx(null);
    dragOverIdx.current = null;
  }, [dragIdx]);

  const availableKeys = ALL_AVAILABLE_KEYS.filter(
    (k) => !activeKeys.some((ak) => ak.id === k.id)
  );

  return (
    <div className="m-page-overlay">
      <div className="m-page-head">
        <button className="m-page-back" onClick={onClose} aria-label="Back">‹</button>
        <span>Customize Toolbar</span>
        <button className="m-page-save" onClick={saveCustom}>Save</button>
      </div>

      <div className="m-tb-custom-body">
        <div className="m-tb-custom-section">
          <div className="m-tb-custom-label">Active keys (drag to reorder)</div>
          <div className="m-tb-custom-active" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            {activeKeys.length === 0 && (
              <div className="m-tb-custom-empty">No keys — tap below to add</div>
            )}
            {activeKeys.map((k, idx) => (
              <div
                key={k.id}
                className={`m-tb-custom-chip ${dragIdx === idx ? "dragging" : ""}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDrop}
              >
                <span className={`m-tb-chip-label ${k.accent ? "accent" : ""}`}>{k.label}</span>
                <button
                  className="m-tb-chip-remove"
                  onClick={() => setActiveKeys((prev) => prev.filter((_, i) => i !== idx))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="m-tb-custom-section">
          <div className="m-tb-custom-label">Available keys</div>
          <div className="m-tb-custom-available">
            {availableKeys.map((k) => (
              <button
                key={k.id}
                className={`m-tb-add-btn ${k.accent ? "accent" : ""}`}
                onClick={() => addKey(k)}
              >
                + {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="m-tb-custom-section">
          <div className="m-tb-custom-label">Presets</div>
          <div className="m-tb-custom-presets">
            {(["essential", "full", "minimal"] as ToolbarPreset[]).map((p) => (
              <button
                key={p}
                className={`m-tb-preset-btn ${activePreset === p ? "active" : ""}`}
                onClick={() => resetToPreset(p)}
              >
                {p === "essential" ? "Essential" : p === "full" ? "Full" : "Minimal"}
                <span className="m-tb-preset-count">{TOOLBAR_PRESETS[p].length} keys</span>
              </button>
            ))}
            <button
              className="m-tb-preset-btn danger"
              onClick={clearAll}
            >
              Clear All
              <span className="m-tb-preset-count">remove all keys</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
