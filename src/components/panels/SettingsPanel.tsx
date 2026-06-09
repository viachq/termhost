import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import { usePanelStore } from "../../store/panelStore";
import { THEMES, FONT_OPTIONS } from "../../constants/themes";
import { startWsServer, stopWsServer, wsServerStatus } from "../../hooks/useTauriIpc";
import type { CursorStyle, UiTheme } from "../../types";
import s from "./Panels.module.css";

export default function SettingsPanel({ embedded }: { embedded?: boolean } = {}) {
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
  const toggleSettings = usePanelStore((st) => st.toggleSettings);

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

  const body = (
    <>
      <div className={s.settingsSection}>
        <p className={s.settingsLabel}>Theme</p>
        <div className={s.settingsThemes}>
          {Object.entries(THEMES).map(([key, theme]) => (
            <div
              key={key}
              className={key === activeThemeKey ? s.settingsThemeCardActive : s.settingsThemeCard}
              onClick={() => setActiveThemeKey(key)}
            >
              <div
                className={s.settingsThemePreview}
                style={{ background: theme.background, color: theme.foreground }}
              >
                <span style={{ color: theme.green as string }}>$</span> ls{" "}
                <span style={{ color: theme.cyan as string }}>src/</span>
              </div>
              <div className={s.settingsThemeName}>{theme.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={s.settingsSection}>
        <p className={s.settingsLabel}>Font</p>
        <div className={s.settingsRow}>
          <label>Family</label>
          <select value={termFontFamily} onChange={(e) => setTermFontFamily(e.target.value)}>
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>{f.split("'")[1] || f}</option>
            ))}
          </select>
        </div>
        <div className={s.settingsRow}>
          <label>Size</label>
          <input type="range" min={8} max={24} value={termFontSize} onChange={(e) => setTermFontSize(parseInt(e.target.value))} />
          <span className={s.settingsVal}>{termFontSize}px</span>
        </div>
      </div>

      <div className={s.settingsSection}>
        <p className={s.settingsLabel}>Cursor</p>
        <div className={s.settingsRow}>
          <label>Shape</label>
          <select value={termCursorStyle} onChange={(e) => setTermCursorStyle(e.target.value as CursorStyle)}>
            <option value="block">Block</option>
            <option value="bar">Bar</option>
            <option value="underline">Underline</option>
          </select>
        </div>
      </div>

      <div className={s.settingsSection}>
        <p className={s.settingsLabel}>Interface</p>
        <div className={s.settingsRow}>
          <label>UI Scale</label>
          <input type="range" min={80} max={150} step={5} value={uiScale} onChange={(e) => setUiScale(parseInt(e.target.value))} />
          <span className={s.settingsVal}>{uiScale}%</span>
        </div>
      </div>

      <div className={s.settingsSection}>
        <p className={s.settingsLabel}>Layout</p>
        <div className={s.settingsRow}>
          <label>Resize</label>
          <button
            className={splitResizeEnabled ? s.settingsBtnActive : s.settingsBtn}
            onClick={() => setSplitResizeEnabled(!splitResizeEnabled)}
          >
            {splitResizeEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>
      </div>

      <div className={s.settingsSection}>
        <p className={s.settingsLabel}>Remote Access</p>
        <div className={s.settingsRow}>
          <label>Mobile</label>
          <button
            className={wsRunning ? s.settingsBtnActive : s.settingsBtn}
            onClick={toggleWsServer}
          >
            {wsRunning ? "Stop" : "Start"}
          </button>
          <span
            className={s.settingsVal}
            style={{ color: wsRunning ? "#2ecc71" : "var(--text-dim)" }}
          >
            {wsRunning ? "On" : "Off"}
          </span>
        </div>
        {wsRunning && wsIp && (
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
            Open on phone:
            <div className={s.settingsWsUrl}>{`http://${wsIp}:9090`}</div>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div className={s.settingsBody}>{body}</div>;
  }

  return (
    <div className={s.settingsPanel}>
      <div className={s.settingsHeader}>
        <span className={s.settingsTitle}>Settings</span>
        <button className={s.headerBtn} onClick={toggleSettings}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
          </svg>
        </button>
      </div>
      <div className={s.settingsBody}>{body}</div>
    </div>
  );
}
