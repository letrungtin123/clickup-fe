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
      // xfwd appends the real client address, so the API (trusting exactly one proxy hop)
      // never rate-limits on a client-supplied X-Forwarded-For.
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: false,
          xfwd: true
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
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.removeHeader("cookie");
              proxyReq.removeHeader("x-csrf-token");
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
