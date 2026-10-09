import type { z } from "zod";

import { TrashPageSchema } from "@/contracts/search";
import type { CreateTaskRequestSchema, ReplaceWorkflowRequestSchema } from "@/contracts/work";
import {
  AttachmentSchema,
  AttachmentUrlCollectionSchema,
  CommentPageSchema,
  CommentSchema,
  DirectoryCollectionSchema,
  StatusWorkflowSchema,
  TaskDetailSchema,
  TaskKeyLookupSchema,
  TaskPageSchema,
  TaskSummarySchema,
  TimelinePageSchema,
  UploadTicketSchema,
  type CreateUploadRequest,
  type MoveTaskRequest,
  type UpdateTaskRequest
} from "@/contracts/work";
import type { RichTextDoc } from "@/contracts/rich-text";
import { api, apiPath, type QueryValue } from "@/lib/api/client";
import { OkResponseSchema } from "@/lib/api/schemas";
import { normalizeTaskQuery, type DirectoryParams, type TaskQueryParams } from "@/lib/query-keys";

export type CreateTaskInput = z.input<typeof CreateTaskRequestSchema>;
export type ReplaceWorkflowInput = z.input<typeof ReplaceWorkflowRequestSchema>;

export type MyTasksParams = {
  due?: "overdue" | "none" | undefined;
  dueFrom?: string | undefined;
  dueTo?: string | undefined;
  includeDone?: boolean | undefined;
  sort?: "dueAt" | "updatedAt" | "priority" | undefined;
  limit?: number | undefined;
};

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

/** Work API (BE work.routes.ts + search.routes.ts trash). Responses are validated against contracts. */
export const tasksApi = {
  list: (projectId: string, query: TaskQueryParams, cursor?: string, signal?: AbortSignal) =>
    api.get(apiPath`/projects/${projectId}/tasks`, TaskPageSchema, {
      query: toTaskSearchParams(query, cursor),
      signal
    }),
  mine: (params: MyTasksParams, cursor?: string, signal?: AbortSignal) =>
    api.get("/tasks/mine", TaskPageSchema, {
      query: {
        due: params.due,
        dueFrom: params.dueFrom,
        dueTo: params.dueTo,
        includeDone: params.includeDone === undefined ? undefined : String(params.includeDone),
        sort: params.sort,
        limit: params.limit,
        cursor
      },
      signal
    }),
  byKey: (key: string, signal?: AbortSignal) =>
    api.get(apiPath`/tasks/by-key/${key}`, TaskKeyLookupSchema, { signal }),
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
    api.get(apiPath`/tasks/${taskId}/timeline`, TimelinePageSchema, {
      query: { cursor, limit: 30 },
      signal
    }),
  createComment: (
    taskId: string,
    input: { body: RichTextDoc; parentCommentId?: string | null; attachmentIds?: string[] }
  ) => api.post(apiPath`/tasks/${taskId}/comments`, CommentSchema, input),
  updateComment: (taskId: string, commentId: string, body: RichTextDoc) =>
    api.patch(apiPath`/tasks/${taskId}/comments/${commentId}`, CommentSchema, { body }),
  deleteComment: (taskId: string, commentId: string) =>
    api.delete(apiPath`/tasks/${taskId}/comments/${commentId}`, OkResponseSchema),
  replies: (taskId: string, commentId: string, signal?: AbortSignal) =>
    api.get(apiPath`/tasks/${taskId}/comments/${commentId}/replies`, CommentPageSchema, { signal }),

  createUpload: (taskId: string, input: CreateUploadRequest) =>
    api.post(apiPath`/tasks/${taskId}/attachments`, UploadTicketSchema, input),
  completeUpload: (attachmentId: string, target: "task" | "comment") =>
    api.post(apiPath`/attachments/${attachmentId}/complete`, AttachmentSchema, { target }),
  attachmentUrls: (ids: string[]) =>
    api.post("/attachments/urls", AttachmentUrlCollectionSchema, { ids }),
  deleteAttachment: (attachmentId: string) =>
    api.delete(apiPath`/attachments/${attachmentId}`, OkResponseSchema),

  /** Effective status workflow of a project, or of one list when `listId` is given. */
  workflow: (projectId: string, listId?: string | null, signal?: AbortSignal) =>
    api.get(apiPath`/projects/${projectId}/workflow`, StatusWorkflowSchema, {
      query: { listId: listId ?? undefined },
      signal
    }),
  replaceWorkflow: (projectId: string, input: ReplaceWorkflowInput) =>
    api.put(apiPath`/projects/${projectId}/workflow`, StatusWorkflowSchema, input),

  trash: (params: { projectId?: string | undefined }, cursor?: string, signal?: AbortSignal) =>
    api.get("/trash/tasks", TrashPageSchema, {
      query: { projectId: params.projectId, cursor, limit: 30 },
      signal
    }),
  restore: (taskId: string) => api.post(apiPath`/trash/tasks/${taskId}/restore`, TaskSummarySchema),
  purge: (taskId: string) => api.delete(apiPath`/trash/tasks/${taskId}`, OkResponseSchema),

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

/**
 * Direct-to-storage upload (signed URL on another origin: no cookies, no CSRF). XMLHttpRequest
 * so we can report progress. Resolves when storage accepted the bytes.
 */
export const putFileToSignedUrl = (
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal
) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
