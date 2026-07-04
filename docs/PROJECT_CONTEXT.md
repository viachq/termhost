# Termhost

## Project Summary

`Agent Workspace` is a lightweight desktop application for running and managing multiple AI coding terminals in one place.

The core idea is simple:

- one window
- multiple terminal panes
- named workspaces
- named panes
- saved templates
- startup automation

Instead of switching between many separate terminal windows and tabs, the app should let the user open a predefined workspace and immediately get a ready-to-use multi-agent setup.

Example:

- 4 panes
- 4 different project directories
- each pane auto-runs `claude --dangerously-skip-permissions`

So with one action, the full working environment is already running.

## Why This Exists

The current pain point is not that Windows Terminal is unusable. It is usable.

The problem is that:

- it has many features the user does not need
- the workflow is more generic than agent-focused
- opening the same terminal setup repeatedly is annoying
- switching between separate windows and tabs wastes time
- there is no dedicated workspace abstraction for AI-agent sessions

The goal is not to build "another terminal emulator for everyone".

The goal is to build a focused tool for one specific workflow:

- AI coding sessions
- multiple concurrent terminal agents
- repeatable workspace templates
- minimal friction

## Product Vision

The app should feel like a fast command center for agent-based development.

It should be:

- lighter than a full IDE
- more structured than a generic terminal
- more customizable than Windows Terminal for this specific use case
- fast to open
- fast to restore
- easy to understand

The ideal result is:

- open app
- choose workspace template
- all panes appear
- each pane goes to the correct directory
- each pane runs the correct startup commands automatically

No repeated manual bootstrapping.

## Main User Need

The user wants:

- several terminals on one screen
- custom pane names
- multiple named workspaces
- different workspace layouts
- reusable templates
- automatic command execution when a workspace starts
- a setup optimized for Claude Code, Codex, translator tools, and project shells

The user may also want:

- custom buttons or actions for translator integration
- one-click launchers for common workflows
- saved layouts by project type

## Core Use Cases

### 1. Claude Swarm Workspace

A workspace launches:

- `barbershop` pane in `C:\Users\viach\Desktop\barbershop`
- `translate` pane in `C:\Users\viach\Desktop\translate`
- `youtube` pane in `C:\Users\viach\Desktop\youtube`
- `obsidian` pane in `C:\Users\viach\Desktop\obsidian-workspace`

Each pane auto-runs:

```powershell
claude --dangerously-skip-permissions
```

### 2. Mixed Agent Workspace

A workspace launches:

- one pane for Claude
- one pane for Codex
- one pane for translator-related shell commands
- one plain shell pane

### 3. Custom Project Workspace

The user manually creates a workspace, edits pane titles, sets directories, adds startup commands, and saves it as a reusable template.

### 4. Translator Shortcut Workflow

The user wants a fast way to open or trigger a translator-related workflow without extra manual navigation.

This may later be implemented as:

- a dedicated translator pane preset
- a custom action button
- a launcher command
- integration with a local translator executable or script

## Product Principles

### Focused

Only build features that improve the multi-agent terminal workflow.

### Fast

Startup, layout restore, and pane launch should feel immediate.

### Repeatable

Common setups must be saved as templates and launched again without reconfiguration.

### Minimal

No unnecessary generic terminal features unless they directly improve the core workflow.

### Practical

This is not intended to be a general-purpose terminal competitor first. It is a tool for a specific workflow.

## What The App Is

The app is:

- a desktop shell around multiple terminal panes
- a workspace and template manager
- a launcher for project-specific terminal automation

The app is not:

- a terminal emulator built from scratch
- a full IDE
- a code editor platform
- a universal terminal replacement for all users

## Technical Direction

## Current Stack

Current stack:

- **Desktop:** Tauri v2 + Rust
- **Backend:** Rust daemon (termhostd) — portable-pty + warp HTTP/WS
- **Frontend:** React 19, TypeScript, Vite, xterm.js (WebGL), Monaco, Zustand
- **Mobile:** React + xterm.js PWA served by daemon
- **IPC:** named pipes (app ↔ daemon), WebSocket (clients ↔ daemon)
- **State:** Zustand stores
- **Styling:** CSS Modules + Tailwind CSS v4

