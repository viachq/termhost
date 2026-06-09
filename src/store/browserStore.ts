import { create } from "zustand";

const HISTORY_KEY = "agentworkspace-browser-history";

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string | null;
  history: string[];

  addTab: (url?: string) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  navigateTab: (id: string, url: string) => void;
  setTabTitle: (id: string, title: string) => void;
  addToHistory: (url: string) => void;
  getActiveTab: () => BrowserTab | null;
}

let tabCounter = 0;
function makeTabId() {
  return `btab-${Date.now()}-${tabCounter++}`;
}

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch { return []; }
}

function saveHistory(urls: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(urls.slice(0, 20)));
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  history: loadHistory(),

  addTab: (url) => {
    const id = makeTabId();
    const tab: BrowserTab = { id, url: url || "", title: url ? url.replace(/^https?:\/\//, "").slice(0, 40) : "New Tab" };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id,
    }));
    if (url) get().addToHistory(url);
    return id;
  },

  closeTab: (id) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const next = s.tabs.filter((t) => t.id !== id);
      let activeTabId = s.activeTabId;
      if (activeTabId === id) {
        if (next.length === 0) {
          activeTabId = null;
        } else {
          activeTabId = next[Math.min(idx, next.length - 1)].id;
        }
      }
      return { tabs: next, activeTabId };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  navigateTab: (id, url) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, url, title: url.replace(/^https?:\/\//, "").slice(0, 40) } : t
      ),
    }));
    get().addToHistory(url);
  },

  setTabTitle: (id, title) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  },

  addToHistory: (url) => {
    set((s) => {
      const next = [url, ...s.history.filter((u) => u !== url)].slice(0, 20);
      saveHistory(next);
      return { history: next };
    });
  },

  getActiveTab: () => {
    const s = get();
    return s.tabs.find((t) => t.id === s.activeTabId) || null;
  },
}));
