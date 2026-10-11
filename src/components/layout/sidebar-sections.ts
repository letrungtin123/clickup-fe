import { useCallback, useSyncExternalStore } from "react";

/**
 * Open / collapsed state of the sidebar sections, remembered per user on this device (localStorage,
 * every access guarded: private mode or blocked storage simply means "not remembered").
 */
export type SidebarSectionId = "production" | "projects" | "knowledge" | "channels" | "dms";
export type SidebarSectionState = Partial<Record<SidebarSectionId, boolean>>;

const sectionIds: readonly SidebarSectionId[] = ["production", "projects", "knowledge", "channels", "dms"];
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
 * Production ("Sản xuất") starts expanded for people whose work is production — anyone holding an
 * explicit production role. Organization admins only see the module through their implicit ADMIN
 * (PD-011), so for them it starts collapsed; after the first toggle the choice is remembered.
 */
export const productionSectionDefaultOpen = (explicitProductionRoles: readonly string[]) =>
  explicitProductionRoles.length > 0;

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
