import { create } from "zustand";
import type { TerminalInfo, WorkspaceInfo, MobileTab, DirEntry } from "../types";

type ConnectionState = "disconnected" | "connecting" | "connected";
export type TerminalMode = "view" | "control";

export interface ClipboardEntry {
  text: string;
  ts: number;
}

interface FilesState {
  currentPath: string;
  entries: DirEntry[];
  history: string[];
  /// Paths popped off `history` by going back — lets a forward button redo
  /// the same navigation instead of only ever being able to go up.
  forward: string[];
  loading: boolean;
  error: string | null;
}

export interface Snippet {
  id: string;
  label: string;
  text: string;
}

export type ThemeMode = "dark" | "light";

interface MobileState {
  connection: ConnectionState;
  host: string;
  terminals: TerminalInfo[];
  activeTerminalId: string | null;
  workspaces: WorkspaceInfo[];
  activeWorkspaceIdx: number;
  showWorkspacePicker: boolean;
  activeTab: MobileTab;
  terminalMode: TerminalMode;
  clipboardHistory: ClipboardEntry[];
  toast: string | null;
  files: FilesState;

  fontSize: number;
  pinnedIds: string[];
  termOrder: string[];
  snippets: Snippet[];
  savedHosts: string[];
  theme: ThemeMode;
  accent: string;
  pingMs: number | null;
  favoriteDirs: string[];

  setConnection: (s: ConnectionState) => void;
  setHost: (h: string) => void;
  setTerminals: (t: TerminalInfo[]) => void;
  setActiveTerminalId: (id: string | null) => void;
  setWorkspaces: (ws: WorkspaceInfo[], activeIdx: number) => void;
  setActiveWorkspaceIdx: (idx: number) => void;
  setShowWorkspacePicker: (show: boolean) => void;
  setActiveTab: (tab: MobileTab) => void;
  setTerminalMode: (mode: TerminalMode) => void;
  addClipboardEntry: (text: string) => void;
  removeClipboardEntry: (ts: number) => void;
  clearClipboardHistory: () => void;
  showToast: (msg: string) => void;
  setFilesState: (fs: Partial<FilesState>) => void;

