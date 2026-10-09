import type { QueryClient } from "@tanstack/react-query";

import { TaskSummarySchema, type TaskDetail } from "@/contracts/work";
import { qk } from "@/lib/query-keys";

import { tasksApi } from "./api";
import { reconcileTask } from "./cache";
import { markLocalTaskMutation } from "./local-mutations";

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Re-reads one task after a change whose counters the client cannot compute exactly (attachments
 * added through comments, deleted comments with replies…) and reconciles its row everywhere
 * (BUG-WK-19). Debounced per task so a burst of uploads costs one GET /tasks/:id.
 */
export const refreshTaskSummary = (client: QueryClient, taskId: string, selfId: string, delayMs = 400) => {
  const pending = timers.get(taskId);
  if (pending) clearTimeout(pending);
  timers.set(
    taskId,
    setTimeout(() => {
      timers.delete(taskId);
      void (async () => {
        let detail: TaskDetail;
        try {
          detail = await tasksApi.get(taskId);
        } catch {
          return; // the realtime path / next refetch reconciles it
        }
        if (client.getQueryData(qk.task(taskId))) client.setQueryData(qk.task(taskId), detail);
        reconcileTask(client, TaskSummarySchema.parse(detail), { selfId });
        markLocalTaskMutation(taskId);
      })();
    }, delayMs)
  );
};
