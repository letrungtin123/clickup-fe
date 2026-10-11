import { useCallback, useSyncExternalStore } from "react";

/**
 * True while `query` matches (e.g. "(min-width: 1024px)"). For layout decisions that change which tree
 * is mounted (one adaptive tree per tier, never hidden duplicates); pure styling uses Tailwind variants.
 */
export const useMediaQuery = (query: string, fallback = false): boolean => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : fallback),
    () => fallback
  );
};
