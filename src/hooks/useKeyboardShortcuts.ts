import { useEffect } from "react";
import { useTerminalStore, terminalRefs } from "../store/terminalStore";
import { usePanelStore } from "../store/panelStore";
import { useSettingsStore } from "../store/settingsStore";
import { useFileViewerStore } from "../store/fileViewerStore";

interface ShortcutActions {
  onSplitH: () => void;
  onSplitV: () => void;
  onEditWorkspace: () => void;
  onNewWorkspace: () => void;
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape — exit rearrange mode
      if (e.key === "Escape" && useTerminalStore.getState().rearrangeMode) {
        e.preventDefault();
        useTerminalStore.getState().toggleRearrangeMode();
        return;
      }
      // F11 — toggle fullscreen (no modifier needed)
      if (e.key === "F11") {
        e.preventDefault();
        e.stopImmediatePropagation();
        usePanelStore.getState().toggleFullscreen();
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const key = e.key.toLowerCase();

      // Ctrl+F — open our terminal search (stopImmediatePropagation prevents it reaching xterm)
      if (key === "f" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const focusedId = useTerminalStore.getState().focusedTerminalId;
        if (focusedId) {
          window.dispatchEvent(new CustomEvent("agentworkspace:terminal-search", { detail: focusedId }));
        }
        return;
      }

      // Ctrl+Shift+H — split horizontal
      if (key === "h" && e.shiftKey) {
        e.preventDefault();
        actions.onSplitH();
        return;
      }
      // Ctrl+Shift+J — split vertical
      if (key === "j" && e.shiftKey) {
        e.preventDefault();
        actions.onSplitV();
        return;
      }
      // Ctrl+Shift+R — rearrange mode
      if (key === "r" && e.shiftKey) {
        e.preventDefault();
        useTerminalStore.getState().toggleRearrangeMode();
        return;
      }
      // Ctrl+Shift+M — toggle zoom
      if (key === "m" && e.shiftKey) {
        e.preventDefault();
        const focusedId = useTerminalStore.getState().focusedTerminalId;
        if (focusedId) useTerminalStore.getState().toggleZoom(focusedId);
        return;
      }
      // Ctrl+Alt+Arrow — navigate focus
      if (e.altKey && key.startsWith("arrow")) {
        e.preventDefault();
        navigateFocus(key.replace("arrow", "").toLowerCase() as "left" | "right" | "up" | "down");
        return;
      }
      // Ctrl+Up/Down — navigate between commands (OSC 133 marks)
      if (!e.altKey && !e.shiftKey && (key === "arrowup" || key === "arrowdown")) {
        const focusedId = useTerminalStore.getState().focusedTerminalId;
        if (focusedId) {
          const ref = terminalRefs.get(focusedId);
          if (ref && ref.commandMarks.length > 0) {
            e.preventDefault();
            navigateCommands(ref, key === "arrowup" ? "up" : "down");
            return;
          }
        }
      }
      // Ctrl+T — edit workspace
      if (key === "t" && !e.shiftKey) {
        e.preventDefault();
        actions.onEditWorkspace();
        return;
      }
      // Ctrl+Shift+T — new workspace
      if (key === "t" && e.shiftKey) {
        e.preventDefault();
        actions.onNewWorkspace();
        return;
      }
      // Ctrl+W — close tab or pane
      if (key === "w") {
        e.preventDefault();
        const { fileTabs, activeTabId, closeTab } = useFileViewerStore.getState();
        if (fileTabs.length > 0 && activeTabId) {
          closeTab(activeTabId);
        } else {
          const focusedId = useTerminalStore.getState().focusedTerminalId;
          if (focusedId) {
            // Close will be handled by App — dispatch via custom event
            window.dispatchEvent(new CustomEvent("agentworkspace:close-pane", { detail: focusedId }));
          }
        }
        return;
      }
      // Ctrl+Tab / Ctrl+Shift+Tab — cycle terminals
      if (key === "tab") {
        e.preventDefault();
        const { terminalOrder, focusedTerminalId, setFocusedTerminalId } = useTerminalStore.getState();
        if (terminalOrder.length === 0) return;
        const currentIdx = focusedTerminalId ? terminalOrder.indexOf(focusedTerminalId) : -1;
        const dir = e.shiftKey ? -1 : 1;
        const nextIdx = (currentIdx + dir + terminalOrder.length) % terminalOrder.length;
        const nextId = terminalOrder[nextIdx];
        setFocusedTerminalId(nextId);
        terminalRefs.get(nextId)?.term.focus();
        return;
      }
      // Ctrl+1-9 — jump to terminal
      if (key >= "1" && key <= "9") {
        e.preventDefault();
        const { terminalOrder, setFocusedTerminalId } = useTerminalStore.getState();
        const idx = parseInt(key) - 1;
        if (idx < terminalOrder.length) {
          const id = terminalOrder[idx];
          setFocusedTerminalId(id);
          terminalRefs.get(id)?.term.focus();
        }
        return;
      }
      // Ctrl+` — show terminals
      if (key === "`") {
        e.preventDefault();
        usePanelStore.getState().showTerminals();
        return;
      }
      // Ctrl+B — toggle files
      if (key === "b") {
        e.preventDefault();
        usePanelStore.getState().toggleExplorer("files");
        return;
      }
      // Ctrl+, — toggle settings
      if (key === ",") {
        e.preventDefault();
        usePanelStore.getState().toggleExplorer("settings");
        return;
      }
      // Ctrl+Shift+F — toggle search
      if (key === "f" && e.shiftKey) {
        e.preventDefault();
        usePanelStore.getState().toggleSearch();
        return;
      }
      // Ctrl+= / Ctrl+- / Ctrl+0 — zoom
      if (key === "=" || key === "+") {
        e.preventDefault();
        const s = useSettingsStore.getState();
        s.setTermFontSize(s.termFontSize + 1);
        return;
      }
      if (key === "-") {
        e.preventDefault();
        const s = useSettingsStore.getState();
        s.setTermFontSize(s.termFontSize - 1);
        return;
      }
      if (key === "0") {
        e.preventDefault();
        useSettingsStore.getState().setTermFontSize(14);
        return;
      }
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [actions]);
}

