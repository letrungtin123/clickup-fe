import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router";

import { FOCUS_REFRESH_MS, forgetTab, markBlurred, markFocused, pruneClaims } from "./election";
import {
  PREFS_CHANGED_EVENT,
  PREFS_KEY,
  PROMPT_SNOOZE_KEY,
  isPromptSnoozed,
  readItem,
  readPrefs,
  safeStorage,
  type DesktopPrefs
} from "./storage";
import {
  PERMISSION_CHANGED_EVENT,
  browserDesktopSupport,
  readDesktopPermission,
  type DesktopPermission,
  type DesktopSupport
} from "./support";

/** This page load's id in the cross-tab protocols (a duplicated tab gets its own). */
export const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Fixed for the page's lifetime (secure context, device and API do not change while it runs). */
let support: DesktopSupport | null = null;
export const getDesktopSupport = (): DesktopSupport => (support ??= browserDesktopSupport());

// Permission ------------------------------------------------------------------------------------

const subscribePermission = (onChange: () => void) => {
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener(PERMISSION_CHANGED_EVENT, onChange);
  let status: PermissionStatus | null = null;
  let disposed = false;
  // Chrome / Edge / Firefox announce changes made from the padlock menu.
  try {
    navigator.permissions
      ?.query({ name: "notifications" })
      .then((result) => {
        if (disposed) return;
        status = result;
        result.addEventListener("change", onChange);
      })
      .catch(() => undefined);
  } catch {
    // permissions.query unsupported for "notifications": focus / visibility keep it fresh.
  }
  return () => {
    disposed = true;
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener(PERMISSION_CHANGED_EVENT, onChange);
    status?.removeEventListener("change", onChange);
  };
};

export const useDesktopPermission = (): DesktopPermission =>
  useSyncExternalStore(subscribePermission, readDesktopPermission, () => "unsupported");

// Per-device preferences ---------------------------------------------------------------------------

const subscribePrefs = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === PREFS_KEY || event.key === PROMPT_SNOOZE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(PREFS_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PREFS_CHANGED_EVENT, onChange);
  };
};

// useSyncExternalStore needs a stable snapshot: re-parse only when the stored string changes.
let prefsRaw: string | null | undefined;
let prefsSnapshot: DesktopPrefs | null = null;
const readPrefsSnapshot = (): DesktopPrefs => {
  const storage = safeStorage();
  const raw = readItem(storage, PREFS_KEY);
  if (prefsSnapshot === null || raw !== prefsRaw) {
    prefsRaw = raw;
    prefsSnapshot = readPrefs(storage);
  }
  return prefsSnapshot;
};

export const useDesktopPrefs = (): DesktopPrefs => useSyncExternalStore(subscribePrefs, readPrefsSnapshot);

/** "Để sau" is active (re-read on storage changes; a snooze running out shows the prompt on the next change / load). */
export const usePromptSnoozed = (): boolean =>
  useSyncExternalStore(subscribePrefs, () => isPromptSnoozed(Date.now()));

// Focus record ------------------------------------------------------------------------------------

const inFront = () => document.visibilityState === "visible" && document.hasFocus();

/**
 * Publishes "this tab is in front, on this path" for the other tabs (election.ts), while this tab keeps the focus.
 */
export const useFocusBeacon = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (inFront()) markFocused(safeStorage(), TAB_ID, pathname, Date.now());
  }, [pathname]);

  useEffect(() => {
    const storage = safeStorage();
    const path = () => window.location.pathname;
    const sync = () => {
      if (inFront()) markFocused(storage, TAB_ID, path(), Date.now());
      else markBlurred(storage, TAB_ID, Date.now());
    };
    const onBlur = () => markBlurred(storage, TAB_ID, Date.now());
    const onPageHide = () => forgetTab(storage, TAB_ID);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", onPageHide);
    const refresh = setInterval(() => {
      if (inFront()) markFocused(storage, TAB_ID, path(), Date.now());
    }, FOCUS_REFRESH_MS);
    pruneClaims(storage, Date.now());
    const prune = setInterval(() => pruneClaims(storage, Date.now()), 5 * 60_000);
    sync();
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", onPageHide);
      clearInterval(refresh);
      clearInterval(prune);
      forgetTab(storage, TAB_ID);
    };
  }, []);
};

export { inFront as isTabInFront };
