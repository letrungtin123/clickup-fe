import { useCallback, useState } from "react";

import type { TaskStatus } from "@/contracts/work";

const storageKey = (scope: string) => `nesso.tasks.collapsed.${scope}`;

const read = (scope: string): Record<string, boolean> => {
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
};

/**
 * Collapsed status groups per list, remembered in localStorage. By default only open-work groups
 * are expanded (done / closed groups start collapsed to keep the list focused).
 */
export const useCollapsedGroups = (scope: string) => {
  const [overrides, setOverrides] = useState(() => read(scope));
  const [loadedScope, setLoadedScope] = useState(scope);
  if (loadedScope !== scope) {
    setLoadedScope(scope);
    setOverrides(read(scope));
  }

  const isCollapsed = useCallback(
    (status: Pick<TaskStatus, "id" | "category">) => overrides[status.id] ?? status.category !== "active",
    [overrides]
  );

  const toggle = useCallback(
    (status: Pick<TaskStatus, "id" | "category">) =>
      setOverrides((current) => {
        const next = { ...current, [status.id]: !(current[status.id] ?? status.category !== "active") };
        try {
          window.localStorage.setItem(storageKey(scope), JSON.stringify(next));
        } catch {
          // Storage may be unavailable (private mode); the state still works for this session.
        }
        return next;
      }),
    [scope]
  );

  const expand = useCallback(
    (status: Pick<TaskStatus, "id" | "category">) => {
      if (isCollapsed(status)) toggle(status);
    },
    [isCollapsed, toggle]
  );

  return { isCollapsed, toggle, expand };
};
