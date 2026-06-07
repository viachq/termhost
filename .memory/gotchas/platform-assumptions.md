---
updated: 2026-06-07
tags: [gotchas, platform, windows]
related: [[overview]]
---
# Platform Assumptions

- Shell hardcoded to `powershell.exe` in `pty_manager.rs` with flags `-NoProfile -NoLogo` — [?] intentional or not implemented yet?
- Home dir: `dirs::home_dir()` fallback `C:\`
- WS server IP detection: `UdpSocket::connect("8.8.8.8:80")` — may fail behind VPN/firewall
- Monaco worker path: relative to `import.meta.url`
- Markdown images: Obsidian-style `![[image.png]]` resolved via `convertFileSrc()`
- Some Windows `\\` separators hardcoded — [?] cross-platform a goal?
