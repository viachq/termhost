---
updated: 2026-06-07
tags: [domain, context, competitors]
related: [[overview]]
---
# Similar Projects & Inspiration

## BridgeMind / BridgeSpace
Primary inspiration. Десктопний workspace для оркестрації до 16 AI агентів паралельно. Paid ($20-80/mo, no free tier) — тому будуємо своє.

Key features worth noting:
- **BridgeMemory** — граф знань в `.bridgememory/`, markdown + wikilinks, 12 MCP інструментів, force-directed graph view
- **BridgeSwarm** — мульти-агент оркестрація з ролями (builder, reviewer, scout, coordinator)
- **BridgeVoice** — голосове керування
- Kanban дошки, інтегрований редактор
- Платформи: macOS, Windows, Linux

## cmux
Free, open-source, macOS only. Нативний Swift + libghostty (GPU-рендеринг). 18.8k GitHub stars.

Key features:
- Вертикальні таби з git-branch і портами
- **Notification rings** — підсвічує коли агент потребує уваги
- Вбудований скриптований браузер
- CLI + Unix socket API
- Працює з будь-яким CLI агентом (Claude Code, Codex, Gemini CLI...)

## wmux
Free, open-source, Windows only. Порт cmux на ConPTY + Electron.

Key features:
- **Session persistence** — PTY живуть після закриття вікна (як tmux server)
- **Smart notifications** — слідкує за throughput, toast коли агент замовк
- **MCP сервер** — Claude Code може читати вивід терміналу і керувати браузером
- **A2A** (agent-to-agent) комунікація через MCP
- Без WSL

## Порівняння з TerminalHub

| Фіча | TerminalHub | BridgeSpace | cmux | wmux |
|-------|------------|-------------|------|------|
| Split panes | + | + | + | + |
| Workspaces | + | + | + (таби) | + |
| File browser/editor | + | + | - | - |
| Memory system | + (.memory/) | + (BridgeMemory) | - | - |
| Мульти-агент оркестрація | - | + (Swarm) | - | - |
| Session persistence | - | ? | - | + |
| Smart notifications | частково | + | + (rings) | + (toast) |
| Вбудований браузер | - | - | + | + |
| MCP інтеграція | - | + (12 tools) | + | + |
| Mobile access | + (WebSocket) | - | - | - |
| Платформа | Windows (Tauri) | All | macOS | Windows |
| Ціна | Free | $20-80/mo | Free | Free |

## Унікальне в TerminalHub
- Мобільний доступ через WebSocket
- Файловий браузер з Monaco editor + Markdown рендеринг
- Tauri (cross-platform потенціал)

## Що варто запозичити
- Session persistence (wmux) — PTY живе після закриття вікна
- Smart notifications (wmux/cmux) — "агент замовк" замість простого activity marker
- MCP сервер (wmux) — агенти читають вивід інших терміналів
- A2A комунікація (wmux) — агенти спілкуються між собою
- BridgeMemory MCP (BridgeSpace) — пам'ять через MCP, не тільки файли
