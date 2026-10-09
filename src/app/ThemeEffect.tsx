import { useLayoutEffect } from "react";

import { useResolvedTheme, useThemeStore } from "@/stores/theme-store";

/** Mirrors the theme store onto <html> data attributes consumed by styles.css. */
export const ThemeEffect = () => {
  const resolved = useResolvedTheme();
  const accentMode = useThemeStore((state) => state.accentMode);
  const accentKey = useThemeStore((state) => state.accentKey);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.accentMode = accentMode;
    root.dataset.accent = accentKey;
  }, [accentKey, accentMode, resolved]);

  return null;
};
