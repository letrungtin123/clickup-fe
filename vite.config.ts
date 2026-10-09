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
  const apiTarget = loadEnv(mode, process.cwd(), "").DEV_API_TARGET || "http://127.0.0.1:3890";

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
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: false
        },
        "/socket.io": {
          target: apiTarget,
          ws: true,
          changeOrigin: false
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
