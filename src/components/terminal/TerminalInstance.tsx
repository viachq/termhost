import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "../../store/settingsStore";
import { useTerminalStore, terminalRefs } from "../../store/terminalStore";
import { spawnTerminal, writeTerminal, resizeTerminal, hasTerminal, getTerminalBuffer } from "../../hooks/useTauriIpc";
import s from "./Terminal.module.css";

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
      allowProposedApi: true,
      scrollback: 5000,
      fastScrollModifier: "shift",
      fastScrollSensitivity: 5,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon((_, uri) => {
      window.dispatchEvent(new CustomEvent("terminalhub:open-url", { detail: uri }));
    }));
    term.loadAddon(searchAddon);

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
        try { fitAddon.fit(); } catch {}
      } catch {
        webglAddon = null;
      }
    }

    requestAnimationFrame(() => {
      if (killed) return;
      tryLoadWebgl();
      fitAddon.fit();
    });

    term.attachCustomKeyEventHandler((ev) => {
      if (ev.ctrlKey && ev.code === "KeyC" && term.hasSelection()) {
        if (ev.type === "keydown") {
          const sel = term.getSelection();
          navigator.clipboard.writeText(sel);
          window.dispatchEvent(new CustomEvent("terminalhub:terminal-copy", { detail: sel }));
          term.clearSelection();
        }
        return false;
      }
      if (ev.ctrlKey && ev.code === "KeyV") {
        if (ev.type === "keydown") {
          ev.preventDefault();
          navigator.clipboard.readText().then((text) => {
            if (text) writeTerminal(id, text);
          });
        }
        return false;
      }
      if (ev.ctrlKey && ev.altKey && ev.key.startsWith("Arrow")) return false;
      return true;
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

        const exists = await hasTerminal(id);
        if (exists) {
          try {
            const buffer = await getTerminalBuffer(id);
            if (buffer) term.write(buffer);
          } catch {}
          resizeTerminal(id, term.cols, term.rows).catch(() => {});
        } else {
          await spawnTerminal(id, cwd, command, term.cols, term.rows);
        }
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
          resizeTerminal(id, term.cols, term.rows).catch(() => {});
        } catch {}
      }, 100);
    });
    resizeObs.observe(el);

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
    });

    return () => {
      killed = true;
      clearTimeout(resizeTimeout);
      resizeObs.disconnect();
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
          if (ref) ref.term.focus();
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
