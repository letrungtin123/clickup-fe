import type { z } from "zod";

import {
  CreateTasksResultSchema,
  DeleteJobResultSchema,
  DeleteTaskResultSchema,
  JobChatResultSchema,
  JobDetailSchema,
  JobFacetsSchema,
  JobOptionsSchema,
  JobPageSchema,
  ProductionCommentSchema,
  ProductionTaskPageSchema,
  ProductionTaskSchema,
  ProductionTimelinePageSchema,
  WorkEntryResultSchema,
  type AssignTaskRequestSchema,
  type CreateJobRequestSchema,
  type CreateQtyRequestSchema,
  type CreateSubtaskRequestSchema,
  type CreateTaskLineSchema,
  type CreateWorkEntryRequestSchema,
  type DecideQtyRequestSchema,
  type TransitionTaskRequestSchema,
  type UpdateJobRequestSchema,
  type UpdateProductionTaskRequestSchema,
  type UpdateTaskQtyRequestSchema
} from "@/contracts/production-jobs";
import { TaskScoresSchema } from "@/contracts/production-scores";
import { api, apiPath, type QueryValue } from "@/lib/api/client";
import { OkResponseSchema } from "@/lib/api/schemas";

import { queryPath } from "./list-filters";

/**
 * Production jobs, tasks and comments (BE modules/production/jobs.routes.ts, SPEC Phase 2). Responses are parsed with
 * the shared contract; what a caller may do comes back as `capabilities`. PD-045: the job-level line moves ("Complete
 * cả gói") and the separate feedback feature ("Ghi feedback", "Giao lại", "Đóng feedback") are retired — the job's
 * status is the manual chip (changeStatus).
 */

export type CreateJobInput = z.input<typeof CreateJobRequestSchema>;
export type UpdateJobInput = z.input<typeof UpdateJobRequestSchema>;
export type TaskLineInput = z.input<typeof CreateTaskLineSchema>;
export type TransitionInput = z.input<typeof TransitionTaskRequestSchema>;
export type QtyInput = z.input<typeof UpdateTaskQtyRequestSchema>;
export type AssignInput = z.input<typeof AssignTaskRequestSchema>;
export type UpdateTaskInput = z.input<typeof UpdateProductionTaskRequestSchema>;
export type WorkEntryInput = z.input<typeof CreateWorkEntryRequestSchema>;
/** PD-044: split part of a line off into another process ("Tạo subtask"). */
export type CreateSubtaskInput = z.input<typeof CreateSubtaskRequestSchema>;
/** PD-044: the worker asks the Leader for a new "Số lượng giao" (the new total). */
export type QtyRequestInput = z.input<typeof CreateQtyRequestSchema>;
export type DecideQtyRequestInput = z.input<typeof DecideQtyRequestSchema>;
export type TimelineEntity = "jobs" | "tasks";
export type MyTasksRole = "assignee" | "qc" | "all";

export type JobListQuery = Record<string, QueryValue>;
/** GET /production/jobs/options: project required; search text and manual statuses optional. */
export type JobOptionsInput = {
  projectId: string;
  q?: string | undefined;
  statusIds?: readonly string[] | undefined;
  limit?: number | undefined;
};

