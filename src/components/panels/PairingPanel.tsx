import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { usePanelStore } from "../../store/panelStore";
import { getPendingPairs, pairApprove, pairReject, wsServerStatus, listDevices, revokeDevice, renameDevice, updateDeviceNote, setAutoApprove, getAutoApprove, stopWsServer, setSleepConfig, getSleepConfig } from "../../hooks/useTauriIpc";
import type { DeviceInfo } from "../../hooks/useTauriIpc";
import s from "./Panels.module.css";

function DeviceRow({ device }: { device: DeviceInfo }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(device.label);
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(device.note);

  const save = async () => {
    if (label.trim() && label !== device.label) {
      await renameDevice(device.token, label.trim()).catch(() => {});
    }
    setEditing(false);
  };

  const saveNote = async () => {
    if (note !== device.note) {
      await updateDeviceNote(device.token, note).catch(() => {});
    }
    setEditingNote(false);
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return null;
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
  };

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0",
        fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Online/offline dot */}
      <div style={{ display: "flex", alignItems: "center", height: 24 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: device.online ? "#4ade80" : "#555",
          flexShrink: 0,
        }} />
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginTop: 5, flexShrink: 0 }}>
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Label row */}
        {editing ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setLabel(device.label); setEditing(false); } }}
            autoFocus
            style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 4, padding: "2px 6px", fontSize: 12, color: "#fff", outline: "none", width: "100%", boxSizing: "border-box",
            }}
          />
        ) : (
          <div
            style={{ opacity: 0.9, cursor: "pointer", fontWeight: 500 }}
            onClick={() => { setLabel(device.label); setEditing(true); }}
            title="Click to rename"
          >
            {device.label}
          </div>
        )}
        {/* Subtitle row */}
        <div style={{ display: "flex", gap: 8, opacity: 0.4, fontSize: 10, marginTop: 2, flexWrap: "wrap" }}>
          {device.deviceType && <span>{device.deviceType}</span>}
          {device.online ? (
            <span style={{ color: "#4ade80", opacity: 1 }}>Online</span>
          ) : (
            formatTime(device.lastSeen) && <span>Offline · last seen {formatTime(device.lastSeen)}</span>
          )}
          <span>{new Date(device.approvedAt).toLocaleDateString()}</span>
        </div>
        {/* Note row */}
        {editingNote ? (
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              onKeyDown={(e) => { if (e.key === "Enter") saveNote(); if (e.key === "Escape") { setNote(device.note); setEditingNote(false); } }}
              autoFocus
              placeholder="Add a note…"
              style={{
                flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "#ccc", outline: "none",
              }}
            />
          </div>
        ) : note ? (
          <div
            style={{ opacity: 0.5, fontSize: 11, marginTop: 3, cursor: "pointer" }}
            onClick={() => { setNote(note); setEditingNote(true); }}
          >
            {note}
          </div>
        ) : (
          <div
            style={{ opacity: 0.25, fontSize: 11, marginTop: 3, cursor: "pointer", fontStyle: "italic" }}
            onClick={() => { setNote(""); setEditingNote(true); }}
          >
            Add note…
          </div>
        )}
      </div>
      <button
        onClick={() => revokeDevice(device.token)}
        style={{
          background: "none", border: "none", color: "#e05050", cursor: "pointer",
          fontSize: 11, opacity: 0.6, padding: "2px 6px", marginTop: 2, flexShrink: 0,
        }}
        onMouseOver={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseOut={(e) => (e.currentTarget.style.opacity = "0.6")}
      >
        Revoke
      </button>
    </div>
  );
}

function PendingPairRow({ deviceId, code }: { deviceId: string; code: string }) {
  const [label, setLabel] = useState("Phone");

  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "monospace", letterSpacing: 6, marginBottom: 8 }}>
        {code}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Device name"
          style={{
            flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4, padding: "4px 8px", fontSize: 12, color: "#fff", outline: "none",
          }}
        />
        <button
          className={s.settingsBtn}
          onClick={() => pairApprove(deviceId, label)}
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
        >
            Approve
        </button>
        <button
          className={s.settingsBtn}
          onClick={() => pairReject(deviceId)}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#e05050" }}
        >
            Reject
        </button>
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.8px",
  opacity: 0.5,
  marginBottom: 8,
};

const SLEEP_TIMEOUTS: { label: string; never: boolean; minutes: number }[] = [
  { label: "Never off", never: true, minutes: 0 },
  { label: "Off after 30 min idle", never: false, minutes: 30 },
  { label: "Off after 1 hour idle", never: false, minutes: 60 },
  { label: "Off after 2 hours idle", never: false, minutes: 120 },
  { label: "Off after 4 hours idle", never: false, minutes: 240 },
  { label: "Off after 24 hours idle", never: false, minutes: 1440 },
];

