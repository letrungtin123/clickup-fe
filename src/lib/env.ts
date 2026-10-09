const readEnv = (key: string, fallback: string) => {
  const value: unknown = import.meta.env[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const webEnv = {
  /** Same-origin by default (Vite proxies /api in dev; a reverse proxy does it in production). */
  apiBaseUrl: trimTrailingSlash(readEnv("VITE_API_BASE_URL", "/api/v1")),
  /** Socket.IO origin. Empty string = same origin as the SPA. */
  realtimeUrl: trimTrailingSlash(readEnv("VITE_REALTIME_URL", "")),
  realtimePath: readEnv("VITE_REALTIME_PATH", "/socket.io")
};
