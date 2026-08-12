import { useEffect, useRef, useState } from "react";
import { apiOrigin, saveTgSession } from "../api";

interface Props {
  host: string;
  /** Called after a session is saved — parent should (re)connect. */
  onAuthed: () => void;
}

interface TgStatus {
  enabled: boolean;
  bot_username?: string;
}

/**
 * Telegram login gate. Shown when the daemon has Telegram auth enabled and
 * this device has no session yet:
 *  - inside Telegram (Mini App): `Telegram.WebApp.initData` is used directly,
 *    login happens automatically on mount;
 *  - in a regular browser: the official Telegram Login Widget is injected;
 *    its auth payload is reconstructed into initData form (same signature
 *    algorithm) and sent to /api/tg/login.
 * If the daemon reports auth disabled, renders nothing — the caller falls
 * through to the classic pairing flow.
 */
export function TgFlow({ host, onAuthed }: Props) {
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiOrigin(host)}/api/tg/status`)
      .then((r) => r.json())
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus({ enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, [host]);

  const doLogin = async (initData: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${apiOrigin(host)}/api/tg/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      const d = await res.json();
      if (res.ok && d.session) {
        saveTgSession(d.session);
        onAuthed();
        return;
      }
      setError(
        d.error === "not allowed"
          ? "This Telegram account isn't in the allowed list"
          : d.error === "disabled"
          ? "Telegram auth is off on the daemon"
          : "Login failed — try again"
      );
    } catch {
      setError("Couldn't reach the daemon");
    }
    doneRef.current = false;
    setBusy(false);
  };

  // Mini App path: initData exists the moment the page loads inside Telegram.
  useEffect(() => {
    if (!status?.enabled) return;
    const w = (window as any).Telegram?.WebApp;
    if (w?.initData) {
      w.ready?.(); // tell Telegram the app is rendered
      w.expand?.(); // use the full viewport height
      doLogin(w.initData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.enabled]);

  // Browser path: inject the official Login Widget. The script reads its own
  // data-* attributes, so creating it dynamically works exactly like a static
  // tag. The onauth callback receives the signed user object.
  useEffect(() => {
    if (!status?.enabled) return;
    if ((window as any).Telegram?.WebApp?.initData) return; // TMA path above
    if (!status.bot_username) return;

    (window as any).onTelegramAuth = (user: any) => {
      const fields: Record<string, any> = { ...user };
      const hash = fields.hash;
      delete fields.hash;
      const pairs = Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .sort();
      doLogin(pairs.join("&") + `&hash=${encodeURIComponent(String(hash))}`);
    };

    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-login.js";
    s.async = true;
    s.dataset.telegramLogin = status.bot_username;
    s.dataset.size = "large";
    s.dataset.onauth = "onTelegramAuth(user)";
    const container = document.getElementById("tg-login-widget");
    if (container) {
      container.innerHTML = ""; // avoid duplicate widgets on re-render
      container.appendChild(s);
    } else {
      document.body.appendChild(s);
    }
    return () => {
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!status) {
    return <p className="m-connect-desc">Checking auth…</p>;
  }
  if (!status.enabled) {
    return null; // fall through to the classic pairing flow
  }

  const inTma = Boolean((window as any).Telegram?.WebApp?.initData);

  return (
    <div>
      <p className="m-connect-desc">
        {inTma
          ? "Signing in with Telegram…"
          : "Sign in with Telegram to access your PC"}
      </p>
      <div
        id="tg-login-widget"
        style={{
          display: "flex",
          justifyContent: "center",
          margin: "16px 0",
        }}
      />
      {busy && <p className="m-connect-desc">Signing in…</p>}
      {error && (
        <p className="m-connect-desc" style={{ color: "#e05050" }}>
          {error}
        </p>
      )}
      {!inTma && !status.bot_username && (
        <p className="m-connect-desc" style={{ color: "#e05050" }}>
          Daemon has Telegram auth on but no bot username configured.
        </p>
      )}
    </div>
  );
}
