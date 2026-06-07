import type { PaneConfig } from "../types";

export interface CommandPreset {
  label: string;
  cmd: string;
}

export const COMMAND_PRESETS: CommandPreset[] = [
  { label: "Claude Code", cmd: "claude --dangerously-skip-permissions" },
  { label: "Codex", cmd: "codex --yolo" },
];

export interface WorkspaceTemplate {
  name: string;
  icon: string;
  desc: string;
  panes: PaneConfig[];
}

export const WS_TEMPLATES: WorkspaceTemplate[] = [
  {
    name: "Single Shell",
    icon: ">_",
    desc: "One terminal pane",
    panes: [{ cwd: "", command: "" }],
  },
  {
    name: "Dual Claude",
    icon: "CC",
    desc: "Two Claude Code agents",
    panes: [
      { cwd: "", command: "claude --dangerously-skip-permissions" },
      { cwd: "", command: "claude --dangerously-skip-permissions" },
    ],
  },
  {
    name: "Claude + Codex",
    icon: "C+",
    desc: "Claude Code + OpenAI Codex",
    panes: [
      { cwd: "", command: "claude --dangerously-skip-permissions" },
      { cwd: "", command: "codex --yolo" },
    ],
  },
  {
    name: "Dev Server + Shell",
    icon: "DS",
    desc: "Dev server alongside a shell",
    panes: [
      { cwd: "", command: "npm run dev" },
      { cwd: "", command: "" },
    ],
  },
  {
    name: "4x Shell",
    icon: "4×",
    desc: "Four terminal panes",
    panes: [
      { cwd: "", command: "" },
      { cwd: "", command: "" },
      { cwd: "", command: "" },
      { cwd: "", command: "" },
    ],
  },
  {
    name: "4x Claude",
    icon: "4C",
    desc: "Four Claude Code agents",
    panes: [
      { cwd: "", command: "claude --dangerously-skip-permissions" },
      { cwd: "", command: "claude --dangerously-skip-permissions" },
      { cwd: "", command: "claude --dangerously-skip-permissions" },
      { cwd: "", command: "claude --dangerously-skip-permissions" },
    ],
  },
];
