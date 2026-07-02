import { useState, useRef, useEffect } from "react";
import { Icon } from "./Icon";

interface Props {
  onFind: (query: string, backwards: boolean) => void;
  onClose: () => void;
}

export function SearchBar({ onFind, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="m-search-bar">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onFind(e.target.value, false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onFind(query, e.shiftKey);
          if (e.key === "Escape") onClose();
        }}
        placeholder="Search scrollback…"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button onClick={() => onFind(query, true)} aria-label="Previous match">‹</button>
      <button onClick={() => onFind(query, false)} aria-label="Next match">›</button>
      <button onClick={onClose} aria-label="Close search"><Icon name="close" size={14} /></button>
    </div>
  );
}
