import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  defaultAccentKey,
  defaultAccentMode,
  getAccentKeyForMode,
  getAccentPalette,
  type AccentKey,
  type AccentMode
} from "../lib/theme-palettes.js";

export type ThemeMode = "light" | "dark" | "system";

type ThemeState = {
  mode: ThemeMode;
  accentMode: AccentMode;
  accentKey: AccentKey;
  setMode: (mode: ThemeMode) => void;
  setAccentMode: (accentMode: AccentMode) => void;
  setAccent: (accentKey: AccentKey) => void;
};

const isThemeMode = (mode: unknown): mode is ThemeMode => mode === "light" || mode === "dark" || mode === "system";

const isAccentMode = (mode: unknown): mode is AccentMode => mode === "solid" || mode === "gradient";

const mergeThemeState = (persistedState: unknown, currentState: ThemeState): ThemeState => {
  if (!persistedState || typeof persistedState !== "object") {
    return currentState;
  }

  const persisted = persistedState as Partial<ThemeState> & { accent?: unknown };
  const storedPalette = getAccentPalette(persisted.accentKey ?? persisted.accent);
  const accentMode = isAccentMode(persisted.accentMode)
    ? persisted.accentMode
    : storedPalette?.mode ?? defaultAccentMode;
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

