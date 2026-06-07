export interface TerminalInfo {
  id: string;
  label: string;
}

export interface WorkspaceInfo {
  name: string;
  color: number;
  terminalCount: number;
}

export type ServerMessage =
  | { type: "terminals"; data: TerminalInfo[] }
  | { type: "output"; id: string; data: string }
  | { type: "buffer"; id: string; data: string }
  | { type: "workspaces"; data: WorkspaceInfo[]; activeIdx: number };

export type ClientMessage =
  | { type: "input"; id: string; data: string }
  | { type: "list" }
  | { type: "resize"; id: string; cols: number; rows: number }
  | { type: "list_workspaces" }
  | { type: "switch_workspace"; idx: number }
  | { type: "create_workspace"; name: string; color: number }
  | { type: "delete_workspace"; idx: number };
