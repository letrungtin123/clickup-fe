import type { QueryClient } from "@tanstack/react-query";
import { TaskSummarySchema, type TaskDetail } from "@/contracts/work";
import type { TaskChangedEvent } from "@/contracts/realtime";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/query-keys";
import { scheduleInvalidate } from "@/lib/realtime/socket";
import { tasksApi } from "./api";
import { reconcileTask, removeTaskEverywhere } from "./cache";

/** Above this many distinct tasks in one burst (bulk edits, imports) one refetch is cheaper than N fetches. */
export const maxTargetedFetches = 25;

export type PendingTaskChange = { event: TaskChangedEvent; moved: boolean };

/**
 * Applies `task:changed` events by fetching only the changed task and patching it into every cached
 * list, board, table, My Tasks and detail — never refetching whole project listings per event.
 */
export const applyTaskChanges = async (client: QueryClient, batch: PendingTaskChange[], selfId: string) => {
  const byProject = new Map<string, PendingTaskChange[]>();
  for (const item of batch) {
    byProject.set(item.event.projectId, [...(byProject.get(item.event.projectId) ?? []), item]);
  }
  for (const [projectId, items] of byProject) {
    if (items.length > maxTargetedFetches) {
      scheduleInvalidate(qk.tasks(projectId));
      scheduleInvalidate(qk.myTasks());
      for (const { event } of items) scheduleInvalidate(qk.task(event.taskId), true);
      continue;
    }
    await Promise.all(
      items.map(async ({ event, moved }) => {
        if (event.kind === "deleted") {
          removeTaskEverywhere(client, projectId, event.taskId);
          client.removeQueries({ queryKey: qk.task(event.taskId), exact: true });
          return;
        }
        let detail: TaskDetail;
        try {
          detail = await tasksApi.get(event.taskId);
        } catch (error) {
          if (isApiError(error) && (error.status === 404 || error.status === 403)) {
            removeTaskEverywhere(client, projectId, event.taskId);
          } else {
            scheduleInvalidate(qk.tasks(projectId));
          }
          return;
        }
        const summary = TaskSummarySchema.parse(detail);
        reconcileTask(client, summary, { selfId, keepPosition: !moved });
        if (client.getQueryData(qk.task(event.taskId))) {
          client.setQueryData(qk.task(event.taskId), detail);
        }
        // Newly assigned to me: My Tasks never inserts on its own (other sort orders), so refetch it.
        if (summary.assignees.some((user) => user.id === selfId)) {
          scheduleInvalidate(qk.myTasks());
        }
      })
    );
  }
};
