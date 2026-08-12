// The daemon serves the mobile page and injects window.__WS_TOKEN__ so the phone
// authenticates without the user typing anything. In `mobile:dev` (vite dev server,
// proxying /ws to the real daemon) that injection doesn't happen, so fall back to a
// `?token=` query param — open the dev URL once with the token and it just works.
// A third fallback covers pairing (see PairingScreen.tsx): once a device is
// approved, its per-device token is saved to localStorage so re-launching from
// the installed PWA's home-screen icon (which always opens the bare "/", no
// query string) still authenticates without re-pairing every time.
const PAIRED_TOKEN_KEY = "th-paired-token";
const TG_SESSION_KEY = "th-tg-session";

/** Telegram-auth session token, saved after /api/tg/login succeeds. */
export function readTgSession(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TG_SESSION_KEY) || "";
}

export function saveTgSession(session: string) {
  localStorage.setItem(TG_SESSION_KEY, session);
}

export function clearTgSession() {
  localStorage.removeItem(TG_SESSION_KEY);
}

function readDevToken(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

function readPairedToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(PAIRED_TOKEN_KEY) || "";
}

export function savePairedToken(token: string) {
  localStorage.setItem(PAIRED_TOKEN_KEY, token);
}

export const WS_TOKEN: string =
  (typeof window !== "undefined" && (window as any).__WS_TOKEN__) ||
  readDevToken() ||
  readPairedToken();

// Auth is resolved dynamically: a Telegram session may be saved AFTER module
// load (login happens at runtime), so it can't be a module-level constant.
function authParam(): string {
  const tg = readTgSession();
  if (tg) return `session=${encodeURIComponent(tg)}`;
  if (WS_TOKEN) return `token=${encodeURIComponent(WS_TOKEN)}`;
  return "";
}

/** Builds a `?...` query string with auth appended (or empty if none). */
export function apiQuery(params: Record<string, string> = {}): string {
  const parts = Object.entries(params).map(
    ([k, v]) => `${k}=${encodeURIComponent(v)}`
  );
  const a = authParam();
  if (a) parts.push(a);
  return parts.length ? `?${parts.join("&")}` : "";
}

// Match the page's own scheme — a page loaded over https:// must use wss://
// (browsers hard-block "insecure" ws:// from a secure page as mixed content;
// same rule for plain http:// fetches from an https:// page).
const isSecurePage = typeof window !== "undefined" && window.location.protocol === "https:";

/** `https://host` or `http://host`, matching the page's own scheme. */
export function apiOrigin(host: string): string {
  return `${isSecurePage ? "https" : "http"}://${host}`;
}

/** WebSocket URL with auth appended (resolved at call time). */
export function wsUrl(host: string): string {
  const scheme = isSecurePage ? "wss" : "ws";
  const a = authParam();
  return `${scheme}://${host}/ws${a ? `?${a}` : ""}`;
}

/** REST upload URL with optional target directory. */
export function uploadUrl(host: string, dir?: string): string {
  const params: Record<string, string> = {};
  if (dir) params.dir = dir;
  if (tokenParam) params.token = WS_TOKEN;
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const scheme = isSecurePage ? "https" : "http";
  return `${scheme}://${host}/api/upload${qs ? `?${qs}` : ""}`;
}

/** Uploads a file to the daemon. Returns the server path on success. */
export async function uploadFile(
  host: string,
  file: File,
  dir?: string
): Promise<string> {
  const url = uploadUrl(host, dir);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "X-Filename": encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || "Upload failed");
  }
  const data = await resp.json();
  return data.path as string;
}
