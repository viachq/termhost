import { useRef, useCallback, useEffect } from "react";
import { useMobileStore } from "../store/mobileStore";
import type { ClientMessage, ServerMessage } from "../types";

type MessageHandler = (msg: ServerMessage) => void;

export function useSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const { setConnection } = useMobileStore();

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnection("disconnected");
  }, [setConnection]);

  const connect = useCallback(
    (host: string) => {
      disconnect();
      setConnection("connecting");

      const ws = new WebSocket(`ws://${host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnection("connected");
        ws.send(JSON.stringify({ type: "list_workspaces" }));
      };

      ws.onmessage = (e) => {
        try {
          const msg: ServerMessage = JSON.parse(e.data);
          onMessage(msg);
        } catch {}
      };

      ws.onclose = () => {
        setConnection("disconnected");
        wsRef.current = null;
        reconnectTimer.current = window.setTimeout(() => {
          connect(host);
        }, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    },
    [disconnect, setConnection, onMessage]
  );

  useEffect(() => {
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { connect, disconnect, send };
}
