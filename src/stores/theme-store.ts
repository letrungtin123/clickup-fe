import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  defaultAccentKey,
  defaultAccentMode,
  getAccentKeyForMode,
  getAccentPalette,
  type AccentKey,
  type AccentMode
} from "@/lib/theme-palettes";

export type ThemeMode = "light" | "dark" | "system";

type ThemeState = {
  mode: ThemeMode;
  accentMode: AccentMode;
  accentKey: AccentKey;
  setMode: (mode: ThemeMode) => void;
  setAccentMode: (accentMode: AccentMode) => void;
  setAccent: (accentKey: AccentKey) => void;
};

const isThemeMode = (mode: unknown): mode is ThemeMode =>
  mode === "light" || mode === "dark" || mode === "system";

const isAccentMode = (mode: unknown): mode is AccentMode => mode === "solid" || mode === "gradient";

const mergeThemeState = (persistedState: unknown, currentState: ThemeState): ThemeState => {
  if (!persistedState || typeof persistedState !== "object") {
    return currentState;
  }

  const persisted = persistedState as Partial<ThemeState> & { accent?: unknown };
  const storedPalette = getAccentPalette(persisted.accentKey ?? persisted.accent);
  const accentMode = isAccentMode(persisted.accentMode)
    ? persisted.accentMode
    : (storedPalette?.mode ?? defaultAccentMode);
  const accentKey = getAccentKeyForMode(accentMode, storedPalette?.key ?? persisted.accentKey);

  return {
    ...currentState,
    mode: isThemeMode(persisted.mode) ? persisted.mode : currentState.mode,
    accentMode,
    accentKey
  };
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "system",
      accentMode: defaultAccentMode,
      accentKey: defaultAccentKey,
      setMode: (mode) => set({ mode }),
      setAccentMode: (accentMode) =>
        set((state) => ({
          accentMode,
          accentKey: getAccentKeyForMode(accentMode, state.accentKey)
        })),
      setAccent: (accentKey) => {
        const palette = getAccentPalette(accentKey);
        if (!palette) {
          return;
        }

        set({
          accentMode: palette.mode,
          accentKey: palette.key
        });
      }
    }),
    {
      name: "nesso-work-theme",
      merge: mergeThemeState,
      version: 2
    }
  )
);

const darkQuery = "(prefers-color-scheme: dark)";

const subscribeSystemTheme = (onChange: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => undefined;
  }
  const media = window.matchMedia(darkQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const getSystemPrefersDark = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(darkQuery).matches;

export type ResolvedTheme = "light" | "dark";

/** Effective light/dark theme: the user's explicit choice, or the OS preference for "system". */
export const useResolvedTheme = (): ResolvedTheme => {
  const mode = useThemeStore((state) => state.mode);
  const systemDark = useSyncExternalStore(subscribeSystemTheme, getSystemPrefersDark, () => false);
  if (mode === "system") {
    return systemDark ? "dark" : "light";
  }
  return mode;
};
