import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ActiveView } from "../types";

export type ExplorerTab = "files" | "preview" | "git" | "settings" | "pairing";

interface PanelState {
  explorerOpen: boolean;
  explorerTab: ExplorerTab;
  secondaryTab: ExplorerTab | null;
  splitRatio: number;
  explorerWidth: number;
  searchVisible: boolean;
  activeView: ActiveView;
  fullscreen: boolean;

  openExplorer: (tab: ExplorerTab) => void;
  toggleExplorer: (tab: ExplorerTab) => void;
  openSecondary: (tab: ExplorerTab) => void;
  closeSecondary: () => void;
  setSplitRatio: (r: number) => void;
  setExplorerWidth: (w: number) => void;
  toggleSearch: () => void;
  toggleSettings: () => void;
  setActiveView: (view: ActiveView) => void;
  showTerminals: () => void;
  showDashboard: () => void;
  toggleFullscreen: () => void;

  // compat
  filesOpen: boolean;
  settingsOpen: boolean;
  toggleFiles: () => void;
}

export const usePanelStore = create<PanelState>((set, get) => ({
  explorerOpen: false,
  explorerTab: "files",
  secondaryTab: null,
  splitRatio: 0.5,
  explorerWidth: 380,
  searchVisible: false,
  activeView: "dashboard",
  fullscreen: false,

  openExplorer: (tab) => set((s) => {
    if (s.secondaryTab === tab) return { explorerOpen: true, explorerTab: tab, secondaryTab: s.explorerTab };
    return { explorerOpen: true, explorerTab: tab };
  }),
  toggleExplorer: (tab) => set((s) => {
    if (s.explorerOpen && s.explorerTab === tab && !s.secondaryTab) return { explorerOpen: false };
    if (s.explorerOpen && s.explorerTab === tab && s.secondaryTab) return { explorerTab: s.secondaryTab, secondaryTab: null };
    if (s.secondaryTab === tab) return { secondaryTab: null };
    return { explorerOpen: true, explorerTab: tab };
  }),
  openSecondary: (tab) => set((s) => {
    if (tab === s.explorerTab) return {};
    return { explorerOpen: true, secondaryTab: tab };
  }),
  closeSecondary: () => set({ secondaryTab: null }),
  setSplitRatio: (r) => set({ splitRatio: r }),
  setExplorerWidth: (w) => set({ explorerWidth: w }),

  toggleFullscreen: () => {
    const next = !get().fullscreen;
    set({ fullscreen: next });
    getCurrentWindow().setFullscreen(next).catch(() => {});
  },
  toggleSearch: () => set((s) => ({ searchVisible: !s.searchVisible })),
  toggleSettings: () => get().toggleExplorer("settings"),
  setActiveView: (activeView) => set({ activeView }),
  showTerminals: () => set({ activeView: "terminals" }),
  showDashboard: () => set({ activeView: "dashboard" }),

  // compat
  get filesOpen() { return get().explorerOpen && get().explorerTab === "files"; },
  get settingsOpen() { return get().explorerOpen && get().explorerTab === "settings"; },
  toggleFiles: () => get().toggleExplorer("files"),
}));
