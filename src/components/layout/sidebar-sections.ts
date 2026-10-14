import { useCallback, useSyncExternalStore } from "react";

import type { Department } from "@/contracts/departments";

/**
 * Open / collapsed state of the sidebar sections, remembered per user on this device (localStorage,
 * every access guarded: private mode or blocked storage simply means "not remembered").
 */
/**
 * "retouch" = the Photo Retouch menu (PD-041). It replaced the old "production" id on purpose: that section used to be
 * secondary (collapsed for admins), the department menu starts open again for everyone.
 */
export type SidebarSectionId = "retouch" | "projects" | "knowledge" | "channels" | "dms";
export type SidebarSectionState = Partial<Record<SidebarSectionId, boolean>>;

const sectionIds: readonly SidebarSectionId[] = ["retouch", "projects", "knowledge", "channels", "dms"];
const keyPrefix = "nesso-work-sidebar-sections:";
export const sidebarSectionsKey = (userId: string) => `${keyPrefix}${userId}`;

/** Keeps only known section ids with boolean values (stored data may be stale or hand-edited). */
export const parseSectionState = (raw: string | null): SidebarSectionState => {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    const state: SidebarSectionState = {};
    for (const id of sectionIds) {
      const open = record[id];
      if (typeof open === "boolean") state[id] = open;
    }
    return state;
  } catch {
    return {};
  }
};

/**
 * Photo Retouch (the production module, PD-041) is that department's own menu: it starts expanded whenever the
 * department is shown (it is hidden otherwise). After the first toggle the choice is remembered.
 */
export const retouchSectionDefaultOpen = (current: Department | null) =>
  current === "PHOTO_RETOUCH";

export const isSectionOpen = (
  state: SidebarSectionState,
  id: SidebarSectionId,
  defaultOpen: boolean
) => state[id] ?? defaultOpen;

// --- Store ------------------------------------------------------------------------------------------

const empty: SidebarSectionState = {};
const cache = new Map<string, SidebarSectionState>();
const listeners = new Set<() => void>();

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

const read = (userId: string): SidebarSectionState => {
  const cached = cache.get(userId);
  if (cached) return cached;
  let state: SidebarSectionState = empty;
  try {
    state = parseSectionState(storage()?.getItem(sidebarSectionsKey(userId)) ?? null);
  } catch {
    state = empty;
  }
  cache.set(userId, state);
  return state;
};

const emit = () => listeners.forEach((listener) => listener());

export const setSidebarSectionOpen = (userId: string, id: SidebarSectionId, open: boolean) => {
  const next = { ...read(userId), [id]: open };
  cache.set(userId, next);
  try {
    storage()?.setItem(sidebarSectionsKey(userId), JSON.stringify(next));
  } catch {
    // Not persisted (quota / blocked storage): the in-memory state still applies to this tab.
  }
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  // Another tab toggled a section: drop the cache and re-read.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(keyPrefix)) {
      cache.clear();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};

/** `[open, setOpen]` for one sidebar section of the signed-in user (shared by rail, sidebar and drawer). */
export const useSidebarSection = (userId: string, id: SidebarSectionId, defaultOpen: boolean) => {
  const state = useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => empty
  );
  const setOpen = useCallback(
    (open: boolean) => setSidebarSectionOpen(userId, id, open),
    [userId, id]
  );
  return [isSectionOpen(state, id, defaultOpen), setOpen] as const;
};
