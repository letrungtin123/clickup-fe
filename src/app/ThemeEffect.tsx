import { useEffect } from "react";

import { useThemeStore } from "../stores/theme-store.js";

export const ThemeEffect = () => {
  const mode = useThemeStore((state) => state.mode);
  const accentMode = useThemeStore((state) => state.accentMode);
  const accentKey = useThemeStore((state) => state.accentKey);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const resolved = mode === "system" ? (media.matches ? "dark" : "light") : mode;
      root.dataset.theme = resolved;
      root.dataset.accentMode = accentMode;
      root.dataset.accent = accentKey;
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [accentKey, accentMode, mode]);

  return null;
};
