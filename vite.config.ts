import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          const normalizedId = id.replace(/\\/g, "/");
          if (!normalizedId.includes("/node_modules/")) {
            return undefined;
          }

          if (
            normalizedId.includes("/node_modules/react/") ||
            normalizedId.includes("/node_modules/react-dom/") ||
            normalizedId.includes("/node_modules/react-router/")
          ) {
            return "react";
          }

          if (
            normalizedId.includes("/node_modules/@tanstack/react-query/") ||
            normalizedId.includes("/node_modules/zod/") ||
            normalizedId.includes("/node_modules/zustand/")
          ) {
            return "query";
          }

          if (
            normalizedId.includes("/node_modules/lucide-react/") ||
            normalizedId.includes("/node_modules/motion/")
          ) {
            return "ui";
          }

          return undefined;
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5890,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 5890,
    strictPort: true
  }
});
