import { useState, useRef, useEffect } from "react";
import { useMobileStore } from "../store/mobileStore";

interface Props {
  onSend: (text: string) => void;
}

export function ClipboardPage({ onSend }: Props) {
  const [text, setText] = useState("");
  const { clipboardHistory, addClipboardEntry } = useMobileStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addClipboardEntry(trimmed);
    onSend(trimmed);
    setText("");
  };

  const handleResend = (entry: string) => {
    onSend(entry);
  };

  return (
    <div className="m-clipboard">
      <div className="m-clip-compose">
        <textarea
          ref={textareaRef}
          className="m-clip-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste text to send to PC..."
          rows={4}
        />
        <button
          className="m-clip-send"
          onClick={handleSend}
          disabled={!text.trim()}
        >
          Send to PC
        </button>
      </div>

      {clipboardHistory.length > 0 && (
        <div className="m-clip-history">
          <div className="m-clip-history-title">History</div>
          {clipboardHistory.map((entry, i) => (
            <button
              key={entry.ts + "-" + i}
              className="m-clip-entry"
              onClick={() => handleResend(entry.text)}
            >
              <span className="m-clip-entry-text">{entry.text}</span>
              <span className="m-clip-entry-time">
                {formatTime(entry.ts)}
              </span>
            </button>
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
