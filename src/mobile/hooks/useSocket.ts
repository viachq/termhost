import { useRef, useCallback, useEffect } from "react";
import { useMobileStore } from "../store/mobileStore";
import type { ClientMessage, ServerMessage } from "../types";
import { wsUrl, clearTgSession } from "../api";

type MessageHandler = (msg: ServerMessage) => void;

const PING_INTERVAL_MS = 4000;
const MAX_QUEUE = 500;

export function useSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const pingTimer = useRef<number | null>(null);
  const hostRef = useRef<string | null>(null);
  const attemptRef = useRef(0);
  // What auth the current socket URL carries — a Telegram session that the
  // server keeps rejecting means the session is stale/revoked: stop retrying
  // and drop back to the login gate instead of looping forever.
  const authModeRef = useRef<"session" | "token" | "none">("none");
  // Buffers sends made while the socket is reconnecting so a mid-type network
  // blip doesn't silently eat keystrokes — flushed in order once back online.
  const queueRef = useRef<ClientMessage[]>([]);
  const { setConnection, setPingMs } = useMobileStore();

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      queueRef.current.push(msg);
      if (queueRef.current.length > MAX_QUEUE) queueRef.current.shift();
    }
  }, []);

  const clearTimer = () => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  };

  const clearPing = () => {
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }
  };

  const connect = useCallback(
    (host: string) => {
      hostRef.current = host;
      clearTimer();
      clearPing();
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      setConnection("connecting");

      const url = wsUrl(host);
      authModeRef.current = url.includes("session=")
        ? "session"
        : url.includes("token=")
        ? "token"
        : "none";
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setConnection("connected");
        ws.send(JSON.stringify({ type: "list_workspaces" }));

        // Flush anything buffered while disconnected, in order.
        const queued = queueRef.current;
        queueRef.current = [];
        for (const m of queued) ws.send(JSON.stringify(m));

        pingTimer.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (e) => {
        // Binary messages = JPEG screen frame
        if (e.data instanceof Blob) {
          (window as any).__screenRender?.(e.data);
          return;
        }
        // WebRTC answer — route to handler before main processing
        if (typeof e.data === "string" && e.data.includes("webrtc_answer")) {
          try { (window as any).__webrtcAnswerHandler?.(JSON.parse(e.data)); } catch {}
        }
        try {
          const msg = JSON.parse(e.data) as ServerMessage;
          if (msg.type === "pong") {
            setPingMs(Date.now() - msg.ts);
            return;
          }
          onMessage(msg);
        } catch {}
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        clearPing();
        setConnection("disconnected");
        setPingMs(null);
        // Stale/revoked Telegram session: the daemon 404s the WS handshake.
        // After a couple of failed attempts give up retrying and clear the
        // session so the connect screen shows the Telegram login gate again.
        if (authModeRef.current === "session" && attemptRef.current >= 2) {
          clearTgSession();
          clearTimer();
          return;
        }
        // Exponential backoff (0.5s→5s cap): recover fast after a blip, but don't
        // hammer on a long outage. `online`/visibility events reset it to instant.
        const delay = Math.min(5000, 500 * 2 ** attemptRef.current);
        attemptRef.current++;
        clearTimer();
        reconnectTimer.current = window.setTimeout(() => {
          if (hostRef.current) connect(hostRef.current);
        }, delay);
      };

      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    },
    [setConnection, setPingMs, onMessage]
  );

  const disconnect = useCallback(() => {
    clearTimer();
    clearPing();
    hostRef.current = null;
    queueRef.current = [];
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    setConnection("disconnected");
  }, [setConnection]);

  // Mobile networks drop the socket on lock/app-switch/tower-handoff. When the
  // network returns or the app comes to the foreground, reconnect immediately
  // instead of waiting out the backoff — this is what "reliable on LTE" means.
  useEffect(() => {
    const kick = () => {
      const ws = wsRef.current;
      if (hostRef.current && (!ws || ws.readyState > WebSocket.OPEN)) {
        attemptRef.current = 0;
        clearTimer();
        connect(hostRef.current);
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") kick();
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [connect]);

  useEffect(() => {
    return () => {
      clearTimer();
      clearPing();
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { connect, disconnect, send };
}
