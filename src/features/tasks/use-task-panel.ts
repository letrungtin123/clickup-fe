import { useCallback } from "react";
import { useSearchParams } from "react-router";

/** Search param that drives the right-hand detail panel: `?task=<taskId>`. */
export const TASK_PANEL_PARAM = "task";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route-driven task detail panel. Opening pushes a history entry, so browser/OS "back" closes the
 * panel (mobile full-screen detail → back → list). Works on any route, deep-linkable.
 */
export const useTaskPanel = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get(TASK_PANEL_PARAM);
  const taskId = raw && uuidPattern.test(raw) ? raw : null;

  const openTask = useCallback(
    (id: string, options: { replace?: boolean } = {}) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set(TASK_PANEL_PARAM, id);
          return next;
        },
        { replace: options.replace ?? false }
      ),
    [setParams]
  );

  const closeTask = useCallback(
    () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete(TASK_PANEL_PARAM);
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  return { taskId, openTask, closeTask };
};

/** href for a task inside its list, with the panel open (search results, notifications, links). */
export const taskHref = (task: { id: string; projectId: string; listId: string }) =>
  `/p/${task.projectId}/l/${task.listId}?${TASK_PANEL_PARAM}=${task.id}`;
