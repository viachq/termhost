export interface TerminalInfo {
  id: string;
  label: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface WorkspaceInfo {
  name: string;
  color: number;
  terminalCount: number;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  modified?: number;
  total_bytes?: number;
  free_bytes?: number;
}

export type ServerMessage =
  | { type: "terminals"; data: TerminalInfo[] }
  | { type: "output"; id: string; data: string }
  | { type: "buffer"; id: string; data: string }
  | { type: "screen"; id: string; data: string }
  | { type: "screen_size"; width: number; height: number }
  | { type: "workspaces"; data: WorkspaceInfo[]; activeIdx: number }
  | { type: "resize"; id: string; cols: number; rows: number }
  | { type: "resize_rejected"; id: string }
  | { type: "clipboard_ok"; ok: boolean; image?: boolean }
  | { type: "pong"; ts: number };

export type ClientMessage =
  | { type: "input"; id: string; data: string }
  | { type: "get_buffer"; id: string }
  | { type: "get_screen"; id: string }
  | { type: "list" }
  | { type: "resize"; id: string; cols: number; rows: number; claim?: boolean }
  | { type: "list_workspaces" }
  | { type: "switch_workspace"; idx: number }
  | { type: "create_workspace"; name: string; color: number }
  | { type: "delete_workspace"; idx: number }
  | { type: "spawn"; wsIdx: number; cwd?: string; shell?: string }
  | { type: "clipboard"; data: string }
  | { type: "clipboard_image"; name: string; data: string }
  | { type: "ping"; ts: number }
  | { type: "type_global"; text: string }
  | { type: "key_global"; key: string }
  | { type: "kill"; id: string }
  | { type: "inject_file"; id: string; path: string }
  | { type: "screen_stream"; action: "start" | "stop" }
  | { type: "mouse_move"; x: number; y: number }
  | { type: "mouse_down"; button: "left" | "right" }
  | { type: "mouse_up"; button: "left" | "right" };

export type MobileTab = "terminal" | "clipboard" | "files" | "screen";

export interface ToolbarKey {
  id: string;
  label: string;
  data: string;
  accent?: boolean;
}

export type ToolbarPreset = "essential" | "full" | "minimal" | "custom";

export const TOOLBAR_PRESETS: Record<ToolbarPreset, ToolbarKey[]> = {
  essential: [
    { id: "esc", label: "Esc", data: "\x1b" },
    { id: "ctrl-c", label: "^C", data: "\x03", accent: true },
    { id: "tab", label: "Tab", data: "\t" },
    { id: "shift-tab", label: "⇧Tab", data: "\x1b[Z" },
    { id: "up", label: "↑", data: "\x1b[A" },
    { id: "down", label: "↓", data: "\x1b[B" },
    { id: "left", label: "←", data: "\x1b[D" },
    { id: "right", label: "→", data: "\x1b[C" },
    { id: "enter", label: "⏎", data: "\r" },
  ],
  full: [
    { id: "esc", label: "Esc", data: "\x1b" },
    { id: "ctrl-c", label: "^C", data: "\x03", accent: true },
    { id: "ctrl-d", label: "^D", data: "\x04" },
    { id: "ctrl-z", label: "^Z", data: "\x1a" },
    { id: "tab", label: "Tab", data: "\t" },
    { id: "shift-tab", label: "⇧Tab", data: "\x1b[Z" },
    { id: "ctrl-r", label: "^R", data: "\x12" },
    { id: "ctrl-l", label: "^L", data: "\x0c" },
    { id: "ctrl-a", label: "^A", data: "\x01" },
    { id: "ctrl-e", label: "^E", data: "\x05" },
    { id: "up", label: "↑", data: "\x1b[A" },
    { id: "down", label: "↓", data: "\x1b[B" },
    { id: "left", label: "←", data: "\x1b[D" },
    { id: "right", label: "→", data: "\x1b[C" },
    { id: "home", label: "Home", data: "\x1b[H" },
    { id: "end", label: "End", data: "\x1b[F" },
    { id: "enter", label: "⏎", data: "\r" },
  ],
  minimal: [
    { id: "esc", label: "Esc", data: "\x1b" },
    { id: "ctrl-c", label: "^C", data: "\x03", accent: true },
    { id: "tab", label: "Tab", data: "\t" },
    { id: "arrows", label: "⬄", data: "" },
    { id: "enter", label: "⏎", data: "\r" },
  ],
  custom: [],
};

const STORAGE_KEY = "th-toolbar-keys";
const PRESET_KEY = "th-toolbar-preset";

export function loadToolbarKeys(): { preset: ToolbarPreset; keys: ToolbarKey[] } {
  const saved = localStorage.getItem(PRESET_KEY);
  const preset: ToolbarPreset = (saved as ToolbarPreset) || "essential";
  if (preset !== "custom") {
    return { preset, keys: TOOLBAR_PRESETS[preset] };
  }
  const customRaw = localStorage.getItem(STORAGE_KEY);
  if (customRaw) {
    try {
      return { preset: "custom", keys: JSON.parse(customRaw) as ToolbarKey[] };
    } catch {}
  }
  return { preset: "essential", keys: TOOLBAR_PRESETS.essential };
}

export function saveToolbarKeys(keys: ToolbarKey[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  localStorage.setItem(PRESET_KEY, "custom");
}

export function saveToolbarPreset(preset: ToolbarPreset) {
  localStorage.setItem(PRESET_KEY, preset);
}

export function getDefaultArrowsKey(): ToolbarKey {
  return { id: "arrows", label: "⬄", data: "", accent: true };
}
