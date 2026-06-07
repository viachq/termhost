import { create } from "zustand";
import type { TreeNode, TerminalRef } from "../types";

export const terminalRefs = new Map<string, TerminalRef>();

export const workspaceTrees = new Map<number, TreeNode>();

interface TerminalState {
  splitRoot: TreeNode | null;
  terminalOrder: string[];
  focusedTerminalId: string | null;
  wsTreeVersion: number;
  titles: Record<string, string>;

  setSplitRoot: (root: TreeNode | null) => void;
  setTerminalOrder: (order: string[]) => void;
  setFocusedTerminalId: (id: string | null) => void;
  bumpWsTreeVersion: () => void;
  setTitle: (id: string, title: string) => void;
}

function getOrderFromTree(node: TreeNode | null): string[] {
  if (!node) return [];
  if (node.type === "leaf") return [node.id];
  return [...getOrderFromTree(node.first), ...getOrderFromTree(node.second)];
}

export function getTerminalIdsForWorkspace(wsIdx: number): string[] {
  const tree = workspaceTrees.get(wsIdx);
  return getOrderFromTree(tree ?? null);
}

export const useTerminalStore = create<TerminalState>((set) => ({
  splitRoot: null,
  terminalOrder: [],
  focusedTerminalId: null,
  wsTreeVersion: 0,
  titles: {},

  setSplitRoot: (root) => {
    set({ splitRoot: root, terminalOrder: getOrderFromTree(root) });
  },

  setTerminalOrder: (terminalOrder) => set({ terminalOrder }),

  setFocusedTerminalId: (focusedTerminalId) => set({ focusedTerminalId }),

  bumpWsTreeVersion: () => set((s) => ({ wsTreeVersion: s.wsTreeVersion + 1 })),

  setTitle: (id, title) => set((s) => ({ titles: { ...s.titles, [id]: title } })),
}));
