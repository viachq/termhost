import { create } from "zustand";
import type { FileTab } from "../types";
import { readFile, readFileBytes, writeFile } from "../hooks/useTauriIpc";
import { usePanelStore } from "./panelStore";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "ico", "svg", "avif"]);
const MIME_MAP: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", bmp: "image/bmp", webp: "image/webp",
  ico: "image/x-icon", svg: "image/svg+xml", avif: "image/avif",
};

interface FileViewerState {
  fileTabs: FileTab[];
  activeTabId: string | null;

  openFile: (path: string, gotoLine?: number) => Promise<void>;
  closeTab: (tabId: string) => void;
  switchToTab: (tabId: string) => void;
  closeAll: () => void;
  setDirty: (tabId: string, dirty: boolean) => void;
  updateContent: (tabId: string, content: string, dirty: boolean) => void;
  saveTab: (tabId: string, content: string) => Promise<void>;
  clearGotoLine: (tabId: string) => void;
}

export const useFileViewerStore = create<FileViewerState>((set, get) => ({
  fileTabs: [],
  activeTabId: null,

  openFile: async (path: string, gotoLine?: number) => {
    const { fileTabs } = get();
    const existing = fileTabs.find((t) => t.path === path);
    if (existing) {
      set({
        activeTabId: existing.id,
        fileTabs: gotoLine
          ? get().fileTabs.map((t) => (t.id === existing.id ? { ...t, gotoLine } : t))
          : get().fileTabs,
      });
      usePanelStore.getState().openExplorer("preview");
      return;
    }
    const name = path.split(/[\\/]/).pop() || path;
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    const isMd = ext === "md" || ext === "markdown";
    const isImage = IMAGE_EXTS.has(ext);
    let content: string;
    if (isImage) {
      const bytes = await readFileBytes(path);
      const binary = String.fromCharCode(...new Uint8Array(bytes));
      const b64 = btoa(binary);
      content = `data:${MIME_MAP[ext] || "image/png"};base64,${b64}`;
    } else {
      content = await readFile(path);
    }
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const tab: FileTab = { id, path, name, ext, isMd, isImage, content, gotoLine };
    set({ fileTabs: [...fileTabs, tab], activeTabId: id });
    usePanelStore.getState().openExplorer("preview");
  },

  closeTab: (tabId: string) => {
    const { fileTabs, activeTabId } = get();
    const idx = fileTabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    const newTabs = fileTabs.filter((t) => t.id !== tabId);
    let newActiveId = activeTabId;
    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        newActiveId = newTabs[Math.min(idx, newTabs.length - 1)].id;
      } else {
        newActiveId = null;
      }
    }
    set({ fileTabs: newTabs, activeTabId: newActiveId });
  },

  switchToTab: (tabId: string) => set({ activeTabId: tabId }),

  closeAll: () => set({ fileTabs: [], activeTabId: null }),

  setDirty: (tabId, dirty) =>
    set((s) => ({
      fileTabs: s.fileTabs.map((t) => (t.id === tabId && !!t.dirty !== dirty ? { ...t, dirty } : t)),
    })),

  updateContent: (tabId, content, dirty) =>
    set((s) => ({
      fileTabs: s.fileTabs.map((t) => (t.id === tabId ? { ...t, content, dirty } : t)),
    })),

  saveTab: async (tabId, content) => {
    const tab = get().fileTabs.find((t) => t.id === tabId);
    if (!tab) return;
    await writeFile(tab.path, content);
    set((s) => ({
      fileTabs: s.fileTabs.map((t) => (t.id === tabId ? { ...t, content, dirty: false } : t)),
    }));
  },

  clearGotoLine: (tabId) =>
    set((s) => ({
      fileTabs: s.fileTabs.map((t) => (t.id === tabId ? { ...t, gotoLine: undefined } : t)),
    })),
}));
