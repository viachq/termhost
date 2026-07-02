import { create } from "zustand";
import { listDir } from "../hooks/useTauriIpc";
import type { FileEntry } from "../types";

const BOOKMARKS_KEY = "agentworkspace-bookmarks";

function loadBookmarks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]");
  } catch {
    return [];
  }
}

export interface FlatTreeEntry {
  entry: FileEntry;
  depth: number;
  expanded: boolean;
}

function flattenTree(
  entries: FileEntry[],
  expandedPaths: Set<string>,
  dirCache: Map<string, FileEntry[]>,
  depth: number = 0
): FlatTreeEntry[] {
  const result: FlatTreeEntry[] = [];
  for (const entry of entries) {
    const expanded = entry.is_dir && expandedPaths.has(entry.path);
    result.push({ entry, depth, expanded });
    if (expanded) {
      const children = dirCache.get(entry.path);
      if (children) {
        result.push(...flattenTree(children, expandedPaths, dirCache, depth + 1));
      }
    }
  }
  return result;
}

interface FileBrowserState {
  currentBrowsePath: string;
  detectedDrives: string[];
  bookmarks: string[];
  selectedPaths: Set<string>;
  lastSelectedIndex: number | null;
  expandedPaths: Set<string>;
  dirCache: Map<string, FileEntry[]>;
  rootEntries: FileEntry[];

  setCurrentBrowsePath: (path: string) => void;
  setDetectedDrives: (drives: string[]) => void;
  detectDrives: () => Promise<void>;
  addBookmark: (path: string) => void;
  removeBookmark: (path: string) => void;
  toggleBookmark: (path: string) => void;
  setSelectedPaths: (paths: Set<string>) => void;
  setLastSelectedIndex: (index: number | null) => void;
  clearSelection: () => void;
  loadRoot: (path: string) => Promise<void>;
  toggleExpand: (path: string) => Promise<void>;
  collapseAll: () => void;
  refreshDir: (path: string) => Promise<void>;
  getFlatTree: () => FlatTreeEntry[];
}

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  currentBrowsePath: "",
  detectedDrives: [],
  bookmarks: loadBookmarks(),
  selectedPaths: new Set(),
  lastSelectedIndex: null,
  expandedPaths: new Set(),
  dirCache: new Map(),
  rootEntries: [],

  setCurrentBrowsePath: (currentBrowsePath) => {
    set({
      currentBrowsePath,
      selectedPaths: new Set(),
      lastSelectedIndex: null,
      expandedPaths: new Set(),
      rootEntries: [],
    });
    get().loadRoot(currentBrowsePath);
  },

  setDetectedDrives: (detectedDrives) => set({ detectedDrives }),

  detectDrives: async () => {
    const drives: string[] = [];
    for (const letter of ["C", "D", "E", "F", "G", "H"]) {
      try {
        await listDir(`${letter}:\\`);
        drives.push(`${letter}:`);
      } catch {
        // drive not available
      }
    }
    set({ detectedDrives: drives });
  },

  addBookmark: (path) => {
    const bm = [...get().bookmarks, path];
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bm));
    set({ bookmarks: bm });
  },
  removeBookmark: (path) => {
    const bm = get().bookmarks.filter((b) => b !== path);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bm));
    set({ bookmarks: bm });
  },
  toggleBookmark: (path) => {
    if (get().bookmarks.includes(path)) {
      get().removeBookmark(path);
    } else {
      get().addBookmark(path);
    }
  },
  setSelectedPaths: (selectedPaths) => set({ selectedPaths }),
  setLastSelectedIndex: (lastSelectedIndex) => set({ lastSelectedIndex }),
  clearSelection: () => set({ selectedPaths: new Set(), lastSelectedIndex: null }),

  loadRoot: async (path: string) => {
    try {
      const entries = await listDir(path);
      const dirCache = new Map(get().dirCache);
      dirCache.set(path, entries);
      set({ rootEntries: entries, dirCache });
    } catch (e) {
      console.error("Failed to list dir:", e);
    }
  },

  toggleExpand: async (path: string) => {
    const { expandedPaths, dirCache } = get();
    const next = new Set(expandedPaths);

    if (next.has(path)) {
      next.delete(path);
      set({ expandedPaths: next });
    } else {
      next.add(path);
      if (!dirCache.has(path)) {
        try {
          const entries = await listDir(path);
          const newCache = new Map(get().dirCache);
          newCache.set(path, entries);
          set({ expandedPaths: next, dirCache: newCache });
          return;
        } catch (e) {
          console.error("Failed to list dir:", e);
          next.delete(path);
        }
      }
      set({ expandedPaths: next });
    }
  },

  collapseAll: () => set({ expandedPaths: new Set() }),

  refreshDir: async (path: string) => {
    try {
      const entries = await listDir(path);
      const dirCache = new Map(get().dirCache);
      dirCache.set(path, entries);
      if (path === get().currentBrowsePath) {
        set({ rootEntries: entries, dirCache });
      } else {
        set({ dirCache });
      }
    } catch (e) {
      console.error("Failed to refresh dir:", e);
    }
  },

  getFlatTree: () => {
    const { rootEntries, expandedPaths, dirCache } = get();
    return flattenTree(rootEntries, expandedPaths, dirCache);
  },
}));
