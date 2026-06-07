import { create } from "zustand";
import type { Workspace, TreeNode, TerminalRef } from "../types";
import { WS_COLORS } from "../constants/themes";
import { getTerminalIdsForWorkspace } from "./terminalStore";
import { syncWorkspaces } from "../hooks/useTauriIpc";

function serializeTree(
  node: TreeNode | null,
  refs: Map<string, TerminalRef>
): any {
  if (!node) return null;
  if (node.type === "leaf") {
    const ref = refs.get(node.id);
    return {
      type: "leaf",
      id: node.id,
      cwd: ref?.lastDir || ref?.cwd || node._cwd || "",
      command: ref?.command || node._command || "",
    };
  }
  return {
    type: "split",
    direction: node.direction,
    ratio: node.ratio,
    first: serializeTree(node.first, refs),
    second: serializeTree(node.second, refs),
  };
}

function getTerminalOrderFromTree(node: TreeNode | null): string[] {
  if (!node) return [];
  if (node.type === "leaf") return [node.id];
  return [
    ...getTerminalOrderFromTree(node.first),
    ...getTerminalOrderFromTree(node.second),
  ];
}

function treeToPanes(node: any): { cwd: string; command: string }[] {
  if (!node) return [];
  if (node.type === "leaf") return [{ cwd: node.cwd || "", command: node.command || "" }];
  return [...treeToPanes(node.first), ...treeToPanes(node.second)];
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceIdx: number;
  homeDir: string;

  setHomeDir: (dir: string) => void;
  loadWorkspaces: () => void;
  saveWorkspaces: () => void;
  addWorkspace: (ws: Workspace) => void;
  updateWorkspace: (idx: number, ws: Partial<Workspace>) => void;
  deleteWorkspace: (idx: number) => void;
  setActiveWorkspaceIdx: (idx: number) => void;
  getActiveWorkspace: () => Workspace;
  saveCurrentSplitTree: (
    splitRoot: TreeNode | null,
    terminalOrder: string[],
    refs: Map<string, TerminalRef>
  ) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceIdx: 0,
  homeDir: "",

  setHomeDir: (homeDir) => set({ homeDir }),

  loadWorkspaces: () => {
    const raw = localStorage.getItem("terminalhub-workspaces-v2");
    let workspaces: Workspace[];
    if (raw) {
      try {
        workspaces = JSON.parse(raw);
      } catch {
        workspaces = [];
      }
    } else {
      workspaces = [];
    }
    if (workspaces.length === 0) {
      workspaces = [
        { name: "Main", color: 0, panes: [{ cwd: "", command: "" }] },
        { name: "Dev", color: 2, panes: [{ cwd: "", command: "" }] },
      ];
    }
    const savedIdx = parseInt(localStorage.getItem("terminalhub-active-ws") || "0");
    const activeWorkspaceIdx = savedIdx >= 0 && savedIdx < workspaces.length ? savedIdx : 0;
    set({ workspaces, activeWorkspaceIdx });

    const wsData = workspaces.map((ws, i) => ({
      name: ws.name,
      color: ws.color,
      terminal_ids: getTerminalIdsForWorkspace(i),
    }));
    syncWorkspaces(wsData, activeWorkspaceIdx).catch(() => {});
  },

  saveWorkspaces: () => {
    const { workspaces, activeWorkspaceIdx } = get();
    localStorage.setItem("terminalhub-workspaces-v2", JSON.stringify(workspaces));
    localStorage.setItem("terminalhub-active-ws", String(activeWorkspaceIdx));

    const wsData = workspaces.map((ws, i) => ({
      name: ws.name,
      color: ws.color,
      terminal_ids: getTerminalIdsForWorkspace(i),
    }));
    syncWorkspaces(wsData, activeWorkspaceIdx).catch(() => {});
  },

  addWorkspace: (ws) => {
    const workspaces = [...get().workspaces, ws];
    set({ workspaces, activeWorkspaceIdx: workspaces.length - 1 });
    get().saveWorkspaces();
  },

  updateWorkspace: (idx, partial) => {
    const workspaces = [...get().workspaces];
    workspaces[idx] = { ...workspaces[idx], ...partial };
    set({ workspaces });
    get().saveWorkspaces();
  },

  deleteWorkspace: (idx) => {
    const workspaces = get().workspaces.filter((_, i) => i !== idx);
    let activeWorkspaceIdx = get().activeWorkspaceIdx;
    if (workspaces.length === 0) {
      activeWorkspaceIdx = 0;
    } else if (activeWorkspaceIdx >= workspaces.length) {
      activeWorkspaceIdx = workspaces.length - 1;
    }
    set({ workspaces, activeWorkspaceIdx });
    get().saveWorkspaces();
  },

  setActiveWorkspaceIdx: (idx) => {
    set({ activeWorkspaceIdx: idx });
    localStorage.setItem("terminalhub-active-ws", String(idx));
    const { workspaces } = get();
    const wsData = workspaces.map((ws, i) => ({
      name: ws.name,
      color: ws.color,
      terminal_ids: getTerminalIdsForWorkspace(i),
    }));
    syncWorkspaces(wsData, idx).catch(() => {});
  },

  getActiveWorkspace: () => {
    const { workspaces, activeWorkspaceIdx } = get();
    return workspaces[activeWorkspaceIdx];
  },

  saveCurrentSplitTree: (splitRoot, _terminalOrder, refs) => {
    const { activeWorkspaceIdx, workspaces } = get();
    const ws = workspaces[activeWorkspaceIdx];
    if (!ws) return;
    const serialized = serializeTree(splitRoot, refs);
    const panes = treeToPanes(serialized);
    const updated = [...workspaces];
    updated[activeWorkspaceIdx] = { ...ws, splitTree: serialized, panes };
    set({ workspaces: updated });
    get().saveWorkspaces();
  },
}));
