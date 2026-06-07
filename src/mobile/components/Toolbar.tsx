interface Props {
  onKey: (data: string) => void;
}

const KEYS = [
  { label: "Esc", data: "\x1b" },
  { label: "Tab", data: "\t" },
  { label: "^C", data: "\x03", accent: true },
  { label: "^D", data: "\x04" },
  { label: "^Z", data: "\x1a" },
  { label: "↑", data: "\x1b[A" },
  { label: "↓", data: "\x1b[B" },
  { label: "←", data: "\x1b[D" },
  { label: "→", data: "\x1b[C" },
  { label: "^A", data: "\x01" },
  { label: "^E", data: "\x05" },
  { label: "^L", data: "\x0c" },
];

export function Toolbar({ onKey }: Props) {
  return (
    <div className="m-toolbar">
      {KEYS.map((k) => (
        <button
          key={k.label}
          className={`m-toolbar-btn ${k.accent ? "accent" : ""}`}
          onTouchStart={(e) => {
            e.preventDefault();
            onKey(k.data);
          }}
          onClick={() => onKey(k.data)}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
