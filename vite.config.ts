import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const vendorChunk = (id: string) => {
  const normalizedId = id.replace(/\\/g, "/");
  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  if (/\/node_modules\/(react|react-dom|scheduler|react-router)\//.test(normalizedId)) {
    return "react";
  }

  // No manual "data" group (TanStack Query, zod, zustand): rolldown then hoisted its CJS interop helpers into an
  // app chunk that imports zod back, a static import cycle that crashed the app at start-up ("t is not a function").
  // Those libraries are shared by almost every route, so the bundler keeps them in common chunks on its own.

  // Every lucide icon is its own tiny module: one cacheable chunk instead of dozens of requests (PERF-16).
  if (/\/node_modules\/lucide-react\//.test(normalizedId)) {
    return "icons";
  }

  // Base UI, motion, dnd-kit etc. are left to the bundler so each lazy route only loads what it uses.
  return undefined;
};

/**
 * Fails the build on a static import cycle between output chunks: in a cycle one chunk is evaluated before the
 * other has run, so shared helpers it imports are still undefined and the app crashes at start-up.
 */
const noChunkCycles = (): Plugin => ({
  name: "nesso:no-chunk-cycles",
  apply: "build",
  generateBundle(_options, bundle) {
    const graph = new Map<string, string[]>();
    for (const [name, item] of Object.entries(bundle)) {
      if (item.type === "chunk") graph.set(name, item.imports);
    }
    const state = new Map<string, "visiting" | "done">();
    const cycles: string[] = [];
    const visit = (name: string, path: string[]) => {
      if (state.get(name) === "done") return;
      if (state.get(name) === "visiting") {
        cycles.push([...path.slice(path.indexOf(name)), name].join(" → "));
        return;
      }
      state.set(name, "visiting");
      for (const next of graph.get(name) ?? []) visit(next, [...path, name]);
      state.set(name, "done");
    };
    for (const name of graph.keys()) visit(name, []);
    if (cycles.length > 0) this.error(`Static import cycle between chunks: ${cycles.join("; ")}`);
  }
});

/**
 * Paths with dot segments or encoded separators are refused before proxying: the upstream gateway
 * normalises them, so "/storage/v1/object/sign/../../x" would otherwise escape the allowed prefix
 * (security audit SEC-INF-01). Only the path is checked; signed tokens live in the query string.
 */
const unsafeProxyPath = (url: string | undefined) => {
  const path = (url ?? "").split("?")[0] ?? "";
  return /(^|\/)(\.|%2e){2}(\/|$)|%2f|%5c|%25|\\/i.test(path);
};

/**
 * Security headers for `vite preview` (SEC-INF-07). The production reverse proxy should send the same
 * set. connect-src: same-origin API + Socket.IO (ws/wss) and the pinned emoji data on jsDelivr
 * (SEC-INF-15); images may be data:/blob: (upload previews) or same-origin signed storage URLs.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

const securityHeaders: Record<string, string> = {
  "Content-Security-Policy": contentSecurityPolicy,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

/** Hashed build files never change under their name: cached for a year at the edge and in browsers. */
const immutableAsset = "public, max-age=31536000, immutable";

/**
 * The stable build behind Cloudflare (owner, 2026-10-20: "click sidebar đôi khi không ăn"). sirv answered every hashed
 * file under /assets with `Cache-Control: no-cache`, so Cloudflare revalidated each of the ~140 chunks of a page with
 * this machine on every load; in those bursts some origin requests stalled 5–20 s and a click waiting for its lazy
 * route chunk looked dead. /assets now says "immutable" (200 / 304, never an HTML fallback), so the edge and the
 * browser keep them; index.html stays no-cache, so a deploy is still noticed (update notice). Node's 5 s keep-alive
 * also raced Cloudflare reusing idle origin connections: they now stay open longer than the proxy keeps them.
 */
const previewCaching = (): Plugin => ({
  name: "nesso:preview-caching",
  configurePreviewServer(server) {
    const http = server.httpServer;
    if (http && "keepAliveTimeout" in http) {
      http.keepAliveTimeout = 905_000;
      http.headersTimeout = 910_000;
    }
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith("/assets/")) {
        next();
        return;
      }
      const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => typeof res;
      res.writeHead = (statusCode: number, ...rest: unknown[]) => {
        const headers = rest.find(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null && !Array.isArray(item)
        );
        const typeKey = headers
          ? Object.keys(headers).find((key) => key.toLowerCase() === "content-type")
          : undefined;
        const typeValue = headers && typeKey ? headers[typeKey] : res.getHeader("content-type");
        const type = typeof typeValue === "string" ? typeValue : "";
        if ((statusCode === 200 || statusCode === 304) && !type.includes("text/html")) {
          for (const key of Object.keys(headers ?? {})) {
            if (key.toLowerCase() === "cache-control") delete headers?.[key];
          }
          res.setHeader("Cache-Control", immutableAsset);
        }
        return writeHead(statusCode, ...rest);
      };
      next();
    });
  }
});

/** Images may render inline; every other stored file is a download and can never run as a page (SEC-INF-03). */
const inlineImageType = /^image\/(png|jpe?g|gif|webp|avif)(;|$)/i;

export default defineConfig(({ mode }) => {
  /** The API runs on its own port; the SPA talks to it same-origin through this proxy in dev. */
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.DEV_API_TARGET || "http://127.0.0.1:3890";
  /** Signed storage URLs are same-origin paths (/storage/v1/...), so any host name of the app works. */
  const storageTarget = env.DEV_STORAGE_TARGET || "http://127.0.0.1:56321";

  return {
    plugins: [react(), tailwindcss(), noChunkCycles(), previewCaching()],
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
      strictPort: true,
      headers: securityHeaders
    }
  };
});
