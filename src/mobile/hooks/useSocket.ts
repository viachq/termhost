import { useRef, useCallback, useEffect } from "react";
import { useMobileStore } from "../store/mobileStore";
import type { ClientMessage, ServerMessage } from "../types";
import { wsUrl } from "../api";

type MessageHandler = (msg: ServerMessage) => void;

const PING_INTERVAL_MS = 4000;
const MAX_QUEUE = 500;

export function useSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const pingTimer = useRef<number | null>(null);
  const hostRef = useRef<string | null>(null);
  const attemptRef = useRef(0);
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

      const ws = new WebSocket(wsUrl(host));
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
