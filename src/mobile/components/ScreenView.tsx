import { useRef, useEffect, useState, useCallback } from "react";

interface Props {
  active: boolean;
}

type StreamMode = "mjpeg" | "h264" | "turbo";

/** Low-latency MJPEG over WebSocket renderer */
function useMJPEG(active: boolean, wsSend: (msg: any) => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [mode, setMode] = useState<StreamMode>("mjpeg");

  // Expose render function for App.tsx's WS binary handler
  useEffect(() => {
    if (!active) return;
    (window as any).__screenRender = (blob: Blob) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          setDim({ w: img.naturalWidth, h: img.naturalHeight });
        }
        canvas.getContext("2d")?.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };
    return () => { delete (window as any).__screenRender; };
  }, [active]);

  const toggleStream = useCallback(() => {
    const isActive = (window as any).__mjpegActive;
    if (isActive) {
      (window as any).__mjpegActive = false;
      wsSend({ type: "screen_stream", action: "stop" });
    } else {
      (window as any).__mjpegActive = true;
      wsSend({ type: "screen_stream", action: "start", mode });
    }
  }, [wsSend, mode]);

  return { canvasRef, dim, mode, setMode, toggleStream };
}

/** H.264 via HTTP video element */
function useH264(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    setError(null);
  }, [active]);

  const url = active ? `${window.location.protocol}//${window.location.host}/screen/live` : "";

  return { videoRef, url, error, setError };
}

export function ScreenView({ active }: Props) {
  const [streamMode, setStreamMode] = useState<StreamMode>("mjpeg");
  const [h264Key, setH264Key] = useState(0);

  const wsSend = (window as any).__screenSendRef?.current;
  const mjpeg = useMJPEG(active && streamMode === "mjpeg", wsSend);
  const h264 = useH264(active && streamMode === "h264");

  const handleModeChange = (mode: StreamMode) => {
    // Stop current stream
    if ((window as any).__mjpegActive) {
      (window as any).__mjpegActive = false;
      wsSend({ type: "screen_stream", action: "stop" });
    }
    setStreamMode(mode);
    setH264Key(k => k + 1);
  };

  if (!active) return null;

  return (
    <div className="m-screen-view" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#000" }}>
      {/* Mode selector */}
      <div style={{ display: "flex", gap: 4, padding: "4px 8px", flexShrink: 0, background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {(["mjpeg", "h264", "turbo"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => handleModeChange(mode)}
            style={{
              padding: "5px 10px", borderRadius: 6, border: "none",
              background: streamMode === mode ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
              color: streamMode === mode ? "#fff" : "#888",
              fontSize: 11, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            {mode === "mjpeg" ? "MJPEG 🚀" : mode === "h264" ? "H.264 🎯" : "Turbo 🔥"}
          </button>
        ))}
      </div>

      {/* MJPEG mode */}
      {streamMode === "mjpeg" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", flexShrink: 0 }}>
            <button
              onClick={mjpeg.toggleStream}
              style={{
                background: (window as any).__mjpegActive ? "#e94560" : "rgba(255,255,255,0.08)",
                border: "none", borderRadius: 6, color: "#fff",
                padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {(window as any).__mjpegActive ? "■ Stop" : "▶ Start"}
            </button>
            {mjpeg.dim.w > 0 && (
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                {mjpeg.dim.w}×{mjpeg.dim.h}
              </span>
            )}
            {(window as any).__mjpegActive && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
            )}
          </div>
          <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <canvas
              ref={mjpeg.canvasRef}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", touchAction: "none" }}
            />
          </div>
        </>
      )}

      {/* H.264 mode */}
      {streamMode === "h264" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", flexShrink: 0 }}>
            <span style={{ color: "#888", fontSize: 11 }}>H.264 • 20fps • ~2s delay</span>
          </div>
          <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {h264.error ? (
              <div style={{ color: "#666", fontSize: 14, textAlign: "center" }}>
                <p>{h264.error}</p>
                <button onClick={() => { setH264Key(k => k + 1); h264.setError(null); }}
                  style={{ marginTop: 8, padding: "8px 20px", background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer" }}>
                  Retry
                </button>
              </div>
            ) : (
              <video
                key={h264Key}
                ref={h264.videoRef}
                src={h264.url}
                autoPlay muted playsInline preload="auto"
                onError={() => h264.setError("Stream unavailable")}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
            )}
          </div>
        </>
      )}

      {/* Turbo mode placeholder */}
      {streamMode === "turbo" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontSize: 14 }}>
          Turbo mode (DXGI + libx264) — coming soon
        </div>
      )}
    </div>
  );
}
