import { useCallback, useRef } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import PaneHeader from "./PaneHeader";
import TerminalInstance from "./TerminalInstance";
import s from "./Terminal.module.css";

interface Props {
  id: string;
  cwd?: string;
  command?: string;
  onSplit: (id: string, direction: "horizontal" | "vertical") => void;
  onClose: (id: string) => void;
}

export default function TerminalPane({ id, cwd, command, onSplit, onClose }: Props) {
  const isFocused = useTerminalStore((st) => st.focusedTerminalId === id);
  const setFocused = useTerminalStore((st) => st.setFocusedTerminalId);
  const paneRef = useRef<HTMLDivElement>(null);

  const handleFocus = useCallback(() => {
    setFocused(id);
    paneRef.current?.classList.remove("has-activity");
  }, [id, setFocused]);

  return (
    <div
      ref={paneRef}
      className={`${s.pane} ${isFocused ? s.focused : ""}`}
      data-pane-id={id}
      data-pane-focused={isFocused ? "true" : undefined}
    >
      <PaneHeader
        id={id}
        cwd={cwd}
        onSplitH={() => onSplit(id, "horizontal")}
        onSplitV={() => onSplit(id, "vertical")}
        onClose={() => onClose(id)}
      />
      <TerminalInstance
        id={id}
        cwd={cwd}
        command={command}
        onFocus={handleFocus}
      />
    </div>
  );
}
