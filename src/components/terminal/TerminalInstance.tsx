import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "../../store/settingsStore";
import { useTerminalStore, terminalRefs } from "../../store/terminalStore";
import { useFileViewerStore } from "../../store/fileViewerStore";
import { spawnTerminal, writeTerminal, resizeTerminal, hasTerminal, getTerminalBuffer } from "../../hooks/useTauriIpc";
import s from "./Terminal.module.css";

const FILE_PATH_RE = /(?:\.{0,2}[/\\])(?:[a-zA-Z0-9_@.+-]+[/\\])*[a-zA-Z0-9_@.+-]+\.[a-zA-Z]{1,10}(?::(\d+)(?::(\d+))?)?/g;

interface Props {
  id: string;
  cwd?: string;
  command?: string;
  onFocus: () => void;
}

export default function TerminalInstance({ id, cwd, command, onFocus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let killed = false;
    let webglAddon: WebglAddon | null = null;
    let unlistenFn: (() => void) | null = null;
    let resizeTimeout: number;
    let webglRetries = 0;

    const settings = useSettingsStore.getState();
    const term = new Terminal({
      fontFamily: settings.termFontFamily,
      fontSize: settings.termFontSize,
      theme: settings.getXtermTheme(),
      cursorStyle: settings.termCursorStyle,
      cursorBlink: false,
      minimumContrastRatio: 4.5,
      allowProposedApi: true,
      scrollback: 50000,
      fastScrollModifier: "shift",
      fastScrollSensitivity: 5,
      scrollOnUserInput: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon((_, uri) => {
      window.dispatchEvent(new CustomEvent("agentworkspace:open-url", { detail: uri }));
    }));
    term.loadAddon(searchAddon);
    const unicodeAddon = new Unicode11Addon();
    term.loadAddon(unicodeAddon);
    term.unicode.activeVersion = "11";

    term.open(el);

    const paneEl = el.closest("[data-pane-id]") as HTMLElement | null;
    const themeBg = settings.getXtermTheme().background;
    if (themeBg) {
      el.style.background = themeBg;
      if (paneEl) paneEl.style.background = themeBg;
    }

    function tryLoadWebgl() {
      if (killed || webglAddon || webglRetries >= 3) return;
      webglRetries++;
      try {
        const addon = new WebglAddon();
        addon.onContextLoss(() => {
          try { addon.dispose(); } catch {}
          webglAddon = null;
          if (!killed) setTimeout(tryLoadWebgl, 500);
        });
        term.loadAddon(addon);
        webglAddon = addon;
      } catch {
        webglAddon = null;
      }
    }

    tryLoadWebgl();

    term.attachCustomKeyEventHandler((ev) => {
      if (ev.ctrlKey && ev.code === "KeyC" && term.hasSelection()) {
        if (ev.type === "keydown") {
          const sel = term.getSelection();
          navigator.clipboard.writeText(sel);
          window.dispatchEvent(new CustomEvent("agentworkspace:terminal-copy", { detail: sel }));
          term.clearSelection();
        }
        return false;
      }
      if (ev.ctrlKey && ev.code === "KeyV") {
        if (ev.type === "keydown") {
          ev.preventDefault();
          navigator.clipboard.readText().then((text) => {
            if (!text) return;
            // Normalize line endings: \r\n and \n → \r (what PTY expects)
            // Preserve trailing spaces and indentation exactly as copied
            const normalized = text
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n")
              .replace(/\n/g, "\r");
            term.paste(normalized);
          });
        }
        return false;
      }
      if (ev.ctrlKey && !ev.shiftKey && ev.code === "KeyF") {
        if (ev.type === "keydown") {
          window.dispatchEvent(
            new CustomEvent("agentworkspace:terminal-search", { detail: id })
          );
        }
        return false;
      }
      if (ev.ctrlKey && ev.altKey && ev.key.startsWith("Arrow")) return false;
      return true;
    });

    term.registerLinkProvider({
      provideLinks(lineNumber, callback) {
        const line = term.buffer.active.getLine(lineNumber - 1);
        if (!line) { callback(undefined); return; }
        const text = line.translateToString();
        const links: any[] = [];
        FILE_PATH_RE.lastIndex = 0;
        let match;
        while ((match = FILE_PATH_RE.exec(text)) !== null) {
          const startCol = match.index + 1;
          const endCol = match.index + match[0].length;
          const fullMatch = match[0];
          links.push({
            range: {
              start: { x: startCol, y: lineNumber },
              end: { x: endCol, y: lineNumber },
            },
            text: fullMatch,
            activate() {
              const parts = fullMatch.split(":");
              const filePath = parts[0];
              const ref = terminalRefs.get(id);
              const cwd = ref?.lastDir || ref?.cwd || "";
              const isAbsolute = /^[A-Z]:[/\\]/i.test(filePath) || filePath.startsWith("/");
              const absPath = isAbsolute
                ? filePath
                : cwd
                  ? `${cwd.replace(/[/\\]$/, "")}${cwd.includes("\\") ? "\\" : "/"}${filePath}`
                  : filePath;
              const normalized = absPath.replace(/\//g, "\\");
              useFileViewerStore.getState().openFile(normalized);
            },
          });
        }
        callback(links.length > 0 ? links : undefined);
      },
    });

    const setup = async () => {
      try {
        unlistenFn = await listen<string>(`pty-data-${id}`, (event) => {
          if (killed) return;
          term.write(event.payload);
        });

        if (killed) {
          unlistenFn();
          return;
        }

        // Fit before spawn so PTY gets the correct initial size
        try { fitAddon.fit(); } catch {}
        const cols = term.cols > 0 ? term.cols : 80;
        const rows = term.rows > 0 ? term.rows : 24;

        const exists = await hasTerminal(id);
        if (exists) {
          try {
            const buffer = await getTerminalBuffer(id);
            if (buffer) {
              el.style.visibility = "hidden";
              await new Promise<void>((resolve) => {
                term.write(buffer, resolve);
              });
              el.style.visibility = "";
            }
          } catch {}
          resizeTerminal(id, cols, rows).catch(() => {});
        } else {
          await spawnTerminal(id, cwd, command, cols, rows);
        }

        // Second fit after DOM settles to catch any WebGL/layout discrepancy
        setTimeout(() => {
          if (killed) return;
          try {
            fitAddon.fit();
            if (term.cols > 0 && term.rows > 0 && (term.cols !== cols || term.rows !== rows)) {
              resizeTerminal(id, term.cols, term.rows).catch(() => {});
            }
          } catch {}
        }, 100);
      } catch {}
    };

    setup();

    term.onData((data) => {
      if (!killed) writeTerminal(id, data);
    });

    term.onTitleChange((title) => {
      if (killed) return;
      const ref = terminalRefs.get(id);
      if (ref) {
        ref.title = title;
        if (/^[A-Z]:\\/i.test(title) || title.startsWith("/")) {
          ref.lastDir = title;
        }
      }
      useTerminalStore.getState().setTitle(id, title);
    });

    const resizeObs = new ResizeObserver((entries) => {
      if (killed) return;
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        if (killed) return;
        try {
          fitAddon.fit();
          if (term.cols > 0 && term.rows > 0) {
            resizeTerminal(id, term.cols, term.rows).catch(() => {});
          }
        } catch {}
      }, 100);
    });
    resizeObs.observe(el);

    const handleWheel = (e: WheelEvent) => {
      if (term.buffer.active.type === "alternate") {
        e.preventDefault();
        e.stopPropagation();
        const lines = Math.ceil(Math.abs(e.deltaY) / 30);
        term.scrollLines(e.deltaY > 0 ? lines : -lines);
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false, capture: true });

    // OSC 7 — current working directory (emitted by shell prompt hook)
    term.parser.registerOscHandler(7, (data) => {
      try {
        const url = new URL(data);
        let path = decodeURIComponent(url.pathname);
        // Windows: /C:/Users/... → C:\Users\...
        if (/^\/[A-Za-z]:\//.test(path)) {
          path = path.slice(1).replace(/\//g, "\\");
        }
        const ref = terminalRefs.get(id);
        if (ref) { ref.lastDir = path; ref.cwd = path; }
        useTerminalStore.getState().setTitle(id, path.split("\\").pop() || path);
      } catch {}
      return true;
    });

    // OSC 133 A — prompt start (mark command zone)
    term.parser.registerOscHandler(133, (data) => {
      if (data === "A") {
        const ref = terminalRefs.get(id);
        if (ref) {
          const line = term.buffer.active.baseY + term.buffer.active.cursorY;
          ref.commandMarks.push(line);
          // Keep only last 500 marks to avoid unbounded growth
          if (ref.commandMarks.length > 500) ref.commandMarks.shift();
        }
      }
      return true;
    });

    terminalRefs.set(id, {
      term,
      fitAddon,
      searchAddon,
      unlisten: () => unlistenFn?.(),
      resizeObserver: resizeObs,
      command: command || "",
      cwd: cwd || "",
      title: "",
      lastDir: cwd || "",
      lastActiveAt: Date.now(),
      bufferTrimmed: false,
      commandMarks: [],
    });

    // Trim inactive scrollback — after 5min of inactivity clear buffer to free memory
    const trimInterval = window.setInterval(() => {
      if (killed) return;
      const ref = terminalRefs.get(id);
      if (!ref) return;
      const isActive = useTerminalStore.getState().focusedTerminalId === id;
      if (isActive) return;
      const inactive = Date.now() - ref.lastActiveAt;
      if (inactive > 5 * 60 * 1000 && !ref.bufferTrimmed) {
        ref.bufferTrimmed = true;
        try { term.clear(); } catch {}
      }
    }, 60 * 1000);

    return () => {
      killed = true;
      clearTimeout(resizeTimeout);
      clearInterval(trimInterval);
      resizeObs.disconnect();
      el.removeEventListener("wheel", handleWheel, { capture: true } as EventListenerOptions);
      unlistenFn?.();
      terminalRefs.delete(id);
      try { webglAddon?.dispose(); } catch {}
      webglAddon = null;
      requestAnimationFrame(() => {
        try { term.dispose(); } catch {}
      });
    };
  }, [id]);

  useEffect(() => {
    let prevFocused = useTerminalStore.getState().focusedTerminalId;
    return useTerminalStore.subscribe((state) => {
      if (state.focusedTerminalId !== prevFocused) {
        prevFocused = state.focusedTerminalId;
        if (state.focusedTerminalId === id) {
          const ref = terminalRefs.get(id);
          if (!ref) return;
          ref.term.focus();
          ref.lastActiveAt = Date.now();
          // Restore buffer if it was trimmed
          if (ref.bufferTrimmed) {
            ref.bufferTrimmed = false;
            getTerminalBuffer(id).then((buffer) => {
              if (buffer) {
                ref.term.write(buffer);
              }
            }).catch(() => {});
          }
        }
      }
    });
  }, [id]);

  useEffect(() => {
    const el = containerRef.current;
    return useSettingsStore.subscribe((state) => {
      const ref = terminalRefs.get(id);
      if (!ref) return;
      const theme = state.getXtermTheme();
      ref.term.options.theme = theme;
      ref.term.options.fontSize = state.termFontSize;
      ref.term.options.fontFamily = state.termFontFamily;
      ref.term.options.cursorStyle = state.termCursorStyle;
      if (theme.background) {
        if (el) el.style.background = theme.background;
        const paneEl = el?.closest("[data-pane-id]") as HTMLElement | null;
        if (paneEl) paneEl.style.background = theme.background;
      }
      requestAnimationFrame(() => {
        try {
          ref.fitAddon.fit();
          resizeTerminal(id, ref.term.cols, ref.term.rows).catch(() => {});
        } catch {}
      });
    });
  }, [id]);

  return (
    <div
      ref={containerRef}
      className={s.xtermContainer}
      onClick={onFocus}
    />
  );
}
