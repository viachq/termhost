import { create } from "zustand";
import type { TerminalInfo, WorkspaceInfo } from "../types";

type ConnectionState = "disconnected" | "connecting" | "connected";
type MobileTab = "terminal" | "clipboard";

export interface ClipboardEntry {
  text: string;
  ts: number;
}

interface MobileState {
  connection: ConnectionState;
  host: string;
  terminals: TerminalInfo[];
  activeTerminalId: string | null;
  workspaces: WorkspaceInfo[];
  activeWorkspaceIdx: number;
  showWorkspacePicker: boolean;
  activeTab: MobileTab;
  clipboardHistory: ClipboardEntry[];
  toast: string | null;

  setConnection: (s: ConnectionState) => void;
  setHost: (h: string) => void;
  setTerminals: (t: TerminalInfo[]) => void;
  setActiveTerminalId: (id: string | null) => void;
  setWorkspaces: (ws: WorkspaceInfo[], activeIdx: number) => void;
  setActiveWorkspaceIdx: (idx: number) => void;
  setShowWorkspacePicker: (show: boolean) => void;
  setActiveTab: (tab: MobileTab) => void;
  addClipboardEntry: (text: string) => void;
  showToast: (msg: string) => void;
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
  clipboardHistory: JSON.parse(localStorage.getItem("th-clip-history") || "[]"),
  toast: null,

  setConnection: (connection) => set({ connection }),
  setHost: (host) => {
    localStorage.setItem("th-mobile-host", host);
    set({ host });
  },
  setTerminals: (terminals) => set({ terminals }),
  setActiveTerminalId: (activeTerminalId) => set({ activeTerminalId }),
  setWorkspaces: (workspaces, activeWorkspaceIdx) =>
    set({ workspaces, activeWorkspaceIdx }),
  setActiveWorkspaceIdx: (activeWorkspaceIdx) => set({ activeWorkspaceIdx }),
  setShowWorkspacePicker: (showWorkspacePicker) => set({ showWorkspacePicker }),
  setActiveTab: (activeTab) => set({ activeTab }),
  addClipboardEntry: (text) =>
    set((s) => {
      const history = [{ text, ts: Date.now() }, ...s.clipboardHistory].slice(0, 50);
      localStorage.setItem("th-clip-history", JSON.stringify(history));
      return { clipboardHistory: history };
    }),
  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => set({ toast: null }), 2000);
  },
}));
