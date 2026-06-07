import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { shutdownDaemon } from "../../hooks/useTauriIpc";
import s from "./CloseDialog.module.css";

export default function CloseDialog() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unlisten = listen("daemon-close-prompt", () => setVisible(true));
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  if (!visible) return null;

  const handleKeepAlive = () => {
    getCurrentWindow().destroy();
  };

  const handleKillAll = async () => {
    await shutdownDaemon().catch(() => {});
    getCurrentWindow().destroy();
  };

  const handleCancel = () => {
    setVisible(false);
  };

  return (
    <div className={s.overlay}>
      <div className={s.dialog}>
        <div className={s.title}>Background terminals are running</div>
        <div className={s.body}>
          The PTY daemon has active terminals. What should happen when you close the window?
        </div>
        <div className={s.actions}>
          <button className={s.btnSecondary} onClick={handleCancel}>Cancel</button>
          <button className={s.btnPrimary} onClick={handleKeepAlive}>
            Keep alive
          </button>
          <button className={s.btnDanger} onClick={handleKillAll}>
            Kill all & quit
          </button>
        </div>
        <div className={s.hint}>
          "Keep alive" — terminals survive in daemon, reconnect on next launch
        </div>
      </div>
    </div>
  );
}
