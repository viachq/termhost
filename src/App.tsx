import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Titlebar from "./components/titlebar/Titlebar";
import SplitContainer from "./components/splitpane/SplitContainer";
import SearchBar from "./components/search/SearchBar";
import ExplorerPanel from "./components/panels/ExplorerPanel";
import TranslateTooltip from "./components/translate/TranslateTooltip";
import CloseDialog from "./components/titlebar/CloseDialog";
import WorkspaceEditor from "./components/pages/WorkspaceEditor";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePinchZoom } from "./hooks/usePinchZoom";
import { useSettingsStore } from "./store/settingsStore";
import { useWorkspaceStore } from "./store/workspaceStore";
import { useTerminalStore, terminalRefs, workspaceTrees, getTerminalIdsForWorkspace } from "./store/terminalStore";
import { usePanelStore } from "./store/panelStore";
import { useBrowserStore } from "./store/browserStore";
import { getHomeDir, killTerminal, resizeTerminal } from "./hooks/useTauriIpc";
import { panesToTree, instantiateTree, splitPaneInTree, removePaneFromTree } from "./hooks/useSplitTree";

export default function App() {
  const loadSettings = useSettingsStore((st) => st.loadSettings);
  const loadWorkspaces = useWorkspaceStore((st) => st.loadWorkspaces);
  const setHomeDir = useWorkspaceStore((st) => st.setHomeDir);
  const activeView = usePanelStore((st) => st.activeView);
  const setActiveView = usePanelStore((st) => st.setActiveView);
  const setFocusedTerminalId = useTerminalStore((st) => st.setFocusedTerminalId);
  const bumpWsTreeVersion = useTerminalStore((st) => st.bumpWsTreeVersion);
  const wsTreeVersion = useTerminalStore((st) => st.wsTreeVersion);
  const activeWsIdx = useWorkspaceStore((st) => st.activeWorkspaceIdx);
  const workspaces = useWorkspaceStore((st) => st.workspaces);
  const [editingWsIdx, setEditingWsIdx] = useState<number | null>(null);
  const switchTimerRef = useRef<number>(0);
  const explorerOpen = usePanelStore((st) => st.explorerOpen);
  const fullscreen = usePanelStore((st) => st.fullscreen);
  const searchVisible = usePanelStore((st) => st.searchVisible);
  const toggleSearch = usePanelStore((st) => st.toggleSearch);

  const ensureWorkspaceTree = useCallback((wsIdx: number) => {
    if (workspaceTrees.has(wsIdx)) return;
    const ws = useWorkspaceStore.getState().workspaces[wsIdx];
    if (!ws) return;
    let tree;
    if (ws.splitTree) {
      tree = instantiateTree(ws.splitTree);
    } else {
      const panes = ws.panes.length > 0 ? ws.panes : [{ cwd: "", command: "" }];
      tree = panesToTree(panes);
    }
    workspaceTrees.set(wsIdx, tree);
    bumpWsTreeVersion();
  }, [bumpWsTreeVersion]);

  useEffect(() => {
    loadSettings();
    loadWorkspaces();
    getHomeDir().then(setHomeDir);
  }, []);

  useEffect(() => {
    const unsub = useWorkspaceStore.subscribe((state) => {
      if (state.workspaces.length > 0 && !workspaceTrees.has(state.activeWorkspaceIdx)) {
        ensureWorkspaceTree(state.activeWorkspaceIdx);
        unsub();
      }
    });
    const st = useWorkspaceStore.getState();
    if (st.workspaces.length > 0) {
      ensureWorkspaceTree(st.activeWorkspaceIdx);
      unsub();
    }
    return unsub;
  }, []);

  const saveTree = useCallback((wsIdx?: number) => {
    const idx = wsIdx ?? useWorkspaceStore.getState().activeWorkspaceIdx;
    const tree = workspaceTrees.get(idx);
    if (!tree) return;
    const order = getTerminalIdsForWorkspace(idx);
    useWorkspaceStore.getState().saveCurrentSplitTree(tree, order, terminalRefs);
  }, []);

  useEffect(() => {
    const handler = () => {
      for (const [wsIdx] of workspaceTrees) {
        saveTree(wsIdx);
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveTree]);

  const killWorkspaceTerminals = useCallback((wsIdx: number) => {
    const ids = getTerminalIdsForWorkspace(wsIdx);
    ids.forEach((id) => killTerminal(id).catch(() => {}));
    workspaceTrees.delete(wsIdx);
    bumpWsTreeVersion();
  }, [bumpWsTreeVersion]);

  const handleDeleteWorkspace = useCallback((idx: number) => {
    const ids = getTerminalIdsForWorkspace(idx);
    ids.forEach((id) => killTerminal(id).catch(() => {}));
    workspaceTrees.delete(idx);
    const newMap = new Map<number, import("./types").TreeNode>();
    for (const [key, val] of workspaceTrees) {
      newMap.set(key > idx ? key - 1 : key, val);
    }
    workspaceTrees.clear();
    for (const [key, val] of newMap) {
      workspaceTrees.set(key, val);
    }
    useWorkspaceStore.getState().deleteWorkspace(idx);
    bumpWsTreeVersion();
    const remaining = useWorkspaceStore.getState().workspaces;
    if (remaining.length > 0) {
      const newActiveIdx = useWorkspaceStore.getState().activeWorkspaceIdx;
      ensureWorkspaceTree(newActiveIdx);
      const newIds = getTerminalIdsForWorkspace(newActiveIdx);
      if (newIds.length > 0) setFocusedTerminalId(newIds[0]);
    } else {
      setFocusedTerminalId(null);
    }
  }, [bumpWsTreeVersion, ensureWorkspaceTree, setFocusedTerminalId]);

  const handleSwitchWorkspace = useCallback((idx: number) => {
    const current = useWorkspaceStore.getState().activeWorkspaceIdx;
    if (idx === current) return;
    saveTree(current);
    clearTimeout(switchTimerRef.current);
    useWorkspaceStore.getState().setActiveWorkspaceIdx(idx);
    ensureWorkspaceTree(idx);
    setActiveView("terminals");
    const ids = getTerminalIdsForWorkspace(idx);
    if (ids.length > 0) setFocusedTerminalId(ids[0]);
    switchTimerRef.current = window.setTimeout(() => {
      ids.forEach((id) => {
        const ref = terminalRefs.get(id);
        if (ref) {
          ref.fitAddon.fit();
          ref.term.refresh(0, ref.term.rows - 1);
          resizeTerminal(id, ref.term.cols, ref.term.rows).catch(() => {});
        }
      });
    }, 80);
  }, [saveTree, ensureWorkspaceTree, setActiveView, setFocusedTerminalId]);

  const handleSplit = useCallback((id: string, direction: "horizontal" | "vertical") => {
    const wsIdx = useWorkspaceStore.getState().activeWorkspaceIdx;
    const root = workspaceTrees.get(wsIdx);
    if (!root) return;
    const ref = terminalRefs.get(id);
    const currentCwd = ref?.lastDir || ref?.cwd;
    if (currentCwd) {
      function setCwd(node: import("./types").TreeNode): void {
        if (node.type === "leaf" && node.id === id) node._cwd = currentCwd;
        else if (node.type === "split") { setCwd(node.first); setCwd(node.second); }
      }
      setCwd(root);
    }
    const result = splitPaneInTree(root, id, direction);
    if (result) {
      workspaceTrees.set(wsIdx, result.newRoot);
      bumpWsTreeVersion();
      setFocusedTerminalId(result.newLeafId);
      requestAnimationFrame(() => saveTree(wsIdx));
    }
  }, [bumpWsTreeVersion, setFocusedTerminalId, saveTree]);

  const handleClose = useCallback((id: string) => {
    const wsIdx = useWorkspaceStore.getState().activeWorkspaceIdx;
    const root = workspaceTrees.get(wsIdx);
    if (!root) return;
    killTerminal(id).catch(() => {});
    const newRoot = removePaneFromTree(root, id);
    if (newRoot) {
      workspaceTrees.set(wsIdx, newRoot);
      bumpWsTreeVersion();
      const ids = getTerminalIdsForWorkspace(wsIdx);
      if (ids.length > 0) setFocusedTerminalId(ids[0]);
      requestAnimationFrame(() => {
        ids.forEach((tid) => {
          const ref = terminalRefs.get(tid);
          if (ref) ref.fitAddon.fit();
        });
        saveTree(wsIdx);
      });
    } else {
      const ws = useWorkspaceStore.getState().workspaces[wsIdx];
      const freshTree = panesToTree([{ cwd: ws?.panes?.[0]?.cwd || "", command: "" }]);
      workspaceTrees.set(wsIdx, freshTree);
      bumpWsTreeVersion();
      const freshIds = getTerminalIdsForWorkspace(wsIdx);
      if (freshIds.length > 0) setFocusedTerminalId(freshIds[0]);
      requestAnimationFrame(() => saveTree(wsIdx));
    }
  }, [bumpWsTreeVersion, setFocusedTerminalId, saveTree, setActiveView]);

  // Listen for close-pane events from keyboard shortcuts
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (id) handleClose(id);
    };
    window.addEventListener("terminalhub:close-pane", handler);
    return () => window.removeEventListener("terminalhub:close-pane", handler);
  }, [handleClose]);

  const handleTreeUpdate = useCallback(() => {
    terminalRefs.forEach((ref) => {
      ref.fitAddon.fit();
    });
    saveTree(useWorkspaceStore.getState().activeWorkspaceIdx);
  }, [saveTree]);

  const handleEditWorkspace = useCallback((idx: number) => {
    useWorkspaceStore.getState().setActiveWorkspaceIdx(idx);
    setEditingWsIdx(idx);
    setActiveView("workspace-editor");
  }, [setActiveView]);

  const handleNewWorkspace = useCallback(() => {
    const current = useWorkspaceStore.getState().activeWorkspaceIdx;
    saveTree(current);
    const colorIdx = useWorkspaceStore.getState().workspaces.length % 8;
    useWorkspaceStore.getState().addWorkspace({
      name: "Workspace",
      color: colorIdx,
      panes: [{ cwd: "", command: "" }],
    });
    const newIdx = useWorkspaceStore.getState().activeWorkspaceIdx;
    setEditingWsIdx(newIdx);
    setActiveView("workspace-editor");
  }, [saveTree, setActiveView]);

  const handleWorkspaceSaved = useCallback(() => {
    setEditingWsIdx(null);
    const wsIdx = useWorkspaceStore.getState().activeWorkspaceIdx;
    killWorkspaceTerminals(wsIdx);
    ensureWorkspaceTree(wsIdx);
    setActiveView("terminals");
    const ids = getTerminalIdsForWorkspace(wsIdx);
    if (ids.length > 0) setFocusedTerminalId(ids[0]);
  }, [killWorkspaceTerminals, ensureWorkspaceTree, setActiveView, setFocusedTerminalId]);

  const shortcutActions = useMemo(() => ({
    onSplitH: () => {
      const id = useTerminalStore.getState().focusedTerminalId;
      if (id) handleSplit(id, "horizontal");
    },
    onSplitV: () => {
      const id = useTerminalStore.getState().focusedTerminalId;
      if (id) handleSplit(id, "vertical");
    },
    onEditWorkspace: () => {
      const idx = useWorkspaceStore.getState().activeWorkspaceIdx;
      handleEditWorkspace(idx);
    },
    onNewWorkspace: handleNewWorkspace,
  }), [handleSplit, handleEditWorkspace, handleNewWorkspace]);

  useKeyboardShortcuts(shortcutActions);
  usePinchZoom();

  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      if (!url) return;
      const normalized = url.startsWith("http://") || url.startsWith("https://") ? url : "https://" + url;
      useBrowserStore.getState().addTab(normalized);
      usePanelStore.getState().openExplorer("browser");
    };
    window.addEventListener("terminalhub:open-url", handler);
    return () => window.removeEventListener("terminalhub:open-url", handler);
  }, []);

  return (
    <div id="app" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {!fullscreen && <Titlebar
        onSwitchWorkspace={handleSwitchWorkspace}
        onEditWorkspace={handleEditWorkspace}
        onNewWorkspace={handleNewWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
      />}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>
            {activeView === "terminals" && workspaces.map((_, wsIdx) => {
              const tree = workspaceTrees.get(wsIdx);
              if (!tree) return null;
              const isActive = wsIdx === activeWsIdx;
              return (
                <div
                  key={wsIdx}
                  style={{
                    display: isActive ? "flex" : "none",
                    flex: 1,
                    width: "100%",
                    height: "100%",
                    position: isActive ? "relative" : "absolute",
                  }}
                >
                  <SplitContainer
                    node={tree}
                    onSplit={handleSplit}
                    onClose={handleClose}
                    onTreeUpdate={handleTreeUpdate}
                  />
                </div>
              );
            })}
            {activeView === "terminals" && (workspaces.length === 0 || !workspaceTrees.has(activeWsIdx)) && (
              <WorkspaceEditor editIdx={null} onSave={handleWorkspaceSaved} />
            )}
            {activeView === "workspace-editor" && (
              <WorkspaceEditor editIdx={editingWsIdx} onSave={handleWorkspaceSaved} />
            )}
            {searchVisible && <SearchBar onClose={toggleSearch} />}
          </div>
        </div>
        {explorerOpen && <ExplorerPanel />}
      </div>
      <TranslateTooltip />
      <CloseDialog />
    </div>
  );
}
