import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import { usePanelStore } from "../../store/panelStore";
import { THEMES, FONT_OPTIONS } from "../../constants/themes";
import { startWsServer, stopWsServer, wsServerStatus } from "../../hooks/useTauriIpc";
import type { CursorStyle, UiTheme } from "../../types";
import s from "./Pages.module.css";

export default function SettingsPage() {
  const uiTheme = useSettingsStore((st) => st.uiTheme);
  const activeThemeKey = useSettingsStore((st) => st.activeThemeKey);
  const termFontSize = useSettingsStore((st) => st.termFontSize);
  const termFontFamily = useSettingsStore((st) => st.termFontFamily);
  const termCursorStyle = useSettingsStore((st) => st.termCursorStyle);
  const uiScale = useSettingsStore((st) => st.uiScale);

  const setUiTheme = useSettingsStore((st) => st.setUiTheme);
  const setActiveThemeKey = useSettingsStore((st) => st.setActiveThemeKey);
  const setTermFontSize = useSettingsStore((st) => st.setTermFontSize);
  const setTermFontFamily = useSettingsStore((st) => st.setTermFontFamily);
  const setTermCursorStyle = useSettingsStore((st) => st.setTermCursorStyle);
  const setUiScale = useSettingsStore((st) => st.setUiScale);
  const splitResizeEnabled = useSettingsStore((st) => st.splitResizeEnabled);
  const setSplitResizeEnabled = useSettingsStore((st) => st.setSplitResizeEnabled);
  const showTerminals = usePanelStore((st) => st.showTerminals);

  const [wsRunning, setWsRunning] = useState(false);
  const [wsIp, setWsIp] = useState("");

  const refreshWsStatus = useCallback(async () => {
    try {
      const status = await wsServerStatus();
      setWsRunning(status.running);
      setWsIp(status.ip || "");
    } catch {
      setWsRunning(false);
    }
  }, []);

  useEffect(() => {
    refreshWsStatus();
  }, [refreshWsStatus]);

  const toggleWsServer = useCallback(async () => {
    try {
      if (wsRunning) {
        await stopWsServer();
      } else {
        await startWsServer(9090);
      }
    } catch (e) {
      console.error("WS toggle error:", e);
    }
    refreshWsStatus();
  }, [wsRunning, refreshWsStatus]);

  return (
    <div className={s.page}>
      <div className={s.editor}>
        <h2>Settings</h2>

        <label className={s.fieldLabel}>Theme</label>
        <div className={s.themeCards}>
          {Object.entries(THEMES).map(([key, theme]) => (
            <div
              key={key}
              className={key === activeThemeKey ? s.themeCardActive : s.themeCard}
              onClick={() => setActiveThemeKey(key)}
            >
              <div
                className={s.themePreview}
                style={{ background: theme.background, color: theme.foreground }}
              >
                <span>
                  <span style={{ color: theme.green as string }}>$</span> ls{" "}
                  <span style={{ color: theme.cyan as string }}>src/</span>
                </span>
              </div>
              <div className={s.themeCardName}>{theme.name}</div>
            </div>
          ))}
        </div>

        <label className={s.fieldLabel}>Font</label>
        <div className={s.settingRow}>
          <label>Family</label>
          <select
            value={termFontFamily}
            onChange={(e) => setTermFontFamily(e.target.value)}
          >
            {FONT_OPTIONS.map((f) => {
              const name = f.split("'")[1] || f;
              return (
                <option key={f} value={f}>
                  {name}
                </option>
              );
            })}
          </select>
        </div>
        <div className={s.settingRow}>
          <label>Size</label>
          <input
            type="range"
            min={8}
            max={24}
            value={termFontSize}
            onChange={(e) => setTermFontSize(parseInt(e.target.value))}
          />
          <span className={s.val}>{termFontSize}px</span>
        </div>

        <label className={s.fieldLabel}>Cursor</label>
        <div className={s.settingRow}>
          <label>Shape</label>
          <select
            value={termCursorStyle}
            onChange={(e) => setTermCursorStyle(e.target.value as CursorStyle)}
          >
            <option value="block">█ Block</option>
            <option value="bar">▏ Bar</option>
            <option value="underline">▁ Underline</option>
          </select>
        </div>

        <label className={s.fieldLabel}>Interface</label>
        <div className={s.settingRow}>
          <label>UI Scale</label>
          <input
            type="range"
            min={80}
            max={150}
            step={5}
            value={uiScale}
            onChange={(e) => setUiScale(parseInt(e.target.value))}
          />
          <span className={s.val}>{uiScale}%</span>
        </div>

        <label className={s.fieldLabel}>Layout</label>
        <div className={s.settingRow}>
          <label>Pane Resize</label>
          <button
            className={splitResizeEnabled ? s.btnAccent : s.btn}
            onClick={() => setSplitResizeEnabled(!splitResizeEnabled)}
          >
            {splitResizeEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        <label className={s.fieldLabel}>Remote Access</label>
        <div className={s.settingRow}>
          <label>Mobile</label>
          <button
            className={wsRunning ? s.btnAccent : s.btn}
            onClick={toggleWsServer}
          >
            {wsRunning ? "Stop Server" : "Start Server"}
          </button>
          <span
            className={s.val}
            style={{ minWidth: "auto", fontSize: 11, color: wsRunning ? "#2ecc71" : "var(--text-dim)" }}
          >
            {wsRunning ? "Running" : "Stopped"}
          </span>
        </div>
        {wsRunning && wsIp && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-dim)" }}>
            Open this URL on your phone (same Wi-Fi):
            <div className={s.wsUrlBox}>{`http://${wsIp}:9090`}</div>
          </div>
        )}

        <div className={s.actions}>
          <button className={s.btn} onClick={showTerminals}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
