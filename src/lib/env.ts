const readEnv = (key: string, fallback: string) => {
  const value: unknown = import.meta.env[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
};

export const webEnv = {
  apiBaseUrl: readEnv("VITE_API_BASE_URL", "http://127.0.0.1:3890/api/v1")
};
