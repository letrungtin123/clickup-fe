// Applies the persisted theme before first paint (no light flash in dark mode). External file so a
// strict `script-src 'self'` CSP works. Mirrors src/stores/theme-store.ts + src/app/ThemeEffect.tsx.
(function () {
  try {
    var raw = window.localStorage.getItem("nesso-work-theme");
    var state = raw ? JSON.parse(raw).state || {} : {};
    var mode = state.mode === "light" || state.mode === "dark" ? state.mode : "system";
    var dark =
      mode === "dark" ||
      (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    if (typeof state.accentKey === "string") root.dataset.accent = state.accentKey;
    if (state.accentMode === "gradient" || state.accentMode === "solid")
      root.dataset.accentMode = state.accentMode;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();
