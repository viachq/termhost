import { useState, useRef, useEffect, useCallback } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { writeTerminal } from "../../hooks/useTauriIpc";
import s from "./Titlebar.module.css";

const LANGS = ["uk-UA", "en-US"] as const;

function getRecognitionCtor(): any {
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/**
 * Mic button: dictate text into the focused terminal via the Web Speech API.
 * WebView2 may not ship SpeechRecognition — in that case we show a hint
 * (voice input still works from the mobile client, where Chrome supports it).
 */
export default function VoiceInput() {
  const supported = !!getRecognitionCtor();
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<(typeof LANGS)[number]>("uk-UA");
  const [hint, setHint] = useState("");
  const recRef = useRef<any>(null);

  useEffect(() => () => { recRef.current?.abort?.(); }, []);

  const stop = useCallback(() => {
    recRef.current?.stop?.();
    recRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setHint("Speech recognition is not available in this WebView. Use the mobile client for voice input.");
      setTimeout(() => setHint(""), 4000);
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      text = text.trim();
      if (!text) return;
      const id = useTerminalStore.getState().focusedTerminalId;
      if (id) writeTerminal(id, text + " ").catch(() => {});
    };
    rec.onerror = (e: any) => {
      setHint(e?.error === "not-allowed" ? "Microphone access denied" : `Speech error: ${e?.error || "unknown"}`);
      setTimeout(() => setHint(""), 4000);
      stop();
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      stop();
    }
  }, [lang, stop]);

  return (
    <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
      <button
        className={s.btn}
        title={
          supported
            ? listening
              ? "Stop dictation"
              : `Dictate into focused terminal (${lang})`
            : "Voice input (not supported in this WebView — works in mobile client)"
        }
        onClick={() => (listening ? stop() : start())}
        style={listening ? { color: "#e94560" } : !supported ? { opacity: 0.45 } : undefined}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10v1a7 7 0 0014 0v-1M12 18v4M8 22h8" />
        </svg>
        {listening && (
          <span
            style={{
              position: "absolute", top: 4, right: 2, width: 6, height: 6,
              borderRadius: "50%", background: "#e94560", animation: "pulse 1s infinite",
            }}
          />
        )}
      </button>
      {listening && (
        <button
          className={s.btn}
          style={{ fontSize: 9, width: "auto", padding: "0 4px" }}
          title="Dictation language"
          onClick={() => setLang((l) => (l === "uk-UA" ? "en-US" : "uk-UA"))}
        >
          {lang.slice(0, 2).toUpperCase()}
        </button>
      )}
      {hint && (
        <div
          style={{
            position: "absolute", top: "110%", right: 0, zIndex: 1000, width: 240,
            background: "#1a1a1a", border: "1px solid #333", borderRadius: 6,
            padding: "6px 10px", fontSize: 11, color: "var(--text)",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
