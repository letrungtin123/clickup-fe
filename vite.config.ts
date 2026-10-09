import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const vendorChunk = (id: string) => {
  const normalizedId = id.replace(/\\/g, "/");
  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  if (/\/node_modules\/(react|react-dom|scheduler|react-router)\//.test(normalizedId)) {
    return "react";
  }

  if (
    /\/node_modules\/(@tanstack\/query-core|@tanstack\/react-query|zod|zustand)\//.test(
      normalizedId
    )
  ) {
    return "data";
  }

  // Base UI, motion, dnd-kit etc. are left to the bundler so each lazy route only loads what it uses.
  return undefined;
};

/**
 * Paths with dot segments or encoded separators are refused before proxying: the upstream gateway
 * normalises them, so "/storage/v1/object/sign/../../x" would otherwise escape the allowed prefix
 * (security audit SEC-INF-01). Only the path is checked; signed tokens live in the query string.
 */
const unsafeProxyPath = (url: string | undefined) => {
  const path = (url ?? "").split("?")[0] ?? "";
  return /(^|\/)(\.|%2e){2}(\/|$)|%2f|%5c|%25|\\/i.test(path);
};

/** Images may render inline; every other stored file is a download and can never run as a page (SEC-INF-03). */
const inlineImageType = /^image\/(png|jpe?g|gif|webp|avif)(;|$)/i;

export default defineConfig(({ mode }) => {
  /** The API runs on its own port; the SPA talks to it same-origin through this proxy in dev. */
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.DEV_API_TARGET || "http://127.0.0.1:3890";
  /** Signed storage URLs are same-origin paths (/storage/v1/...), so any host name of the app works. */
  const storageTarget = env.DEV_STORAGE_TARGET || "http://127.0.0.1:56321";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: vendorChunk
        }
      }
    },
    server: {
      host: "127.0.0.1",
      port: 5890,
      strictPort: true,
      // Extra host names the dev server answers to (e.g. a DNS name pointing at this machine),
      // comma-separated in DEV_ALLOWED_HOSTS; IPs and localhost are always allowed.
      allowedHosts: (env.DEV_ALLOWED_HOSTS ?? "")
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean),
      // xfwd appends the real client address, so the API (trusting exactly one proxy hop)
      // never rate-limits on a client-supplied X-Forwarded-For.
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: false,
          xfwd: true,
          bypass: (req) => (unsafeProxyPath(req.url) ? false : undefined)
        },
        "/socket.io": {
          target: apiTarget,
          ws: true,
          changeOrigin: false,
          xfwd: true
        },
        // Only the signed object routes; the app's session cookies and CSRF header never reach storage.
        "^/storage/v1/object/(upload/sign|sign)/": {
          target: storageTarget,
          changeOrigin: true,
          bypass: (req) => (unsafeProxyPath(req.url) ? false : undefined),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              // Signed URLs carry their own token: never forward app cookies, CSRF or client credentials.
              for (const header of ["cookie", "x-csrf-token", "authorization", "apikey"]) {
                proxyReq.removeHeader(header);
              }
            });
            proxy.on("proxyRes", (proxyRes) => {
              proxyRes.headers["x-content-type-options"] = "nosniff";
              proxyRes.headers["content-security-policy"] = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";
              const type = String(proxyRes.headers["content-type"] ?? "");
              const disposition = String(proxyRes.headers["content-disposition"] ?? "");
              if (!inlineImageType.test(type) && !/^attachment/i.test(disposition)) {
                proxyRes.headers["content-disposition"] = disposition ? disposition.replace(/^inline/i, "attachment") : "attachment";
              }
            });
          }
        }
      }
    },
    preview: {
      host: "127.0.0.1",
      port: 5890,
      strictPort: true
    }
  };
});
