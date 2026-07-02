import { useState } from "react";
import { useMobileStore } from "../store/mobileStore";
import { Icon } from "./Icon";

interface Props {
  host: string;
  connected: boolean;
  onCustomizeToolbar: () => void;
  onChangeServer: () => void;
  onSwitchHost: (h: string) => void;
}

export function Settings({ host, connected, onCustomizeToolbar, onChangeServer, onSwitchHost }: Props) {
  const {
    fontSize, setFontSize,
    theme, setTheme,
    savedHosts, removeSavedHost,
    snippets, addSnippet, removeSnippet,
    pingMs,
  } = useMobileStore();

  const [snipLabel, setSnipLabel] = useState("");
  const [snipText, setSnipText] = useState("");

  const submitSnippet = () => {
    const label = snipLabel.trim();
    const text = snipText.trim();
    if (!label || !text) return;
    addSnippet(label, text);
    setSnipLabel("");
    setSnipText("");
  };

  return (
    <div className="m-settings">
      <div className="m-drawer-section">Terminal</div>
      <button className="m-drawer-item" onClick={onCustomizeToolbar}>
        <Icon name="keys" />
        Customize Toolbar
      </button>

      <div className="m-settings-row">
        <span>Font size</span>
        <div className="m-settings-stepper">
          <button onClick={() => setFontSize(fontSize - 1)} aria-label="Smaller">−</button>
          <span>{fontSize}px</span>
          <button onClick={() => setFontSize(fontSize + 1)} aria-label="Larger">+</button>
        </div>
      </div>

      <div className="m-drawer-section">Appearance</div>
      <div className="m-settings-row">
        <span>Theme</span>
        <button
          className="m-icon-btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <Icon name={theme === "dark" ? "moon" : "sun"} size={18} />
        </button>
      </div>

      <div className="m-drawer-section">Snippets</div>
      {snippets.length === 0 && <div className="m-drawer-empty">No snippets yet</div>}
      {snippets.map((s) => (
        <div key={s.id} className="m-settings-snippet">
          <span className="m-settings-snippet-label">{s.label}</span>
          <span className="m-settings-snippet-text">{s.text}</span>
          <button onClick={() => removeSnippet(s.id)} aria-label="Remove snippet"><Icon name="close" size={13} /></button>
        </div>
      ))}
      <div className="m-settings-add-snippet">
        <input
          value={snipLabel}
          onChange={(e) => setSnipLabel(e.target.value)}
          placeholder="Label (e.g. Deploy)"
        />
        <input
          value={snipText}
          onChange={(e) => setSnipText(e.target.value)}
          placeholder="Command"
          onKeyDown={(e) => e.key === "Enter" && submitSnippet()}
        />
        <button onClick={submitSnippet}>Add</button>
      </div>

      <div className="m-drawer-section">Connection</div>
      <div className="m-settings-info">
        <span className={`m-conn-dot ${connected ? "on" : ""}`} />
        {connected ? "Connected" : "Disconnected"} · {host}
        {connected && pingMs !== null && <span className="m-ping"> · {pingMs}ms</span>}
      </div>
      {savedHosts.filter((h) => h !== host).map((h) => (
        <div key={h} className="m-settings-host">
          <button className="m-settings-host-switch" onClick={() => onSwitchHost(h)}>{h}</button>
          <button className="m-settings-host-remove" onClick={() => removeSavedHost(h)} aria-label="Forget host"><Icon name="close" size={13} /></button>
        </div>
      ))}
      <button className="m-drawer-item" onClick={onChangeServer}>
        <Icon name="refresh" />
        Change server
      </button>
    </div>
  );
}
