import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

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
  plugins: [react(), mobileEntryFallback()],
  root: ".",
  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
    rollupOptions: {
      input: "mobile.html",
    },
    // Keep CSS as <style> inline but emit JS as a separate chunk so the
    // inline <script type="module"> approach doesn't hit </script> issues.
    assetsInlineLimit: 100_000,
    cssCodeSplit: false,
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: [".ts.net"],
    proxy: {
      "/ws": { target: "ws://127.0.0.1:9090", ws: true },
      "/api": { target: "http://127.0.0.1:9090", changeOrigin: true },
    },
  },
});
