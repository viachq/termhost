import type { Snippet } from "../store/mobileStore";

interface Props {
  snippets: Snippet[];
  onSend: (text: string) => void;
}

export function SnippetBar({ snippets, onSend }: Props) {
  return (
    <div className="m-snippet-bar">
      {snippets.map((s) => (
        <button
          key={s.id}
          className="m-snippet-chip"
          onTouchStart={(e) => { e.preventDefault(); onSend(s.text); }}
          onClick={() => onSend(s.text)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
