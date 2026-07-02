// The daemon serves the mobile page and injects window.__WS_TOKEN__ so the phone
// authenticates without the user typing anything. In `mobile:dev` (vite dev server,
// proxying /ws to the real daemon) that injection doesn't happen, so fall back to a
// `?token=` query param — open the dev URL once with the token and it just works.
function readDevToken(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

export const WS_TOKEN: string =
  (typeof window !== "undefined" && (window as any).__WS_TOKEN__) ||
  readDevToken();

const tokenParam = WS_TOKEN ? `token=${encodeURIComponent(WS_TOKEN)}` : "";

/** Builds a `?...` query string with the token appended (or empty if none). */
export function apiQuery(params: Record<string, string> = {}): string {
  const parts = Object.entries(params).map(
    ([k, v]) => `${k}=${encodeURIComponent(v)}`
  );
  if (tokenParam) parts.push(tokenParam);
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

/** WebSocket URL with token appended. */
export function wsUrl(host: string): string {
  const scheme = isSecurePage ? "wss" : "ws";
  return `${scheme}://${host}/ws${tokenParam ? `?${tokenParam}` : ""}`;
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
