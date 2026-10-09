import { useSyncExternalStore } from "react";

/**
 * Touch-first devices (phones, tablets without a mouse): no hover, coarse pointer. Used where
 * behaviour — not just styling — differs: hover toolbars become long-press sheets, Enter inserts a
 * newline instead of sending. Pure styling should use Tailwind's `pointer-coarse:` variant instead.
 */
const touchQuery = "(hover: none) and (pointer: coarse)";

const read = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(touchQuery).matches
    : false;

const subscribe = (onChange: () => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const query = window.matchMedia(touchQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export const useTouchPrimary = (): boolean => useSyncExternalStore(subscribe, read, () => false);
