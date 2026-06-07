import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./styles/global.css";
import "./styles/markdown.css";
import App from "./App";
import { writeTerminal } from "./hooks/useTauriIpc";

function handleTerminalDrag(e: DragEvent) {
  const pane = (e.target as HTMLElement)?.closest?.("[data-pane-id]");
  if (!pane) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
}

document.addEventListener("dragenter", handleTerminalDrag, true);
document.addEventListener("dragover", handleTerminalDrag, true);
document.addEventListener("drop", (e: DragEvent) => {
  const pane = (e.target as HTMLElement)?.closest?.("[data-pane-id]");
  if (!pane) return;
  e.preventDefault();
  const id = pane.getAttribute("data-pane-id");
  const text = e.dataTransfer?.getData("text/plain");
  if (id && text) writeTerminal(id, text);
}, true);

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