  setFontSize: (n: number) => void;
  togglePinned: (id: string) => void;
  moveTerminal: (ids: string[], id: string, dir: "up" | "down") => void;
  addSnippet: (label: string, text: string) => void;
  removeSnippet: (id: string) => void;
  addSavedHost: (h: string) => void;
  removeSavedHost: (h: string) => void;
  setTheme: (t: ThemeMode) => void;
  setAccent: (c: string) => void;
  setPingMs: (ms: number | null) => void;
  toggleFavoriteDir: (path: string) => void;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const useMobileStore = create<MobileState>((set) => ({
  connection: "disconnected",
  host: localStorage.getItem("th-mobile-host") || "",
  terminals: [],
  activeTerminalId: null,
  workspaces: [],
  activeWorkspaceIdx: 0,
  showWorkspacePicker: false,
  activeTab: "terminal",
  terminalMode: (localStorage.getItem("th-term-mode") as TerminalMode) || "view",
  clipboardHistory: JSON.parse(localStorage.getItem("th-clip-history") || "[]"),
  toast: null,
  files: {
    currentPath: "",
    entries: [],
    history: [],
    forward: [],
    loading: false,
    error: null,
  },
  favoriteDirs: loadJson<string[]>("th-favorite-dirs", []),

  fontSize: Number(localStorage.getItem("th-font-size")) || 13,
  pinnedIds: loadJson<string[]>("th-pinned-ids", []),
  termOrder: loadJson<string[]>("th-term-order", []),
  snippets: loadJson<Snippet[]>("th-snippets", []),
  savedHosts: loadJson<string[]>("th-saved-hosts", []),
  theme: (localStorage.getItem("th-theme") as ThemeMode) || "dark",
  accent: localStorage.getItem("th-accent") || "#e94560",
  pingMs: null,

  setConnection: (connection) => set({ connection }),
  setHost: (host) => {
    localStorage.setItem("th-mobile-host", host);
    set((s) => {
      const savedHosts = s.savedHosts.includes(host)
        ? s.savedHosts
        : [...s.savedHosts, host].slice(-8);
      localStorage.setItem("th-saved-hosts", JSON.stringify(savedHosts));
      return { host, savedHosts };
    });
  },
  setTerminals: (terminals) => set({ terminals }),
  setActiveTerminalId: (activeTerminalId) => set({ activeTerminalId }),
  setWorkspaces: (workspaces, activeWorkspaceIdx) =>
    set({ workspaces, activeWorkspaceIdx }),
  setActiveWorkspaceIdx: (activeWorkspaceIdx) => set({ activeWorkspaceIdx }),
  setShowWorkspacePicker: (showWorkspacePicker) => set({ showWorkspacePicker }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setTerminalMode: (terminalMode) => {
    localStorage.setItem("th-term-mode", terminalMode);
    set({ terminalMode });
  },
  addClipboardEntry: (text) =>
    set((s) => {
      const history = [{ text, ts: Date.now() }, ...s.clipboardHistory].slice(0, 50);
      localStorage.setItem("th-clip-history", JSON.stringify(history));
      return { clipboardHistory: history };
    }),
  removeClipboardEntry: (ts) =>
    set((s) => {
      const history = s.clipboardHistory.filter((e) => e.ts !== ts);
      localStorage.setItem("th-clip-history", JSON.stringify(history));
      return { clipboardHistory: history };
    }),
  clearClipboardHistory: () => {
    localStorage.setItem("th-clip-history", "[]");
    set({ clipboardHistory: [] });
  },
  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => set({ toast: null }), 2000);
  },
  setFilesState: (fs) => set((s) => ({ files: { ...s.files, ...fs } })),

  setFontSize: (fontSize) => {
    const clamped = Math.max(9, Math.min(22, fontSize));
    localStorage.setItem("th-font-size", String(clamped));
    set({ fontSize: clamped });
  },
  togglePinned: (id) =>
    set((s) => {
      const pinnedIds = s.pinnedIds.includes(id)
        ? s.pinnedIds.filter((p) => p !== id)
        : [...s.pinnedIds, id];
      localStorage.setItem("th-pinned-ids", JSON.stringify(pinnedIds));
      return { pinnedIds };
    }),
  moveTerminal: (ids, id, dir) =>
    set(() => {
      const arr = [...ids];
      const i = arr.indexOf(id);
      const j = dir === "up" ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= arr.length) return {};
      [arr[i], arr[j]] = [arr[j], arr[i]];
      localStorage.setItem("th-term-order", JSON.stringify(arr));
      return { termOrder: arr };
    }),
  addSnippet: (label, text) =>
    set((s) => {
      const snippets = [...s.snippets, { id: `sn-${Date.now()}`, label, text }];
      localStorage.setItem("th-snippets", JSON.stringify(snippets));
      return { snippets };
    }),
  removeSnippet: (id) =>
    set((s) => {
      const snippets = s.snippets.filter((sn) => sn.id !== id);
      localStorage.setItem("th-snippets", JSON.stringify(snippets));
      return { snippets };
    }),
  addSavedHost: (h) =>
    set((s) => {
      if (s.savedHosts.includes(h)) return s;
      const savedHosts = [...s.savedHosts, h].slice(-8);
      localStorage.setItem("th-saved-hosts", JSON.stringify(savedHosts));
      return { savedHosts };
    }),
  removeSavedHost: (h) =>
    set((s) => {
      const savedHosts = s.savedHosts.filter((x) => x !== h);
      localStorage.setItem("th-saved-hosts", JSON.stringify(savedHosts));
      return { savedHosts };
    }),
  setTheme: (theme) => {
    localStorage.setItem("th-theme", theme);
    set({ theme });
  },
  setAccent: (accent) => {
    localStorage.setItem("th-accent", accent);
    set({ accent });
  },
  setPingMs: (pingMs) => set({ pingMs }),
  toggleFavoriteDir: (path) =>
    set((s) => {
      const favoriteDirs = s.favoriteDirs.includes(path)
        ? s.favoriteDirs.filter((p) => p !== path)
        : [...s.favoriteDirs, path];
      localStorage.setItem("th-favorite-dirs", JSON.stringify(favoriteDirs));
      return { favoriteDirs };
    }),
}));
