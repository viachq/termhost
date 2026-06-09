import { useState } from "react";

interface Props {
  onSend: (data: string) => void;
  onClipboard: (data: string) => void;
}

export function InputRow({ onSend, onClipboard }: Props) {
  const [value, setValue] = useState("");

  const handleSend = () => {
    if (!value) return;
    onSend(value + "\r");
    setValue("");
  };

  const handleClipboard = () => {
    if (!value) return;
    onClipboard(value);
    setValue("");
  };

  return (
    <div className="m-input-row">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="command or text..."
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button className="m-btn-clip" onClick={handleClipboard} title="Copy to PC clipboard">⎘</button>
      <button onClick={handleSend}>Send</button>
    </div>
  );
}
