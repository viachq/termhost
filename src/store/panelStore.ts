1|import { create } from "zustand";
2|import { getCurrentWindow } from "@tauri-apps/api/window";
3|import type { ActiveView } from "../types";
4|
5|export type ExplorerTab = "files" | "preview" | "git" | "settings" | "pairing";
6|
7|interface PanelState {
8|  explorerOpen: boolean;
9|  explorerTab: ExplorerTab;
10|  secondaryTab: ExplorerTab | null;
11|  splitRatio: number;
12|  explorerWidth: number;
13|  searchVisible: boolean;
14|  activeView: ActiveView;
15|  fullscreen: boolean;
16|
17|  openExplorer: (tab: ExplorerTab) => void;
18|  toggleExplorer: (tab: ExplorerTab) => void;
19|  openSecondary: (tab: ExplorerTab) => void;
20|  closeSecondary: () => void;
21|  setSplitRatio: (r: number) => void;
22|  setExplorerWidth: (w: number) => void;
23|  toggleSearch: () => void;
24|  toggleSettings: () => void;
25|  setActiveView: (view: ActiveView) => void;
26|  showTerminals: () => void;
27|  showDashboard: () => void;
28|  toggleFullscreen: () => void;
29|
30|  // compat
31|  filesOpen: boolean;
32|  settingsOpen: boolean;
33|  toggleFiles: () => void;
34|}
35|
36|export const usePanelStore = create<PanelState>((set, get) => ({
37|  explorerOpen: false,
38|  explorerTab: "files",
39|  secondaryTab: null,
40|  splitRatio: 0.5,
41|  explorerWidth: 380,
42|  searchVisible: false,
43|  activeView: "dashboard",
44|  fullscreen: false,
45|
46|  openExplorer: (tab) => set((s) => {
47|    if (s.secondaryTab === tab) return { explorerOpen: true, explorerTab: tab, secondaryTab: s.explorerTab };
48|    return { explorerOpen: true, explorerTab: tab };
49|  }),
50|  toggleExplorer: (tab) => set((s) => {
51|    if (s.explorerOpen && s.explorerTab === tab && !s.secondaryTab) return { explorerOpen: false };
52|    if (s.explorerOpen && s.explorerTab === tab && s.secondaryTab) return { explorerTab: s.secondaryTab, secondaryTab: null };
53|    if (s.secondaryTab === tab) return { secondaryTab: null };
54|    return { explorerOpen: true, explorerTab: tab };
55|  }),
56|  openSecondary: (tab) => set((s) => {
57|    if (tab === s.explorerTab) return {};
58|    return { explorerOpen: true, secondaryTab: tab };
59|  }),
60|  closeSecondary: () => set({ secondaryTab: null }),
61|  setSplitRatio: (r) => set({ splitRatio: r }),
62|  setExplorerWidth: (w) => set({ explorerWidth: w }),
63|
64|  toggleFullscreen: () => {
65|    const next = !get().fullscreen;
66|    set({ fullscreen: next });
67|    getCurrentWindow().setFullscreen(next).catch(() => {});
68|  },
69|  toggleSearch: () => set((s) => ({ searchVisible: !s.searchVisible })),
70|  toggleSettings: () => get().toggleExplorer("settings"),
71|  setActiveView: (activeView) => set({ activeView }),
72|  showTerminals: () => set({ activeView: "terminals" }),
73|  showDashboard: () => set({ activeView: "dashboard" }),
74|
75|  // compat
76|  get filesOpen() { return get().explorerOpen && get().explorerTab === "files"; },
77|  get settingsOpen() { return get().explorerOpen && get().explorerTab === "settings"; },
78|  toggleFiles: () => get().toggleExplorer("files"),
81|}));
82|