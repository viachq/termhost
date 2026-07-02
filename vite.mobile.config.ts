import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Vite's dev server always falls back to index.html at "/" regardless of
// build.rollupOptions.input (that only affects the production build) — so
// without this, the mobile dev server serves the DESKTOP entry (src/main.tsx,
// which calls @tauri-apps/api and crashes outside a real Tauri webview) at
// the root path. Rewrite "/" to "/mobile.html" so the URL people actually
// share (host:5173/) loads the right app.
function mobileEntryFallback(): Plugin {
  return {
    name: "mobile-entry-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/" || req.url?.startsWith("/?")) {
          req.url = req.url.replace("/", "/mobile.html");
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), mobileEntryFallback()],
  root: ".",
  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
    rollupOptions: {
      input: "mobile.html",
    },
    // Default inline limit (4KB) would emit the ~21KB webfont as a separate
    // file, breaking the single-HTML bundle the daemon serves from disk.
    assetsInlineLimit: 100_000,
  },
  server: {
    port: 5173,
    host: true,
    // Vite's DNS-rebinding guard blocks unrecognized Host headers by default.
    // ".ts.net" covers any Tailscale MagicDNS name so the phone can load this
    // dev server through `tailscale serve`.
    allowedHosts: [".ts.net"],
    // Dev mode mirrors how the desktop app runs (Tauri devUrl -> vite:dev):
    // the page itself is served live by Vite (HMR), while /ws and /api still
    // talk to the real daemon on 9090 (the daemon doesn't serve any files here).
    proxy: {
      "/ws": { target: "ws://127.0.0.1:9090", ws: true },
      "/api": { target: "http://127.0.0.1:9090", changeOrigin: true },
    },
  },
});
