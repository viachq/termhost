---
updated: 2026-07-02
tags: [architecture, android, mobile, daemon]
---

# Android App

Native Android app that wraps `termhostd` in a Foreground Service + WebView.

## Architecture

```
┌─────────────────────────────────────┐
│          Android App (Kotlin)        │
│  ┌──────────────────────────────┐   │
│  │  DaemonService               │   │
│  │  (Foreground Service)        │   │
│  │  - extracts termhostd binary │   │
│  │  - launches as subprocess    │   │
│  │  - persistent notification   │   │
│  └──────────┬───────────────────┘   │
│  ┌──────────┴───────────────────┐   │
│  │  MainActivity                │   │
│  │  - WebView → localhost:9090  │   │
│  │  - starts/restarts service   │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
             │
             ▼ port 9090
┌─────────────────────────────────────┐
│   termhostd-android (Rust binary)    │
│   - warp HTTP/WS server              │
│   - portable-pty PTY management      │
│   - serves mobile.html               │
└─────────────────────────────────────┘
```

## Key differences from Windows daemon

| Feature | Windows | Android |
|---------|---------|---------|
| PTY backend | pty-host split via named pipe | Direct PTY management (inline) |
| Shell | PowerShell / cmd via ConPTY | bash/sh via Unix PTY |
| IPC to app | Named pipe (tokio) | Not needed (same process) |
| WS server | warp on 0.0.0.0:9090 | warp on 0.0.0.0:9090 |
| Tray icon | tray-icon crate | Android notification (Foreground Service) |
| HID injection | SendInput winapi | Not available |
| Mobile HTML | Loaded at runtime from dist-mobile/ | Embedded via `include_str!` |

## Files

- `android/` — Android project (Gradle + Kotlin)
- `daemon/src/android_main.rs` — Android daemon binary entry
- `daemon/Cargo.toml` — binary target `termhostd-android`

## Build

See `android/BUILD.md`.

## Limitations

- No clipboard sync (`arboard` needs display server on Linux)
- No HID injection (no SendInput on Android)
- Terminal CWD set on spawn only (no OSC 7 tracking)
- No sleep blocker (Android doze may interrupt long-running tasks)
