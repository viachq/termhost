import { useState, useCallback } from "react";
import { useSshStore, type SshConnection } from "../../store/sshStore";
import { useTerminalStore } from "../../store/terminalStore";
import { writeTerminal } from "../../hooks/useTauriIpc";
import s from "./Panels.module.css";

function SshForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: SshConnection;
  onSave: (data: Omit<SshConnection, "id">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [host, setHost] = useState(initial?.host || "");
  const [port, setPort] = useState(initial?.port || 22);
  const [user, setUser] = useState(initial?.user || "");
  const [identityFile, setIdentityFile] = useState(initial?.identityFile || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    onSave({ name: name.trim() || host, host: host.trim(), port, user: user.trim(), identityFile: identityFile.trim() });
  };

  return (
    <form className={s.sshForm} onSubmit={handleSubmit}>
      <div className={s.settingsRow}>
        <label>Name</label>
        <input className={s.sshInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Server" />
      </div>
      <div className={s.settingsRow}>
        <label>Host</label>
        <input className={s.sshInput} value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.10" required />
      </div>
      <div className={s.settingsRow}>
        <label>Port</label>
        <input className={s.sshInput} type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
      </div>
      <div className={s.settingsRow}>
        <label>User</label>
        <input className={s.sshInput} value={user} onChange={(e) => setUser(e.target.value)} placeholder="root" />
      </div>
      <div className={s.settingsRow}>
        <label>Key</label>
        <input className={s.sshInput} value={identityFile} onChange={(e) => setIdentityFile(e.target.value)} placeholder="~/.ssh/id_rsa" />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button type="submit" className={s.sshBtnPrimary}>Save</button>
        <button type="button" className={s.settingsBtn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function SshPanel({ embedded }: { embedded?: boolean }) {
  const connections = useSshStore((st) => st.connections);
  const addConnection = useSshStore((st) => st.addConnection);
  const updateConnection = useSshStore((st) => st.updateConnection);
  const deleteConnection = useSshStore((st) => st.deleteConnection);
  const buildCommand = useSshStore((st) => st.buildCommand);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleConnect = useCallback(
    (conn: SshConnection) => {
      const id = useTerminalStore.getState().focusedTerminalId;
      if (id) {
        const cmd = buildCommand(conn);
        writeTerminal(id, `${cmd}\r`);
      }
    },
    [buildCommand]
  );

  const editingConn = editingId ? connections.find((c) => c.id === editingId) : undefined;

  const content = (
    <div className={s.settingsBody}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span className={s.settingsLabel} style={{ margin: 0 }}>SSH Connections</span>
        <button
          className={s.settingsBtn}
          onClick={() => { setShowForm(true); setEditingId(null); }}
        >
          + Add
        </button>
      </div>

      {(showForm || editingId) && (
        <SshForm
          initial={editingConn}
          onSave={(data) => {
            if (editingId) {
              updateConnection(editingId, data);
            } else {
              addConnection(data);
            }
            setShowForm(false);
            setEditingId(null);
          }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {connections.length === 0 && !showForm && (
        <div className={s.filesEmpty}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
            <rect x="2" y="2" width="20" height="20" rx="3"/>
            <path d="M7 8l3 3-3 3M12 16h5"/>
          </svg>
          <span>No SSH connections</span>
          <span style={{ fontSize: 11 }}>Add a server to connect in one click</span>
        </div>
      )}

      {connections.map((conn) => (
        <div key={conn.id} className={s.sshCard}>
          <div className={s.sshCardTop}>
            <div className={s.sshCardName}>{conn.name}</div>
            <div className={s.sshCardActions}>
              <button
                className={s.sshBtnConnect}
                onClick={() => handleConnect(conn)}
                title="Connect"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </button>
              <button
                className={s.sshBtnSmall}
                onClick={() => { setEditingId(conn.id); setShowForm(false); }}
                title="Edit"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
              </button>
              <button
                className={s.sshBtnSmall}
                onClick={() => deleteConnection(conn.id)}
                title="Delete"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6M14 11v6"/>
                </svg>
              </button>
            </div>
          </div>
          <div className={s.sshCardDetail}>
            {conn.user ? `${conn.user}@` : ""}{conn.host}{conn.port !== 22 ? `:${conn.port}` : ""}
          </div>
          {conn.identityFile && (
            <div className={s.sshCardDetail} style={{ opacity: 0.5 }}>
              Key: {conn.identityFile}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (embedded) return content;

  return (
    <div className={s.settingsPanel}>
      <div className={s.settingsHeader}>
        <span className={s.settingsTitle}>SSH</span>
      </div>
      {content}
    </div>
  );
}
