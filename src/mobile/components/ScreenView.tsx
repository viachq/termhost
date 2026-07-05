import { useRef, useEffect, useState } from "react";

interface Props {
  active: boolean;
}

/**
 * Screen live stream using FFmpeg H.264 video over HTTP.
 * Falls back to the old WS-based MJPEG stream on error.
 */
export function ScreenView({ active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string>("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!active) return;
    // Derive stream URL from the current page origin
    const url = `${window.location.protocol}//${window.location.host}/screen/live`;
    setStreamUrl(url);
    setError(null);
  }, [active, retryKey]);

  const handleError = () => {
    setError("Stream unavailable — tap Retry to try again");
  };

  const handleRetry = () => {
    setRetryKey((k) => k + 1);
    setError(null);
  };

  if (!active) return null;

  return (
    <div className="m-screen-view" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#000" }}>
      {error && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, color: "#666", fontSize: 14 }}>
          <span>{error}</span>
          <button onClick={handleRetry} style={{ padding: "8px 20px", background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Retry
          </button>
        </div>
      )}
      {streamUrl && !error && (
        <video
          ref={videoRef}
          key={retryKey}
          src={streamUrl}
          autoPlay
          muted
          playsInline
          onError={handleError}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: error ? "none" : "block",
          }}
        />
      )}
    </div>
  );
}
