import type { z } from "zod";

import {
  CreateTasksResultSchema,
  JobChatResultSchema,
  JobDetailSchema,
  JobPageSchema,
  JobTransitionResultSchema,
  ProductionCommentSchema,
  ProductionTaskPageSchema,
  ProductionTaskSchema,
  ProductionTimelinePageSchema,
  type AssignTaskRequestSchema,
  type CreateFeedbackRequestSchema,
  type CreateJobRequestSchema,
  type CreateTaskLineSchema,
  type ReassignFeedbackRequestSchema,
  type TransitionTaskRequestSchema,
  type UpdateJobRequestSchema,
  type UpdateProductionTaskRequestSchema,
  type UpdateTaskQtyRequestSchema
} from "@/contracts/production-jobs";
import { TaskScoresSchema } from "@/contracts/production-scores";
import { api, apiPath, type QueryValue } from "@/lib/api/client";
import { OkResponseSchema } from "@/lib/api/schemas";

/**
 * Production jobs, tasks, feedback and comments (BE modules/production/jobs.routes.ts, SPEC Phase 2).
 * Responses are parsed with the shared contract; what a caller may do comes back as `capabilities`.
 */

export type CreateJobInput = z.input<typeof CreateJobRequestSchema>;
export type UpdateJobInput = z.input<typeof UpdateJobRequestSchema>;
export type TaskLineInput = z.input<typeof CreateTaskLineSchema>;
export type ReassignInput = z.input<typeof ReassignFeedbackRequestSchema>;
export type FeedbackInput = z.input<typeof CreateFeedbackRequestSchema>;
export type TransitionInput = z.input<typeof TransitionTaskRequestSchema>;
export type QtyInput = z.input<typeof UpdateTaskQtyRequestSchema>;
export type AssignInput = z.input<typeof AssignTaskRequestSchema>;
export type UpdateTaskInput = z.input<typeof UpdateProductionTaskRequestSchema>;
export type TimelineEntity = "jobs" | "tasks";
export type MyTasksRole = "assignee" | "qc" | "all";

export type JobListQuery = Record<string, QueryValue>;

export const jobsApi = {
  list: (query: JobListQuery, cursor: string | undefined, signal?: AbortSignal) =>
    api.get("/production/jobs", JobPageSchema, { query: { ...query, cursor, limit: 50 }, signal }),
  get: (jobId: string, signal?: AbortSignal) =>
    api.get(apiPath`/production/jobs/${jobId}`, JobDetailSchema, { signal }),
  create: (input: CreateJobInput) => api.post("/production/jobs", JobDetailSchema, input),
  update: (jobId: string, input: UpdateJobInput) =>
    api.patch(apiPath`/production/jobs/${jobId}`, JobDetailSchema, input),
  createTasks: (jobId: string, tasks: TaskLineInput[]) =>
    api.post(apiPath`/production/jobs/${jobId}/tasks`, CreateTasksResultSchema, { tasks }),
  transition: (jobId: string, toStatusId: string) =>
    api.post(apiPath`/production/jobs/${jobId}/transition`, JobTransitionResultSchema, {
      toStatusId
    }),
  feedback: (jobId: string, input: FeedbackInput) =>
    api.post(apiPath`/production/jobs/${jobId}/feedbacks`, JobDetailSchema, input),
  /** "Đóng feedback, không cần làm lại" (Account / Admin, reason required); answers the job. */
  closeFeedback: (feedbackId: string, note: string) =>
    api.post(apiPath`/production/feedbacks/${feedbackId}/close`, JobDetailSchema, { note }),
  reassign: (feedbackId: string, input: ReassignInput) =>
    api.post(apiPath`/production/feedbacks/${feedbackId}/reassign`, CreateTasksResultSchema, input),
  chat: (jobId: string) => api.post(apiPath`/production/jobs/${jobId}/chat`, JobChatResultSchema),

  myTasks: (
    role: MyTasksRole,
    includeFinished: boolean,
    cursor: string | undefined,
    signal?: AbortSignal
  ) =>
    api.get("/production/tasks/mine", ProductionTaskPageSchema, {
      query: { role, includeFinished: includeFinished ? "true" : undefined, cursor, limit: 200 },
      signal
    }),
  qcQueue: (signal?: AbortSignal) =>
    api.get("/production/tasks/qc-queue", ProductionTaskPageSchema, { signal }),
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
