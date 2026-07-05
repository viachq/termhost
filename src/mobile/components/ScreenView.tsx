import { useRef, useEffect, useState } from "react";

interface Props {
  active: boolean;
  streamActive: boolean;
  onStartStream: () => void;
  onStopStream: () => void;
}

/** Inject the `send` function needed by mouse events. Called from App.tsx. */
export function setScreenSend(fn: (msg: any) => void) {
  const ref = (window as any).__screenSendRef;
  if (ref) ref.current = fn;
}

export function ScreenView({ active, streamActive, onStartStream, onStopStream }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const renderRef = useRef<((blob: Blob) => void) | null>(null);
  const sendRef = useRef<((msg: any) => void) | null>(null);

  useEffect(() => {
    const send = (window as any).__screenSendRef?.current;
    if (send) sendRef.current = send;
  }, []);

  useEffect(() => {
    renderRef.current = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          setDim({ w: img.naturalWidth, h: img.naturalHeight });
        }
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };
  }, []);

  useEffect(() => {
    (window as any).__screenRender = renderRef.current;
    return () => { delete (window as any).__screenRender; };
  }, []);

  const toAbs = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    return { x: Math.round(px * 65535), y: Math.round(py * 65535) };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const abs = toAbs(e.clientX, e.clientY);
    if (!abs) return;
    sendRef.current?.({ type: "mouse_move", x: abs.x, y: abs.y });
    sendRef.current?.({ type: "mouse_down", button: "left" });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const abs = toAbs(e.clientX, e.clientY);
    if (!abs) return;
    sendRef.current?.({ type: "mouse_move", x: abs.x, y: abs.y });
    sendRef.current?.({ type: "mouse_up", button: "left" });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!e.buttons) return;
    const abs = toAbs(e.clientX, e.clientY);
    if (!abs) return;
    sendRef.current?.({ type: "mouse_move", x: abs.x, y: abs.y });
  };

  const toggle = () => {
    if (streamActive) onStopStream();
    else onStartStream();
  };

  if (!active) return null;

  return (
    <div className="m-screen-view" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", flexShrink: 0 }}>
        <button
          onClick={toggle}
          style={{
            background: streamActive ? "#e94560" : "rgba(255,255,255,0.08)",
            border: "none", borderRadius: 6, color: "#fff",
            padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {streamActive ? "■ Stop" : "▶ Start"}
        </button>
        {dim.w > 0 && (
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
            {dim.w}×{dim.h}
          </span>
        )}
        {streamActive && <span className="m-screen-live" style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />}
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerMove}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", touchAction: "none" }}
        />
      </div>
    </div>
  );
}

export function renderScreenFrame(blob: Blob) {
  ((window as any).__screenRender as ((blob: Blob) => void) | null)?.(blob);
}