function navigateFocus(direction: "left" | "right" | "up" | "down") {
  const { focusedTerminalId, terminalOrder, setFocusedTerminalId } = useTerminalStore.getState();
  if (!focusedTerminalId || terminalOrder.length <= 1) return;

  const currentEl = document.querySelector(`[data-pane-id="${focusedTerminalId}"]`);
  if (!currentEl) return;
  const currentRect = currentEl.getBoundingClientRect();
  const cx = currentRect.left + currentRect.width / 2;
  const cy = currentRect.top + currentRect.height / 2;

  let bestId: string | null = null;
  let bestDist = Infinity;

  for (const id of terminalOrder) {
    if (id === focusedTerminalId) continue;
    const el = document.querySelector(`[data-pane-id="${id}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const px = rect.left + rect.width / 2;
    const py = rect.top + rect.height / 2;
    const dx = px - cx;
    const dy = py - cy;

    let valid = false;
    if (direction === "left" && dx < -10) valid = true;
    if (direction === "right" && dx > 10) valid = true;
    if (direction === "up" && dy < -10) valid = true;
    if (direction === "down" && dy > 10) valid = true;

    if (valid) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
  }

  if (bestId) {
    setFocusedTerminalId(bestId);
    terminalRefs.get(bestId)?.term.focus();
  }
}

function navigateCommands(ref: import("../types").TerminalRef, direction: "up" | "down") {
  const { term, commandMarks } = ref;
  if (commandMarks.length === 0) return;

  const viewportY = term.buffer.active.viewportY;
  const baseY = term.buffer.active.baseY;

  if (direction === "up") {
    for (let i = commandMarks.length - 1; i >= 0; i--) {
      const markViewport = commandMarks[i] - baseY;
      if (markViewport < viewportY - 1) {
        term.scrollLines(markViewport - viewportY);
        return;
      }
    }
    // Already above all marks — go to first
    term.scrollLines((commandMarks[0] - baseY) - viewportY);
  } else {
    for (let i = 0; i < commandMarks.length; i++) {
      const markViewport = commandMarks[i] - baseY;
      if (markViewport > viewportY + 1) {
        term.scrollLines(markViewport - viewportY);
        return;
      }
    }
    term.scrollToBottom();
  }
}
