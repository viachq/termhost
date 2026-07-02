import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@xterm/xterm/css/xterm.css";
import "./styles/mobile.css";

createRoot(document.getElementById("root")!).render(<App />);

// Required for PWA installability (and a landing spot for push later). Skips
// silently on http-only origins Chrome won't treat as a secure context.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
