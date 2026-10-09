import type { QueryClient } from "@tanstack/react-query";
import { TaskSummarySchema, type TaskDetail } from "@/contracts/work";
import type { TaskChangedEvent } from "@/contracts/realtime";
import { isApiError } from "@/lib/api/errors";
import { qk, type TaskQueryParams } from "@/lib/query-keys";
import { scheduleInvalidate } from "@/lib/realtime/socket";
import { tasksApi } from "./api";
import { findCachedTask, reconcileTask, removeTaskEverywhere } from "./cache";
import { isLocalTaskEcho } from "./local-mutations";

/** Above this many distinct tasks in one burst (bulk edits, imports) one refetch is cheaper than N fetches. */
export const maxTargetedFetches = 25;

export type PendingTaskChange = { event: TaskChangedEvent; moved: boolean };

/**
 * What one `task:changed` event costs this client (PERF-07):
 * - "skip": our own change, already applied from the API response;
 * - "remove": deleted — drop it locally, no request;
 * - "fetch": the task is on screen / cached somewhere, or an active list could now include it;
 * - "stale": nothing here shows it — mark the project's listings stale without refetching.
 */
export type TaskEventPlan = "skip" | "remove" | "fetch" | "stale";

const isTaskQuery = (value: unknown): value is TaskQueryParams => Boolean(value) && typeof value === "object";

/** Is a listing on screen (active observer) that the event's task could belong to? */
const hasActiveListing = (client: QueryClient, event: TaskChangedEvent) =>
  client
    .getQueryCache()
    .findAll({ queryKey: qk.tasks(event.projectId), type: "active" })
    .some((query) => {
      const params = query.queryKey[3];
      if (!isTaskQuery(params)) return false;
      if (params.listId && params.listId !== event.listId) return false;
      if (params.parent === "root") return event.parentTaskId === null;
      if (params.parent) return params.parent === event.parentTaskId;
      return true;
    });

export const planTaskEvent = (
  client: QueryClient,
  event: TaskChangedEvent,
  selfId: string,
  now: number = Date.now()
): TaskEventPlan => {
  if (event.actorId === selfId && isLocalTaskEcho(event.taskId, now)) return "skip";
  if (event.kind === "deleted") return "remove";
  if (client.getQueryData(qk.task(event.taskId)) || findCachedTask(client, event.taskId, event.projectId)) {
    return "fetch";
  }
  // A new / moved subtask of a task whose detail is open.
  if (event.parentTaskId && client.getQueryData(qk.task(event.parentTaskId))) return "fetch";
  return hasActiveListing(client, event) ? "fetch" : "stale";
};

/**
 * Applies `task:changed` events by fetching only tasks this client shows and patching them into every
 * cached list, board, table, My Tasks and detail — never refetching whole project listings per event.
 */
export const applyTaskChanges = async (client: QueryClient, batch: PendingTaskChange[], selfId: string) => {
  const byProject = new Map<string, PendingTaskChange[]>();
  for (const item of batch) {
    byProject.set(item.event.projectId, [...(byProject.get(item.event.projectId) ?? []), item]);
  }
  for (const [projectId, items] of byProject) {
    const toFetch: PendingTaskChange[] = [];
    let stale = false;
    for (const item of items) {
      const plan = planTaskEvent(client, item.event, selfId);
      if (plan === "remove") {
        removeTaskEverywhere(client, projectId, item.event.taskId);
        client.removeQueries({ queryKey: qk.task(item.event.taskId), exact: true });
      } else if (plan === "fetch") {
        toFetch.push(item);
      } else if (plan === "stale") {
        stale = true;
      }
    }
    if (stale) {
      // Listings refetch on their next mount; nothing on screen needs this task now.
      void client.invalidateQueries({ queryKey: qk.tasks(projectId), refetchType: "none" });
      void client.invalidateQueries({ queryKey: qk.myTasks(), refetchType: "none" });
    }
    if (toFetch.length > maxTargetedFetches) {
      scheduleInvalidate(qk.tasks(projectId));
      scheduleInvalidate(qk.myTasks());
      for (const { event } of toFetch) scheduleInvalidate(qk.task(event.taskId), true);
      continue;
    }
    await Promise.all(
      toFetch.map(async ({ event, moved }) => {
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
        reconcileTask(client, summary, { selfId, keepPosition: !moved, created: event.kind === "created" });
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
