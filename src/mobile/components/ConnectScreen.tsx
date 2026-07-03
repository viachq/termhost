import { useCallback, useEffect, useRef, useState } from "react";
import { useMobileStore } from "../store/mobileStore";
import { WS_TOKEN, apiOrigin, savePairedToken } from "../api";
import jsQR from "jsqr";

interface Props {
  onConnect: (host: string) => void;
}

declare global {
  interface Window {
    __WS_TOKEN__?: string;
  }
}

type PairState = "idle" | "waiting" | "approved" | "expired" | "error";

/** Shown instead of the plain connect form when this device has no token yet
 * (fresh install, or a paired token that got cleared). Requests a pairing
 * code from the daemon and polls until a human approves it from the PC —
 * see project_ssh-access-decision-style memory: this replaces "type the
 * token you copied from Settings" with "PC shows the same code, tap approve". */
function PairingFlow({ host }: { host: string }) {
  const [state, setState] = useState<PairState>("idle");
  const [code, setCode] = useState("");
  const deviceIdRef = useRef<string | null>(null);
  const pollTimer = useRef<number>(0);

  useEffect(() => {
    if (!host) return;
    let cancelled = false;

    const request = async () => {
      try {
        const res = await fetch(`${apiOrigin(host)}/api/pair/request`, { method: "POST" });
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        if (cancelled) return;
        deviceIdRef.current = data.deviceId;
        setCode(data.code);
        setState("waiting");
      } catch {
        if (!cancelled) setState("error");
      }
    };
    request();

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer.current);
    };
  }, [host]);

  useEffect(() => {
    if (state !== "waiting" || !deviceIdRef.current) return;
    pollTimer.current = window.setInterval(async () => {
      try {
        const res = await fetch(`${apiOrigin(host)}/api/pair/poll?deviceId=${deviceIdRef.current}`);
        const data = await res.json();
        if (data.status === "approved") {
          window.clearInterval(pollTimer.current);
          savePairedToken(data.token);
          setState("approved");
          // WS_TOKEN in api.ts is a module-level constant read once at load —
          // reload so it picks up the freshly-paired token from localStorage.
          setTimeout(() => window.location.reload(), 600);
        } else if (data.status === "expired") {
          window.clearInterval(pollTimer.current);
          setState("expired");
        }
      } catch {
        // transient network hiccup — keep polling, don't flip to error on one miss
      }
    }, 2000);
    return () => window.clearInterval(pollTimer.current);
  }, [state, host]);

  if (state === "idle") {
    return <p className="m-connect-desc">Requesting pairing code…</p>;
  }
  if (state === "error") {
    return <p className="m-connect-desc">Couldn't reach {host}. Check the address and try again.</p>;
  }
  if (state === "expired") {
    return <p className="m-connect-desc">Pairing code expired. Reload to get a new one.</p>;
  }
  if (state === "approved") {
    return <p className="m-connect-desc">Paired! Connecting…</p>;
  }
  return (
    <div className="m-pair-flow">
      <p className="m-connect-desc">Approve this device on your PC</p>
      <div className="m-pair-code">{code}</div>
      <p className="m-connect-desc">Open termhost on your PC — the same code will show up there to confirm.</p>
    </div>
  );
}

function ScanQR({ onScan }: { onScan: (host: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frameId = 0;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        loop();
      } catch {
        setError("Camera access denied or not available");
      }
    };

    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      if (video.readyState < 2) { frameId = requestAnimationFrame(loop); return; }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        try {
          const url = new URL(code.data);
          let host = url.host;
          // Strip trailing slash from host for display
          if (host.endsWith("/")) host = host.slice(0, -1);
          // Default port 9090 if none in URL (daemon default)
          if (!host.includes(":")) host += ":9090";
          stream?.getTracks().forEach(t => t.stop());
          onScan(host);
          return;
        } catch {
          // not a valid URL — keep scanning
        }
      }
      frameId = requestAnimationFrame(loop);
    };

    start();
    return () => {
      cancelAnimationFrame(frameId);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [onScan]);

  return (
    <div className="m-qr-scanner">
      <video ref={videoRef} playsInline muted className="m-qr-video" />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {error && <p className="m-connect-desc" style={{ color: "#e05050" }}>{error}</p>}
      <div className="m-qr-frame" />
      <p className="m-connect-desc">Point your camera at the QR code on your PC</p>
    </div>
  );
}

export function ConnectScreen({ onConnect }: Props) {
  const { host, setHost, connection } = useMobileStore();
  const [scanning, setScanning] = useState(false);

  const isLocalhost = (loc: Location) =>
    loc.hostname === "localhost" || loc.hostname === "127.0.0.1";

  const [input, setInput] = useState(() => {
    const loc = window.location;
    return isLocalhost(loc) ? loc.host : host;
  });

  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const loc = window.location;
    if (isLocalhost(loc)) {
      setHost(loc.host);
      onConnect(loc.host);
    } else if (WS_TOKEN) {
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

  const handleScan = useCallback((host: string) => {
    setScanning(false);
    setInput(host);
    setHost(host);
    onConnect(host);
  }, [setHost, onConnect]);

  if (scanning) {
    return (
      <div className="m-connect">
        <div className="m-connect-logo">termhost</div>
        <ScanQR onScan={handleScan} />
        <button className="m-connect-scan-cancel" onClick={() => setScanning(false)}>
          Cancel
        </button>
      </div>
    );
  }

  // No token and not localhost — pairing takes over once a host is known.
  if (!WS_TOKEN && input.trim() && !isLocalhost(window.location)) {
    return (
      <div className="m-connect">
        <div className="m-connect-logo">termhost</div>
        <PairingFlow host={input.trim()} />
      </div>
    );
  }

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

      <div style={{ textAlign: "center", marginTop: 8 }}>
        <button className="m-connect-scan-btn" onClick={() => setScanning(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ verticalAlign: "middle", marginRight: 6 }}>
            <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>
          </svg>
          Scan QR
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