export const jobsApi = {
  /** Arrays (tag ids, custom-field values) repeat their parameter: queryPath. */
  list: (query: JobListQuery, cursor: string | undefined, signal?: AbortSignal) =>
    api.get(queryPath("/production/jobs", { ...query, cursor, limit: 50 }), JobPageSchema, {
      signal
    }),
  /** PD-067: counts per month of "Ngày nhận" and per project for the List view (same filters as `list`). */
  facets: (query: JobListQuery, signal?: AbortSignal) =>
    api.get(queryPath("/production/jobs/facets", query), JobFacetsSchema, { signal }),
  get: (jobId: string, signal?: AbortSignal) =>
    api.get(apiPath`/production/jobs/${jobId}`, JobDetailSchema, { signal }),
  create: (input: CreateJobInput) => api.post("/production/jobs", JobDetailSchema, input),
  update: (jobId: string, input: UpdateJobInput) =>
    api.patch(apiPath`/production/jobs/${jobId}`, JobDetailSchema, input),
  /** Deletes the job and all its lines (PD-036): points reversed, kept for audit. */
  remove: (jobId: string) => api.delete(apiPath`/production/jobs/${jobId}`, DeleteJobResultSchema),
  /** The manual job status (PD-038); answers the job (with its capabilities). */
  changeStatus: (jobId: string, statusId: string) =>
    api.patch(apiPath`/production/jobs/${jobId}/status`, JobDetailSchema, { statusId }),
  /**
   * "Gói công việc" picker of "Nhập công việc" (PD-038): jobs of the project (closed ones too), open statuses first,
   * then Ngày giao. Minimal fields; `truncated` = more match (type to narrow).
   */
  jobOptions: (query: JobOptionsInput, signal?: AbortSignal) =>
    api.get(
      queryPath("/production/jobs/options", {
        projectId: query.projectId,
        q: query.q?.trim() || undefined,
        statusIds: query.statusIds && query.statusIds.length > 0 ? [...query.statusIds] : undefined,
        limit: query.limit ?? 50
      }),
      JobOptionsSchema,
      { signal }
    ),
  /** "Nhập công việc" (PD-035): one work-log row into an existing job (PD-038: it never creates one). */
  createWorkEntry: (input: WorkEntryInput) =>
    api.post("/production/work-entries", WorkEntryResultSchema, input),
  createTasks: (jobId: string, tasks: TaskLineInput[]) =>
    api.post(apiPath`/production/jobs/${jobId}/tasks`, CreateTasksResultSchema, { tasks }),
  chat: (jobId: string) => api.post(apiPath`/production/jobs/${jobId}/chat`, JobChatResultSchema),

  /** `filters`: TASK tag / custom-field query (list-filters.ts). */
  myTasks: (
    role: MyTasksRole,
    includeFinished: boolean,
    cursor: string | undefined,
    signal?: AbortSignal,
    filters: Record<string, QueryValue> = {}
  ) =>
    api.get(
      queryPath("/production/tasks/mine", {
        ...filters,
        role,
        includeFinished: includeFinished ? "true" : undefined,
        cursor,
        limit: 200
      }),
      ProductionTaskPageSchema,
      { signal }
    ),
  qcQueue: (signal?: AbortSignal, filters: Record<string, QueryValue> = {}) =>
    api.get(queryPath("/production/tasks/qc-queue", filters), ProductionTaskPageSchema, {
      signal
    }),
  task: (taskId: string, signal?: AbortSignal) =>
    api.get(apiPath`/production/tasks/${taskId}`, ProductionTaskSchema, { signal }),
  /** Score ledger rows of one task (points public; money null unless visible to the caller). */
  taskScores: (taskId: string, signal?: AbortSignal) =>
    api.get(apiPath`/production/scores/task/${taskId}`, TaskScoresSchema, { signal }),
  updateTask: (taskId: string, input: UpdateTaskInput) =>
    api.patch(apiPath`/production/tasks/${taskId}`, ProductionTaskSchema, input),
  transitionTask: (taskId: string, input: TransitionInput) =>
    api.post(apiPath`/production/tasks/${taskId}/transition`, ProductionTaskSchema, input),
  setQty: (taskId: string, input: QtyInput) =>
    api.post(apiPath`/production/tasks/${taskId}/qty`, ProductionTaskSchema, input),
  assign: (taskId: string, input: AssignInput) =>
    api.post(apiPath`/production/tasks/${taskId}/assign`, ProductionTaskSchema, input),
  /** Deletes one line (PD-036): its points are reversed, it is kept for audit. */
  removeTask: (taskId: string) =>
    api.delete(apiPath`/production/tasks/${taskId}`, DeleteTaskResultSchema),
  /**
   * PD-044 subtasks. Create answers the LINE (with its `subtasks`); a subtask is edited / deleted with updateTask /
   * removeTask on its own id (its quantity moves between it and its line).
   */
  createSubtask: (taskId: string, input: CreateSubtaskInput) =>
    api.post(apiPath`/production/tasks/${taskId}/subtasks`, ProductionTaskSchema, input),
  /** PD-044 quantity requests: each answers the line with its `pendingQtyRequest`. */
  requestQty: (taskId: string, input: QtyRequestInput) =>
    api.post(apiPath`/production/tasks/${taskId}/qty-requests`, ProductionTaskSchema, input),
  decideQtyRequest: (requestId: string, input: DecideQtyRequestInput) =>
    api.post(apiPath`/production/qty-requests/${requestId}/decision`, ProductionTaskSchema, input),
  cancelQtyRequest: (requestId: string) =>
    api.delete(apiPath`/production/qty-requests/${requestId}`, ProductionTaskSchema),

  timeline: (
    entity: TimelineEntity,
    id: string,
    cursor: string | undefined,
    signal?: AbortSignal
  ) =>
    api.get(apiPath`/production/${entity}/${id}/timeline`, ProductionTimelinePageSchema, {
      query: { cursor, limit: 50 },
      signal
    }),
  comment: (entity: TimelineEntity, id: string, body: string, mentionedUserIds: string[]) =>
    api.post(apiPath`/production/${entity}/${id}/comments`, ProductionCommentSchema, {
      body,
      mentionedUserIds
    }),
  editComment: (commentId: string, body: string) =>
    api.patch(apiPath`/production/comments/${commentId}`, ProductionCommentSchema, { body }),
  deleteComment: (commentId: string) =>
    api.delete(apiPath`/production/comments/${commentId}`, OkResponseSchema)
};
