import { create } from "zustand";
import type { TerminalInfo, WorkspaceInfo } from "../types";

type ConnectionState = "disconnected" | "connecting" | "connected";

interface MobileState {
  connection: ConnectionState;
  host: string;
  terminals: TerminalInfo[];
  activeTerminalId: string | null;
  workspaces: WorkspaceInfo[];
  activeWorkspaceIdx: number;
  showWorkspacePicker: boolean;

  setConnection: (s: ConnectionState) => void;
  setHost: (h: string) => void;
  setTerminals: (t: TerminalInfo[]) => void;
  setActiveTerminalId: (id: string | null) => void;
  setWorkspaces: (ws: WorkspaceInfo[], activeIdx: number) => void;
  setActiveWorkspaceIdx: (idx: number) => void;
  setShowWorkspacePicker: (show: boolean) => void;
}

export const useMobileStore = create<MobileState>((set) => ({
  connection: "disconnected",
  host: localStorage.getItem("th-mobile-host") || "",
  terminals: [],
  activeTerminalId: null,
  workspaces: [],
  activeWorkspaceIdx: 0,
  showWorkspacePicker: false,

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
}));
