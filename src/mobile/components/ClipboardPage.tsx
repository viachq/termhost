import { useState, useRef, useEffect } from "react";
import { useMobileStore } from "../store/mobileStore";
import { Icon } from "./Icon";

type Target = "clipboard" | "terminal" | "pc";

interface Props {
  onClipboard: (text: string) => void;
  onTerminal: (id: string, data: string) => void;
  onTypeGlobal: (text: string) => void;
  onKeyGlobal: (key: string) => void;
}

const PC_KEYS: { key: string; label: string }[] = [
  { key: "esc", label: "Esc" },
  { key: "tab", label: "Tab" },
  { key: "ctrl+a", label: "^A" },
  { key: "ctrl+c", label: "^C" },
  { key: "ctrl+v", label: "^V" },
  { key: "ctrl+x", label: "^X" },
  { key: "ctrl+z", label: "^Z" },
  { key: "left", label: "←" },
  { key: "up", label: "↑" },
  { key: "down", label: "↓" },
  { key: "right", label: "→" },
];

export function ClipboardPage({ onClipboard, onTerminal, onTypeGlobal, onKeyGlobal }: Props) {
  const [text, setText] = useState("");
  const {
    clipboardHistory,
    addClipboardEntry,
    removeClipboardEntry,
    clearClipboardHistory,
    terminals,
    activeTerminalId,
  } = useMobileStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Tracks what's already been streamed (to a terminal or system-wide) in live
  // mode, so onChange only forwards the delta (typed chars, or backspaces on
  // delete) instead of re-sending the whole box every keystroke.
  const liveSentRef = useRef("");

  const [target, setTarget] = useState<Target>(
    () => (localStorage.getItem("th-clip-target") as Target) || "clipboard"
  );
  const [enter, setEnter] = useState(
    () => localStorage.getItem("th-clip-enter") !== "0"
  );
  const [live, setLive] = useState(
    () => localStorage.getItem("th-clip-live") === "1"
  );
  const [termId, setTermId] = useState<string | null>(activeTerminalId);

  // keep the chosen terminal valid; fall back to the active one
  useEffect(() => {
    if (!termId || !terminals.find((t) => t.id === termId)) {
      setTermId(activeTerminalId ?? terminals[0]?.id ?? null);
    }
  }, [terminals, activeTerminalId, termId]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const pickTarget = (t: Target) => {
    setTarget(t);
    localStorage.setItem("th-clip-target", t);
    liveSentRef.current = "";
  };
  const pickEnter = (v: boolean) => {
    setEnter(v);
    localStorage.setItem("th-clip-enter", v ? "1" : "0");
  };
  const pickLive = (v: boolean) => {
    setLive(v);
    localStorage.setItem("th-clip-live", v ? "1" : "0");
    liveSentRef.current = "";
  };

  const deliver = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    addClipboardEntry(trimmed);
    if (target === "clipboard") {
      onClipboard(trimmed);
    } else if (target === "pc") {
      onTypeGlobal(enter ? trimmed + "\r" : trimmed);
    } else if (termId) {
      onTerminal(termId, enter ? trimmed + "\r" : trimmed);
    }
  };

  // Live mode is available for both "type into this terminal" and "type
  // wherever the PC's cursor is" — the diffing logic is the same either way,
  // only the delivery function differs.
  const liveEnabled = live && (target === "pc" || (target === "terminal" && !!termId));
  const sendLive = (data: string) => {
    if (target === "pc") onTypeGlobal(data);
    else if (termId) onTerminal(termId, data);
  };

  // Live mode: every keystroke's DELTA goes straight out as you type — added
  // text is forwarded as-is, removed text becomes that many backspaces
  // (\x7f) — so the target echoes live instead of waiting for a Send tap.
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setText(next);
    if (!liveEnabled) return;
    const prev = liveSentRef.current;
    if (next.startsWith(prev)) {
      const added = next.slice(prev.length);
      if (added) sendLive(added);
    } else if (prev.startsWith(next)) {
      const removed = prev.length - next.length;
      sendLive("\x7f".repeat(removed));
    } else {
      // Non-linear edit (paste over selection, cut mid-string) — resync by
      // clearing what we'd echoed and resending the whole new value.
      sendLive("\x7f".repeat(prev.length) + next);
    }
    liveSentRef.current = next;
  };

  const handleSend = () => {
    if (liveEnabled) {
      // Text is already streamed char-by-char — Send here just submits Enter.
      sendLive("\r");
      if (text.trim()) addClipboardEntry(text.trim());
      setText("");
      liveSentRef.current = "";
      return;
    }
    deliver(text);
    setText("");
  };

  const handleResend = (entry: string) => deliver(entry);

  // Clear the box — and if Live already echoed characters to the target,
  // un-type them there too (backspace the exact count), so "Clear" actually
  // undoes what you typed instead of just wiping the local textarea.
  const handleClear = () => {
    if (liveEnabled && liveSentRef.current) {
      sendLive("\x7f".repeat(liveSentRef.current.length));
    }
    setText("");
    liveSentRef.current = "";
    textareaRef.current?.focus();
  };

  const noTerminal = target === "terminal" && !termId;
  const sendLabel = liveEnabled
    ? "Enter ⏎"
    : target === "clipboard"
    ? "Send to PC"
    : target === "pc"
    ? enter
      ? "Type + Enter ⏎"
      : "Type on PC"
    : enter
    ? "Run in terminal ⏎"
    : "Type in terminal";

  const placeholder =
    target === "clipboard"
      ? "Type or paste text to send to PC clipboard..."
      : target === "pc"
      ? "Type here — lands wherever the PC's cursor is focused..."
      : "Type a command or prompt for the terminal...";

  return (
    <div className="m-clipboard">
      <div className="m-clip-compose">
        <div className="m-clip-target">
          <button
            className={`m-clip-tab ${target === "clipboard" ? "active" : ""}`}
            onClick={() => pickTarget("clipboard")}
          >
            <Icon name="clipboard" size={14} /> Clipboard
          </button>
          <button
            className={`m-clip-tab ${target === "terminal" ? "active" : ""}`}
            onClick={() => pickTarget("terminal")}
          >
            <Icon name="keys" size={14} /> Terminal
          </button>
          <button
            className={`m-clip-tab ${target === "pc" ? "active" : ""}`}
            onClick={() => pickTarget("pc")}
          >
            <Icon name="drive" size={14} /> PC (anywhere)
          </button>
        </div>

        {target === "terminal" && (
          <div className="m-clip-termopts">
            <select
              className="m-clip-select"
              value={termId ?? ""}
              onChange={(e) => { setTermId(e.target.value || null); liveSentRef.current = ""; }}
            >
              {terminals.length === 0 && <option value="">no terminals</option>}
              {terminals.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {(target === "terminal" || target === "pc") && (
          <div className="m-clip-termopts">
            <label className="m-clip-enter">
              <input
                type="checkbox"
                checked={live}
                onChange={(e) => pickLive(e.target.checked)}
              />
              Live
            </label>
            {!live && (
              <label className="m-clip-enter">
                <input
                  type="checkbox"
                  checked={enter}
                  onChange={(e) => pickEnter(e.target.checked)}
                />
                Press Enter &#x23CE;
              </label>
            )}
          </div>
        )}

        {target === "pc" && (
          <>
            <div className="m-clip-live-hint accent">
              Types system-wide via Windows — wherever the PC's cursor is focused right now, not just a terminal.
            </div>
            <div className="m-clip-pckeys">
              {PC_KEYS.map((k) => (
                <button key={k.key} className="m-clip-pckey" onClick={() => onKeyGlobal(k.key)}>
                  {k.label}
                </button>
              ))}
            </div>
          </>
        )}
        {liveEnabled && target !== "pc" && (
          <div className="m-clip-live-hint">Typing streams live to the terminal — Send just submits Enter.</div>
        )}

        <textarea
          ref={textareaRef}
          className="m-clip-textarea"
          value={text}
          onChange={handleChange}
          placeholder={placeholder}
          rows={4}
        />
        <div className="m-clip-actions">
          <button
            className="m-clip-clear"
            onClick={handleClear}
            disabled={!text}
            aria-label="Clear"
          >
            <Icon name="close" size={16} />
          </button>
          <button
            className="m-clip-send"
            onClick={handleSend}
            disabled={noTerminal || (!liveEnabled && !text.trim())}
          >
            {sendLabel}
          </button>
        </div>
      </div>

      {clipboardHistory.length > 0 && (
        <div className="m-clip-history">
          <div className="m-clip-history-title">
            History
            <button className="m-clip-history-clear" onClick={clearClipboardHistory}>
              Clear all
            </button>
          </div>
          {clipboardHistory.map((entry, i) => (
            <div key={entry.ts + "-" + i} className="m-clip-entry">
              <button className="m-clip-entry-main" onClick={() => handleResend(entry.text)}>
                <span className="m-clip-entry-text">{entry.text}</span>
                <span className="m-clip-entry-time">{formatTime(entry.ts)}</span>
              </button>
              <button
                className="m-clip-entry-del"
                onClick={() => removeClipboardEntry(entry.ts)}
                aria-label="Delete entry"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + time;
}
