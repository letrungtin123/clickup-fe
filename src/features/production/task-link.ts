import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * `?ptask=<id>` opens a production task in the side sheet on any production page. Not `task`:
 * that one drives the app-wide (work-management) task panel, which would open over it.
 */
export const TASK_PARAM = "ptask";

export const useOpenTask = () => {
  const [, setParams] = useSearchParams();
  return useCallback(
    (taskId: string) =>
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.set(TASK_PARAM, taskId);
        return next;
      }),
    [setParams]
  );
};
