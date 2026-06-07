import { useState, useRef, useEffect, useCallback } from "react";
import { terminalRefs } from "../../store/terminalStore";
import { useTerminalStore } from "../../store/terminalStore";
import s from "./SearchBar.module.css";

export default function SearchBar({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedId = useTerminalStore((st) => st.focusedTerminalId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const getSearchAddon = useCallback(() => {
    if (!focusedId) return null;
    return terminalRefs.get(focusedId)?.searchAddon ?? null;
  }, [focusedId]);

  const findNext = useCallback(() => {
    if (!query) return;
    getSearchAddon()?.findNext(query, { caseSensitive: false, regex: false });
  }, [query, getSearchAddon]);

  const findPrev = useCallback(() => {
    if (!query) return;
    getSearchAddon()?.findPrevious(query, { caseSensitive: false, regex: false });
  }, [query, getSearchAddon]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) findPrev();
        else findNext();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        getSearchAddon()?.clearDecorations();
        onClose();
      }
    },
    [findNext, findPrev, onClose, getSearchAddon]
  );

  useEffect(() => {
    if (query) {
      getSearchAddon()?.findNext(query, { caseSensitive: false, regex: false });
    } else {
      getSearchAddon()?.clearDecorations();
    }
  }, [query, getSearchAddon]);

  return (
    <div className={s.overlay}>
      <input
        ref={inputRef}
        className={s.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search in terminal…"
        spellCheck={false}
      />
      <button className={s.btn} onClick={findPrev} title="Previous (Shift+Enter)">
        ▲
      </button>
      <button className={s.btn} onClick={findNext} title="Next (Enter)">
        ▼
      </button>
      <button
        className={s.btn}
        onClick={() => {
          getSearchAddon()?.clearDecorations();
          onClose();
        }}
        title="Close (Esc)"
      >
        ✕
      </button>
    </div>
  );
}