export default function PairingPanel({ embedded }: { embedded?: boolean } = {}) {
  const setActiveView = usePanelStore((st) => st.setActiveView);
  const [pendingPairs, setPendingPairs] = useState<{ deviceId: string; code: string }[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [wsIps, setWsIps] = useState<string[]>([]);
  const [wsPort, setWsPort] = useState(0);
  const [wsRunning, setWsRunning] = useState(false);
  const [autoApprove, setAutoApproveState] = useState(false);
  const [sleepNever, setSleepNever] = useState(true);
  const [sleepTimeout, setSleepTimeout] = useState(0);
  const timerRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    poll();
    timerRef.current = window.setInterval(poll, 2000);
    return () => window.clearInterval(timerRef.current);
  }, []);

  const poll = async () => {
    try {
      const [pairs, devs, aa, sleepCfg] = await Promise.all([
        getPendingPairs(), listDevices(), getAutoApprove(), getSleepConfig(),
      ]);
      setPendingPairs(pairs);
      setDevices(devs);
      setAutoApproveState(aa);
      setSleepNever(sleepCfg.never);
      setSleepTimeout(sleepCfg.timeoutMinutes);
    } catch {}
    try {
      const status = await wsServerStatus();
      setWsIps(status.ips || []);
      setWsPort(status.port);
      setWsRunning(status.running);
    } catch {}
  };

  const toggleAutoApprove = async () => {
    const next = !autoApprove;
    setAutoApproveState(next);
    await setAutoApprove(next).catch(() => poll());
  };

  const handleSleepSelect = async (never: boolean, minutes: number) => {
    setSleepNever(never);
    setSleepTimeout(minutes);
    await setSleepConfig(never, minutes).catch(() => poll());
  };

  const handleStopTunnel = async () => {
    await stopWsServer().catch(() => {});
    poll();
  };

  useEffect(() => {
    if (!canvasRef.current || wsIps.length === 0) return;
    const url = `http://${wsIps[0]}:${wsPort}/`;
    QRCode.toCanvas(canvasRef.current, url, { width: 140, margin: 2 }, () => {});
  }, [wsIps, wsPort]);

  const content = (
    <div>
      {/* ── QR + URL ── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Scan QR or open link</div>
        {wsIps.length > 0 && wsPort > 0 ? (
          <>
            <canvas ref={canvasRef} style={{ borderRadius: 8, display: "block" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, opacity: 0.6, fontFamily: "monospace" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              <span>http://{wsIps[0]}:{wsPort}/</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.4 }}>Starting server…</div>
        )}
      </div>

      {/* ── One-Time Code ── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>One-Time Code</div>
        {pendingPairs.length > 0 ? (
          pendingPairs.map((p) => (
            <PendingPairRow key={p.deviceId} deviceId={p.deviceId} code={p.code} />
          ))
        ) : (
          <div style={{ fontSize: 12, opacity: 0.4 }}>
            {wsIps.length > 0
              ? "No pending requests — scan the QR code above from your phone"
              : "Waiting for server…"}
          </div>
        )}
      </div>

      {/* ── Open Dashboard ── */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => setActiveView("pairing")}
          style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Open Dashboard
        </button>
      </div>

      {/* ── Auto-approve ── */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={labelStyle}>Auto-approve new devices</div>
          <div
            onClick={toggleAutoApprove}
            style={{
              width: 36, height: 20, borderRadius: 10, cursor: "pointer", position: "relative",
              background: autoApprove ? "#4ade80" : "rgba(255,255,255,0.15)", transition: "background 0.2s",
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2,
              left: autoApprove ? 18 : 2, transition: "left 0.2s",
            }} />
          </div>
        </div>
        <div style={{ fontSize: 11, opacity: 0.35, marginTop: 4 }}>
          {autoApprove ? "New devices connect without manual approval" : "Require manual approval for new devices"}
        </div>
      </div>

      {/* ── Stop Tunnel ── */}
      {wsRunning && (
        <div style={sectionStyle}>
          <button
            onClick={handleStopTunnel}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
              background: "rgba(224,80,80,0.1)", border: "1px solid rgba(224,80,80,0.25)",
              borderRadius: 6, color: "#e05050", cursor: "pointer", fontSize: 12, fontFamily: "inherit",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
            Stop Tunnel
          </button>
        </div>
      )}

      {/* ── Prevent Sleep ── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Prevent sleep</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {SLEEP_TIMEOUTS.map((opt) => {
            const active = opt.never ? sleepNever : (!sleepNever && sleepTimeout === opt.minutes);
            return (
              <div
                key={opt.label}
                onClick={() => handleSleepSelect(opt.never, opt.minutes)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                  borderRadius: 4, cursor: "pointer", fontSize: 11,
                  background: active ? "rgba(255,255,255,0.06)" : "transparent",
                  color: active ? "#fff" : "rgba(255,255,255,0.5)",
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                  border: active ? "4px solid #4ade80" : "2px solid rgba(255,255,255,0.2)",
                  transition: "all 0.15s",
                }} />
                {opt.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Clients ── */}
      <div style={sectionStyle}>
        <div style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
          Clients
          <span style={{ fontSize: 10, opacity: 0.4 }}>({devices.length})</span>
        </div>
        {devices.length > 0 ? (
          devices.map((d) => (
            <DeviceRow key={d.token} device={d} />
          ))
        ) : (
          <div style={{ fontSize: 12, opacity: 0.4 }}>No devices paired yet</div>
        )}
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <div className={s.settingsPanel}>
      <div className={s.settingsHeader}>
        <span className={s.settingsTitle}>Pairing</span>
      </div>
      {content}
    </div>
  );
}
