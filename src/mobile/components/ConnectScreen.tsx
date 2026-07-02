import { useEffect, useRef, useState } from "react";
import { useMobileStore } from "../store/mobileStore";
import QRCode from "qrcode";

interface Props {
  onConnect: (host: string) => void;
}

declare global {
  interface Window {
    __WS_TOKEN__?: string;
  }
}

export function ConnectScreen({ onConnect }: Props) {
  const { host, setHost, connection } = useMobileStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isServedByDaemon = (loc: Location) =>
    loc.hostname !== "localhost" && loc.hostname !== "127.0.0.1";

  const [input, setInput] = useState(() => {
    const loc = window.location;
    return isServedByDaemon(loc) ? loc.host : host;
  });

  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const loc = window.location;
    if (isServedByDaemon(loc)) {
      setHost(loc.host);
      onConnect(loc.host);
    }
  }, [onConnect, setHost]);

  const handleConnect = () => {
    const h = input.trim();
    if (!h) return;
    setHost(h);
    onConnect(h);
  };

  return (
    <div className="m-connect">
      <div className="m-connect-logo">termhost</div>

      <p className="m-connect-desc">Connect to your PC</p>
      <div className="m-connect-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          placeholder="192.168.x.x:9090"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button onClick={handleConnect} disabled={connection === "connecting"}>
          {connection === "connecting" ? "..." : "Go"}
        </button>
      </div>

      <div className="m-connect-hint">
        <p>Connect via Tailscale for remote access:</p>
        <ol>
          <li>Install <a href="https://tailscale.com/download" target="_blank" rel="noopener">Tailscale</a> on both devices</li>
          <li>Use your Tailscale IP (100.x.x.x:9090) from the Settings panel</li>
        </ol>
      </div>

      {connection === "connecting" && (
        <p className="m-connect-desc">Connecting...</p>
      )}
    </div>
  );
}
