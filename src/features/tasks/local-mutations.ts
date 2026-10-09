/**
 * Tasks this tab changed recently. The API response of our own mutation already reconciled every
 * cache, so the `task:changed` echo for it needs no GET /tasks/:id (PERF-07). Events by the same user
 * from another tab or device are still applied: only ids this tab touched are remembered.
 */

export const localEchoWindowMs = 15_000;
const maxEntries = 300;

const recent = new Map<string, number>();

export const markLocalTaskMutation = (taskId: string, now: number = Date.now()) => {
  recent.delete(taskId);
  recent.set(taskId, now);
  if (recent.size > maxEntries) {
    for (const [id, at] of recent) {
      if (recent.size <= maxEntries && now - at <= localEchoWindowMs) break;
      recent.delete(id);
    }
  }
};

/** Was `taskId` changed by this tab within the echo window? */
export const isLocalTaskEcho = (taskId: string, now: number = Date.now()) => {
  const at = recent.get(taskId);
  return at !== undefined && now - at <= localEchoWindowMs;
};

export const clearLocalTaskMutations = () => recent.clear();
