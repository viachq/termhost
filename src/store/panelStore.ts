import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ActiveView } from "../types";

export type ExplorerTab = "files" | "browser" | "preview" | "graph" | "translate" | "settings";

interface PanelState {
  explorerOpen: boolean;
  explorerTab: ExplorerTab;
  explorerWidth: number;
  searchVisible: boolean;
  activeView: ActiveView;
  fullscreen: boolean;

  openExplorer: (tab: ExplorerTab) => void;
  toggleExplorer: (tab: ExplorerTab) => void;
  setExplorerWidth: (w: number) => void;
  toggleSearch: () => void;
  toggleTranslate: () => void;
  toggleSettings: () => void;
  setActiveView: (view: ActiveView) => void;
  showTerminals: () => void;
  toggleFullscreen: () => void;

  // compat
  translateOpen: boolean;
  filesOpen: boolean;
  browserOpen: boolean;
  graphOpen: boolean;
  settingsOpen: boolean;
  toggleFiles: () => void;
  toggleBrowser: () => void;
  toggleGraph: () => void;
}

export const usePanelStore = create<PanelState>((set, get) => ({
  explorerOpen: false,
  explorerTab: "files",
  explorerWidth: 380,
  searchVisible: false,
  activeView: "terminals",
  fullscreen: false,

  openExplorer: (tab) => set({ explorerOpen: true, explorerTab: tab }),
  toggleExplorer: (tab) => set((s) => {
    if (s.explorerOpen && s.explorerTab === tab) return { explorerOpen: false };
    return { explorerOpen: true, explorerTab: tab };
  }),
  setExplorerWidth: (w) => set({ explorerWidth: w }),

  toggleFullscreen: () => {
    const next = !get().fullscreen;
    set({ fullscreen: next });
    getCurrentWindow().setFullscreen(next).catch(() => {});
  },
  toggleSearch: () => set((s) => ({ searchVisible: !s.searchVisible })),
  toggleTranslate: () => get().toggleExplorer("translate"),
  toggleSettings: () => get().toggleExplorer("settings"),
  setActiveView: (activeView) => set({ activeView }),
  showTerminals: () => set({ activeView: "terminals" }),

  // compat
  get translateOpen() { return get().explorerOpen && get().explorerTab === "translate"; },
  get filesOpen() { return get().explorerOpen && get().explorerTab === "files"; },
  get browserOpen() { return get().explorerOpen && get().explorerTab === "browser"; },
  get graphOpen() { return get().explorerOpen && get().explorerTab === "graph"; },
  get settingsOpen() { return get().explorerOpen && get().explorerTab === "settings"; },
  toggleFiles: () => get().toggleExplorer("files"),
  toggleBrowser: () => get().toggleExplorer("browser"),
  toggleGraph: () => get().toggleExplorer("graph"),
}));
