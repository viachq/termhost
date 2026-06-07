import { useEffect, useRef, useState } from "react";
import { useMobileStore } from "../store/mobileStore";

interface Props {
  onConnect: (host: string) => void;
}

export function ConnectScreen({ onConnect }: Props) {
  const { host, setHost, connection } = useMobileStore();
  const [input, setInput] = useState(() => {
    const loc = window.location;
    if (loc.port && loc.hostname !== "localhost" && loc.hostname !== "127.0.0.1") {
      return loc.host;
    }
    return host;
  });

  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const loc = window.location;
    if (loc.port && loc.hostname !== "localhost" && loc.hostname !== "127.0.0.1") {
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
      <div className="m-connect-logo">TerminalHub</div>
      <p className="m-connect-desc">Enter your PC address</p>
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
      {connection === "connecting" && (
        <p className="m-connect-desc">Connecting to {input}...</p>
      )}
    </div>
  );
}
