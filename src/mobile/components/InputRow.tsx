import { useState } from "react";

interface Props {
  onSend: (data: string) => void;
}

export function InputRow({ onSend }: Props) {
  const [value, setValue] = useState("");

  const handleSend = () => {
    if (!value) return;
    onSend(value + "\r");
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
        placeholder="command..."
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button onClick={handleSend}>Send</button>
    </div>
  );
}
