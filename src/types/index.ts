import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";

export interface LeafNode {
  type: "leaf";
  id: string;
  _cwd?: string;
  _command?: string;
}

export interface SplitNode {
  type: "split";
  direction: "horizontal" | "vertical";
  ratio: number;
  first: TreeNode;
  second: TreeNode;
}

export type TreeNode = LeafNode | SplitNode;

export interface LeafConfig {
  type: "leaf";
  id?: string;
  cwd: string;
  command: string;
}

export interface SplitConfig {
  type: "split";
  direction: "horizontal" | "vertical";
  ratio: number;
  first: TreeConfig;
  second: TreeConfig;
}

export type TreeConfig = LeafConfig | SplitConfig;

export interface PaneConfig {
  cwd: string;
  command: string;
}

export interface Workspace {
  name: string;
  color: number;
  panes: PaneConfig[];
  splitTree?: TreeConfig | null;
}

export interface TerminalRef {
  term: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  unlisten: () => void;
  resizeObserver: ResizeObserver | null;
  command: string;
  cwd: string;
  title: string;
  lastDir: string;
  lastActiveAt: number;
  bufferTrimmed: boolean;
  commandMarks: number[]; // buffer line positions of command starts (OSC 133 A)
}

export interface FileTab {
  id: string;
  path: string;
  name: string;
  ext: string;
  isMd: boolean;
  isImage: boolean;
  content: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
}

export type CursorStyle = "block" | "bar" | "underline";
export type UiTheme = "dark" | "light" | "daylight";
export type ActiveView = "terminals" | "workspace-editor";
