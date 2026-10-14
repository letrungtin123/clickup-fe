import type { Department } from "@/contracts/departments";
import { onSessionEnd } from "@/lib/session-cleanup";

import { departmentStorageKey, parseStoredDepartment } from "./model";

/**
 * The current department chosen in this tab, per user. localStorage is only a fast cache for the next visit (every
 * access guarded: private mode or blocked storage simply means "not remembered"). Other tabs are deliberately not
 * followed: two tabs may show different departments without pulling each other back and forth.
 */

const memory = new Map<string, Department | null>();
const listeners = new Set<() => void>();

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const readStoredDepartment = (userId: string): Department | null => {
  if (memory.has(userId)) return memory.get(userId) ?? null;
  let value: Department | null = null;
  try {
    value = parseStoredDepartment(storage()?.getItem(departmentStorageKey(userId)));
  } catch {
    value = null;
  }
  memory.set(userId, value);
  return value;
};

export const writeStoredDepartment = (userId: string, department: Department | null) => {
  memory.set(userId, department);
  try {
    const store = storage();
    if (department) store?.setItem(departmentStorageKey(userId), department);
    else store?.removeItem(departmentStorageKey(userId));
  } catch {
    // Not persisted (quota / blocked storage): the in-memory choice still applies to this tab.
  }
  listeners.forEach((listener) => listener());
};

export const subscribeDepartment = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// The next session (possibly another account in this tab) starts from storage and the server again.
onSessionEnd(() => memory.clear());
