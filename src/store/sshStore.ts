import { create } from "zustand";

const STORAGE_KEY = "agentworkspace-ssh-connections";

export interface SshConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  identityFile: string;
}

function load(): SshConnection[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function save(connections: SshConnection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}

interface SshState {
  connections: SshConnection[];
  addConnection: (conn: Omit<SshConnection, "id">) => void;
  updateConnection: (id: string, partial: Partial<SshConnection>) => void;
  deleteConnection: (id: string) => void;
  buildCommand: (conn: SshConnection) => string;
}

export const useSshStore = create<SshState>((set, get) => ({
  connections: load(),

  addConnection: (conn) => {
    const id = `ssh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const connections = [...get().connections, { ...conn, id }];
    save(connections);
    set({ connections });
  },

  updateConnection: (id, partial) => {
    const connections = get().connections.map((c) =>
      c.id === id ? { ...c, ...partial } : c
    );
    save(connections);
    set({ connections });
  },

  deleteConnection: (id) => {
    const connections = get().connections.filter((c) => c.id !== id);
    save(connections);
    set({ connections });
  },

  buildCommand: (conn) => {
    let cmd = "ssh";
    if (conn.user) cmd += ` ${conn.user}@${conn.host}`;
    else cmd += ` ${conn.host}`;
    if (conn.port && conn.port !== 22) cmd += ` -p ${conn.port}`;
    if (conn.identityFile) cmd += ` -i "${conn.identityFile}"`;
    return cmd;
  },
}));
