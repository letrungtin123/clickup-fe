import type { z } from "zod";

import type { CreateTaskRequestSchema } from "@/contracts/work";
import {
  DirectoryCollectionSchema,
  StatusWorkflowSchema,
  TaskDetailSchema,
  TaskPageSchema,
  TaskSummarySchema,
  TimelinePageSchema,
  type MoveTaskRequest,
  type UpdateTaskRequest
} from "@/contracts/work";
import { api, apiPath, type QueryValue } from "@/lib/api/client";
import { OkResponseSchema } from "@/lib/api/schemas";
import { normalizeTaskQuery, type DirectoryParams, type TaskQueryParams } from "@/lib/query-keys";

export type CreateTaskInput = z.input<typeof CreateTaskRequestSchema>;

/** Serializes a task query to the API's query-string format (csv for multi-value filters). */
export const toTaskSearchParams = (
  query: TaskQueryParams,
  cursor?: string
): Record<string, QueryValue> => {
  const normalized = normalizeTaskQuery(query);
  return {
    listId: normalized.listId,
    parent: normalized.parent,
    statusIds: normalized.statusIds,
    assigneeIds: normalized.assigneeIds,
    priorities: normalized.priorities,
    due: normalized.due,
    dueFrom: normalized.dueFrom,
    dueTo: normalized.dueTo,
    includeDone: normalized.includeDone === undefined ? undefined : String(normalized.includeDone),
    q: normalized.q,
    sort: normalized.sort,
    order: normalized.order,
    limit: normalized.limit,
    cursor
  };
};

/** Work API (BE work.routes.ts). Responses are validated against contracts/work.ts. */
export const tasksApi = {
  list: (projectId: string, query: TaskQueryParams, cursor?: string, signal?: AbortSignal) =>
    api.get(apiPath`/projects/${projectId}/tasks`, TaskPageSchema, {
      query: toTaskSearchParams(query, cursor),
      signal
    }),
  create: (projectId: string, input: CreateTaskInput) =>
    api.post(apiPath`/projects/${projectId}/tasks`, TaskSummarySchema, input),
  get: (taskId: string, signal?: AbortSignal) =>
    api.get(apiPath`/tasks/${taskId}`, TaskDetailSchema, { signal }),
  update: (taskId: string, input: UpdateTaskRequest) =>
    api.patch(apiPath`/tasks/${taskId}`, TaskDetailSchema, input),
  move: (taskId: string, input: MoveTaskRequest) =>
    api.post(apiPath`/tasks/${taskId}/move`, TaskSummarySchema, input),
  remove: (taskId: string) => api.delete(apiPath`/tasks/${taskId}`, OkResponseSchema),
  timeline: (taskId: string, cursor?: string, signal?: AbortSignal) =>
    api.get(apiPath`/tasks/${taskId}/timeline`, TimelinePageSchema, { query: { cursor }, signal }),
  /** Effective status workflow of a project, or of one list when `listId` is given. */
  workflow: (projectId: string, listId?: string | null, signal?: AbortSignal) =>
    api.get(apiPath`/projects/${projectId}/workflow`, StatusWorkflowSchema, {
      query: { listId: listId ?? undefined },
      signal
    }),
  directory: (params: DirectoryParams & { limit?: number }, signal?: AbortSignal) =>
    api.get("/directory/users", DirectoryCollectionSchema, {
      query: {
        q: params.q?.trim(),
        projectId: params.projectId,
        channelId: params.channelId,
        limit: params.limit
      },
      signal
    })
};
