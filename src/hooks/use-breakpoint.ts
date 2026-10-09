import { useSyncExternalStore } from "react";

/**
 * Layout tiers (product §33):
 *   mobile  < 768px   single pane, drawer navigation, full-screen detail
 *   tablet  768–1279  icon-rail navigation, detail as overlay
 *   desktop ≥ 1280    three docked panels
 * One adaptive tree is rendered per tier — never hidden duplicates (§56).
 */
export type Breakpoint = "mobile" | "tablet" | "desktop";

const tabletQuery = "(min-width: 768px)";
const desktopQuery = "(min-width: 1280px)";

const read = (): Breakpoint => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "desktop";
  }
  if (window.matchMedia(desktopQuery).matches) {
    return "desktop";
  }
  return window.matchMedia(tabletQuery).matches ? "tablet" : "mobile";
};

const subscribe = (onChange: () => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const queries = [window.matchMedia(tabletQuery), window.matchMedia(desktopQuery)];
  queries.forEach((query) => query.addEventListener("change", onChange));
  return () => queries.forEach((query) => query.removeEventListener("change", onChange));
};

export const useBreakpoint = (): Breakpoint =>
  useSyncExternalStore(subscribe, read, () => "desktop");