## Future Stack Option

Possible future migration:

- `Tauri v2`
- frontend UI
- `xterm.js`
- Rust backend
- Windows `ConPTY`

Reason:

- lower resource usage
- more native-feeling runtime
- potentially lighter and cleaner production app

But this is a future optimization path, not the current fastest route.

## Speed Philosophy

The app should be faster than Windows Terminal in the ways that matter for this use case:

- less UI clutter
- less feature overhead
- faster workspace launch
- less setup repetition
- fewer clicks

Important clarification:

This app will not make Claude, Codex, shell commands, or git operations inherently faster.

What it should improve is workflow speed:

- launch speed
- context switching speed
- session organization
- repeated setup removal

## Architecture Overview

### Desktop Shell

Tauri window hosts the UI and talks to the daemon via named pipe IPC.

### Terminal Backend

Rust `portable-pty` spawns real shell processes via Windows ConPTY.

Each pane is backed by its own PTY session owned by the daemon (termhostd), not the UI window.

### Terminal Frontend

`xterm.js` renders the terminal UI inside each pane with WebGL GPU acceleration.

### Remote Access

The daemon runs a warp HTTP/WS server on :9090 serving a PWA for mobile access.

### Workspace Model

A workspace contains:

- workspace id
- workspace name
- description
- number of columns
- start mode
- panes

### Pane Model

A pane contains:

- pane id
- pane title
- current working directory
- startup commands

### Template Model

A template contains:

- saved workspace structure
- pane definitions
- layout settings
- startup behavior

## Current MVP Status

Implemented now:

- Electron desktop shell
- PTY-backed terminal sessions
- `xterm.js` panes
- workspace tabs
- editable workspace name
- editable pane title
- editable pane directory
- editable startup commands
- restart pane action
- default templates
- custom template saving
- auto-run startup commands when pane starts
- dev mode that avoids fixed-port conflicts

## Next Features To Build

### High Priority

- add pane
- remove pane
- duplicate pane
- save full workspace instances
- reopen last session
- edit workspace description
- better template management UI

### Medium Priority

- drag-and-resize panes
- custom layout presets beyond fixed column counts
- pane color tags
- workspace search
- keyboard shortcuts for pane focus
- rerun startup commands separately from full pane restart

### Translator Integration

Planned possible forms:

- translator button in toolbar
- translator workspace preset
- launch local translator script or executable
- clipboard-based integration
- custom command/action runner

### Agent-Focused Features

- one-click Claude workspace preset
- one-click Codex workspace preset
- mixed Claude/Codex templates
- project-specific startup bundles
- optional "safe startup delays" between commands

### Longer-Term Ideas

- session snapshots
- workspace export/import
- command history per pane
- lightweight logs panel
- project notes panel
- button actions per pane
- quick action palette
- worktree-aware templates

## Example Desired Workflow

User flow:

1. Open `Agent Workspace`
2. Choose `Claude desktop swarm`
3. App opens 4 panes
4. Each pane starts in its configured folder
5. Each pane runs its startup command
6. User begins work immediately

Desired result:

- no tab hunting
- no repeated `cd`
- no repeated command typing
- no rebuilding the same environment manually

## UX Direction

The UI should feel:

- dark
- clean
- compact
- intentional
- optimized for dense work

It should avoid:

- excessive chrome
- unnecessary toggles
- enterprise dashboard bloat
- editor-level complexity

The app should make the terminal panes the center of attention.

## Non-Goals For Now

Do not build these early:

- full text editor
- plugin marketplace
- remote sync platform
- cloud account system
- team collaboration layer
- full terminal emulator from scratch

These would slow down the core product unnecessarily.

## Main Product Bet

The product bet is:

People working with AI coding agents repeatedly launch the same multi-terminal setups.

If those setups can be turned into named workspaces and templates, the app removes enough friction to be valuable even if it does only a small number of things.

That is the core thesis.

## Current Project Folder

Project root:

`C:\Users\viach\Desktop\agent-workspace`

## Source Of Truth

This file is intended to be the main project context file.

When the product direction changes, update this file first so the project always has one clear written definition of:

- what the app is
- why it exists
- what the user wants
- what is implemented
- what comes next
