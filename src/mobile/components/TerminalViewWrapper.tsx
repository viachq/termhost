import { useRef, useEffect, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";

interface Props {
  id: string;
  active: boolean;
  isActive: boolean;
  cols?: number;
  rows?: number;
  fontSize: number;
  onData: (data: string) => void;
  onResize: (id: string, cols: number, rows: number, claim?: boolean) => void;
  onActivate: () => void;
  onRegister: (id: string, term: Terminal) => void;
  onUnregister: (id: string) => void;
  onRegisterSearch: (id: string, addon: SearchAddon) => void;
  onUnregisterSearch: (id: string) => void;
}

export function TerminalViewWrapper({
  id,
  active,
  isActive,
  cols,
  rows,
  fontSize,
  onData,
  onResize,
  onActivate,
  onRegister,
  onUnregister,
  onRegisterSearch,
  onUnregisterSearch,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Bumped by the ResizeObserver whenever the container actually changes
  // size — re-runs the mode effect (fit / re-scale) so the terminal always
  // fills the space instead of staying at a stale grid (content cut off
  // with empty room below).
  const [sizeTick, setSizeTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  // Latest values for the mount-only effect closures (stale-closure guard).
  const activeRef = useRef(active);
  const isActiveRef = useRef(isActive);
  activeRef.current = active;
  isActiveRef.current = isActive;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
      allowTransparency: true,
      theme: {
        background: "rgba(0,0,0,0)",
        foreground: "#e0e0e0",
        cursor: "#e0e0e0",
        selectionBackground: "#ffffff33",
        black: "#1a1a2e",
        red: "#e94560",
        green: "#4ecca3",
        yellow: "#f0c040",
        blue: "#5b8def",
        magenta: "#b388ff",
        cyan: "#00bcd4",
        white: "#e0e0e0",
        brightBlack: "#2d2d44",
        brightRed: "#ff6b6b",
        brightGreen: "#7ed6a9",
        brightYellow: "#ffd93d",
        brightBlue: "#7ba7ff",
        brightMagenta: "#cc99ff",
        brightCyan: "#4dd0e1",
        brightWhite: "#ffffff",
      },
    });

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);

    term.open(container);

    // Set explicit size if provided (from daemon) — passive first paint,
    // the daemon's canonical grid rendered whole (scaled by the mode effect).
    if (cols && rows) {
      term.resize(cols, rows);
    }

    // Fit only once the web fonts are actually loaded — a fit() before that
    // measures a wrong char width and can shrink the PTY to a garbage size
    // (e.g. 13 columns) which then poisons the shared terminal. And never
    // fit on mount in a way that claims: the phone starts PASSIVE and takes
    // control only on an explicit tap.
    const fontsReady = (document as any).fonts?.ready
      ? (document as any).fonts.ready.then(() => {
          if (activeRef.current && isActiveRef.current) {
            try { fitRef.current?.fit(); } catch (_) { /* ignore */ }
          }
        })
      : Promise.resolve();
    fontsReady.catch(() => {});

    term.onData((data) => {
      onData(data);
      onActivate();
    });

    term.onResize(({ cols: c, rows: r }) => {
      // Only forward size changes while the phone OWNS the terminal (active).
      // Passive renders the canonical grid locally; forwarding its resize
      // would fight the desktop for the shared PTY.
      if (isActiveRef.current) onResize(id, c, r);
    });

    termRef.current = term;
    fitRef.current = fitAddon;
    onRegister(id, term);
    onRegisterSearch(id, searchAddon);

    return () => {
      onUnregister(id);
      onUnregisterSearch(id);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id]); // only on mount/unmount

  // Watch the container for real size changes (keyboard open/close, toolbar
  // rows wrapping, window resizes) and re-fit/re-scale. Without this the
  // terminal keeps its stale grid and content gets cut off even though the
  // viewport has room.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setSizeTick((t) => t + 1);
      });
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [id]);

  // Re-fit on active change (when this terminal becomes visible). Fonts are
  // loaded by then, so the measurement is trustworthy.
  useEffect(() => {
    if (active && isActive && fitRef.current) {
      const t = setTimeout(() => {
        try { fitRef.current?.fit(); } catch (_) { /* ignore */ }
      }, 100);
      return () => clearTimeout(t);
    }
  }, [active, isActive]);

  // Mode-aware sizing:
  //  - ACTIVE (phone owns the PTY): fit the viewport — the phone width IS the
  //    PTY width, so output is drawn for exactly what we show.
  //  - PASSIVE (desktop owns the PTY): the PTY stays at the desktop's canonical
  //    grid; instead of truncating, CSS-scale the font so the FULL grid fits
  //    the viewport (tiny but whole — TUI apps like Claude Code stay intact).
  // `resize_rejected` from the daemon flips isActive → this effect re-runs.
  useEffect(() => {
    const term = termRef.current;
    if (!term || !active) return;
    const container = containerRef.current;
    if (!container) return;

    if (!isActive) {
      if (cols && rows) {
        const w = container.clientWidth || 320;
        // 0.6 ≈ average monospace char width in em; min 6px keeps it legible-ish
        const scaled = Math.min(12, Math.max(6, w / (cols * 0.6)));
        if (term.cols !== cols || term.rows !== rows) {
          // Size changed — drop cells from the previous size (they'd linger
          // as ghosts) and rebuild the grid at the canonical size.
          term.reset();
          term.options.fontSize = scaled;
          term.resize(cols, rows);
        } else {
          term.options.fontSize = scaled;
        }
      }
    } else {
      term.options.fontSize = fontSize;
      try { fitRef.current?.fit(); } catch (_) { /* ignore */ }
    }
  }, [isActive, cols, rows, active, fontSize, id, sizeTick]);

  // Self-healing: a fit measured too early (layout still shifting after a
  // claim tap, keyboard transition, pane resize) leaves the grid narrower
  // than the container — empty space on the right. Every 1.5s, while the
  // phone OWNS the terminal, re-fit whenever the grid width disagrees with
  // the container by more than a couple of px.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;
    const check = () => {
      const term = termRef.current;
      if (!term || !activeRef.current || !isActiveRef.current) return;
      const el = term.element;
      if (!el) return;
      const cw = container.clientWidth;
      if (cw < 50) return; // hidden / zero-size
      if (Math.abs(el.clientWidth - cw) > 4) {
        try { fitRef.current?.fit(); } catch (_) { /* ignore */ }
      }
    };
    const iv = window.setInterval(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    }, 1500);
    return () => {
      clearInterval(iv);
      cancelAnimationFrame(raf);
    };
  }, [id]);

  // Tap on a passive terminal = take control: fit to the phone, claim the PTY
  // (the daemon always accepts a claim), so the app redraws at phone width.
  // A SWIPE (vertical drag) scrolls instead — never claims, never resizes.
  const pointerRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    pointerRef.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointerRef.current;
    const term = termRef.current;
    if (!p || !term) return;
    const dy = e.clientY - p.y;
    if (!p.moved) {
      if (Math.abs(dy) < 8 && Math.abs(e.clientX - p.x) < 8) return;
      p.moved = true; // a drag, not a tap — stop claiming
    }
    // Scroll the terminal buffer by the finger delta (line height ≈ fontSize * 1.2).
    // scrollLines(+N) scrolls down (newer), negative scrolls up (older).
    const lh = Math.max(10, (term.options.fontSize || 12) * 1.2);
    const lines = Math.round(dy / lh);
    if (lines !== 0) {
      term.scrollLines(lines);
      p.y = e.clientY; // incremental
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointerRef.current;
    pointerRef.current = null;
    if (!p || p.moved) return; // was a scroll gesture
    // genuine tap → claim
    const term = termRef.current;
    if (!term || !active) return;
    if (!isActive) {
      try { fitRef.current?.fit(); } catch (_) { /* ignore */ }
      // Sanity guard: never claim with a garbage size (fonts can still be
      // mid-load on the very first tap).
      if (term.cols >= 20 && term.rows >= 5) {
        onResize(id, term.cols, term.rows, true);
        // Clear the old-size frame — the app in the PTY full-redraws on
        // resize and the live stream paints the clean new frame.
        term.clear();
      }
    }
    onActivate();
  };

  // Expose fit method so parent can trigger it (e.g. on orientation change)
  useEffect(() => {
    const key = `__fit_${id}`;
    (window as any)[key] = () => {
      try { fitRef.current?.fit(); } catch (_) { /* ignore */ }
    };
    return () => { delete (window as any)[key]; };
  }, [id]);

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { pointerRef.current = null; }}
      onPointerLeave={() => { pointerRef.current = null; }}
      style={{
        display: active ? "flex" : "none",
        width: "100%",
        height: "100%",
        flex: 1,
        minHeight: 0,
        // Let the finger drag reach us instead of the browser's page scroll.
        touchAction: "none",
      }}
    />
  );
}
