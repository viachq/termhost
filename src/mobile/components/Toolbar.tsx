import { useState, useEffect, useCallback } from "react";
import type { ToolbarKey, ToolbarPreset } from "../types";
import { loadToolbarKeys, saveToolbarPreset, getDefaultArrowsKey } from "../types";
import { haptic } from "../haptics";

interface Props {
  onKey: (data: string) => void;
}

const ARROWS_SUB_KEYS: ToolbarKey[] = [
  { id: "up", label: "↑", data: "\x1b[A" },
  { id: "down", label: "↓", data: "\x1b[B" },
  { id: "left", label: "←", data: "\x1b[D" },
  { id: "right", label: "→", data: "\x1b[C" },
];

export function Toolbar({ onKey }: Props) {
  const [preset, setPreset] = useState<ToolbarPreset>("essential");
  const [keys, setKeys] = useState<ToolbarKey[]>([]);
  const [arrowsOpen, setArrowsOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const { preset: p, keys: k } = loadToolbarKeys();
    setPreset(p);
    setKeys(k);
  }, []);

  const visibleKeys = keys.filter((k) => k.id !== "arrows");
  const hasArrows = keys.some((k) => k.id === "arrows");

  const handleKey = useCallback((k: ToolbarKey) => {
    haptic();
    if (k.id === "arrows") {
      setArrowsOpen((v) => !v);
      return;
    }
    onKey(k.data);
    setArrowsOpen(false);
  }, [onKey]);

  const selectPreset = useCallback((p: ToolbarPreset) => {
    saveToolbarPreset(p);
    const { keys: newKeys } = loadToolbarKeys();
    setPreset(p);
    setKeys(newKeys);
    setArrowsOpen(false);
    setShowPicker(false);
  }, []);

  const cyclePreset = useCallback(() => {
    const cycle: ToolbarPreset[] = ["essential", "full", "minimal"];
    const curIdx = cycle.indexOf(preset);
    const next = cycle[(curIdx + 1) % cycle.length];
    selectPreset(next);
  }, [preset, selectPreset]);

  if (keys.length === 0) return null;

  return (
    <>
      <div className="m-toolbar">
        {visibleKeys.map((k) => (
          <button
            key={k.id}
            className={`m-toolbar-btn ${k.accent ? "accent" : ""}`}
            onTouchStart={(e) => { e.preventDefault(); handleKey(k); }}
            onClick={() => handleKey(k)}
          >
            {k.label}
          </button>
        ))}
        {hasArrows && arrowsOpen && (
          <div className="m-toolbar-arrows">
            {ARROWS_SUB_KEYS.map((ak) => (
              <button
                key={ak.id}
                className="m-toolbar-btn accent"
                onTouchStart={(e) => { e.preventDefault(); haptic(); onKey(ak.data); setArrowsOpen(false); }}
                onClick={() => { haptic(); onKey(ak.data); setArrowsOpen(false); }}
              >
                {ak.label}
              </button>
            ))}
          </div>
        )}
        <div className="m-toolbar-right">
          {preset === "custom" && <span className="m-tb-preset-label">custom</span>}
          <button className="m-toolbar-more" onClick={cyclePreset} aria-label="Cycle preset">
            {preset === "essential" ? "···" : preset === "full" ? "≡" : "▬"}
          </button>
          <button
            className="m-toolbar-collapse"
            onClick={() => setShowPicker((v) => !v)}
            aria-label="Presets"
          >
            ▼
          </button>
        </div>
      </div>
      {showPicker && (
        <div className="m-tb-preset-picker">
          {(["essential", "full", "minimal", "custom"] as ToolbarPreset[]).map((p) => (
            <button
              key={p}
              className={`m-tb-preset-option ${p === preset ? "active" : ""}`}
              onClick={() => selectPreset(p)}
            >
              {p === "essential" ? "Essential" : p === "full" ? "Full" : p === "minimal" ? "Minimal" : "Custom"}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
