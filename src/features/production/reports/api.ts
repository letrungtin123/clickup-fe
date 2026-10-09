import { z } from "zod";

import {
  AdminDashboardSchema,
  AnomalyListSchema,
  AnomalyReviewResultSchema,
  LeaderDashboardSchema,
  ReportResultSchema,
  SavedReportCollectionSchema,
  SavedReportSchema,
  type AnomalyKind,
  type CreateSavedReportRequestSchema,
  type ReportConfigInput,
  type UpdateSavedReportRequestSchema
} from "@/contracts/production-reports";
import { api, apiPath } from "@/lib/api/client";

/**
 * Production reports API (BE modules/production/reports.routes.ts, SPEC Phase 5). Every response is
 * parsed with the shared contract. Excel exports go through ./export.ts (binary responses).
 */

export type CreateSavedReportInput = z.input<typeof CreateSavedReportRequestSchema>;
export type UpdateSavedReportInput = z.input<typeof UpdateSavedReportRequestSchema>;

const DeletedSchema = z.object({ deleted: z.boolean() });

export const reportsApi = {
  query: (config: ReportConfigInput, signal?: AbortSignal) =>
    api.post("/production/reports/query", ReportResultSchema, config, { signal }),

  saved: (signal?: AbortSignal) =>
    api.get("/production/reports/saved", SavedReportCollectionSchema, { signal }),
  createSaved: (input: CreateSavedReportInput) =>
    api.post("/production/reports/saved", SavedReportSchema, input),
  updateSaved: (id: string, input: UpdateSavedReportInput) =>
    api.patch(apiPath`/production/reports/saved/${id}`, SavedReportSchema, input),
  deleteSaved: (id: string) => api.delete(apiPath`/production/reports/saved/${id}`, DeletedSchema),

  leaderDashboard: (leaderId: string | null, signal?: AbortSignal) =>
    api.get("/production/dashboard/leader", LeaderDashboardSchema, {
      query: { leaderId: leaderId ?? undefined },
      signal
    }),
  adminDashboard: (signal?: AbortSignal) =>
    api.get("/production/dashboard/admin", AdminDashboardSchema, { signal }),

  anomalies: (query: { days: number; includeReviewed: boolean }, signal?: AbortSignal) =>
    api.get("/production/anomalies", AnomalyListSchema, {
      query: { days: query.days, includeReviewed: query.includeReviewed ? "true" : undefined },
      signal
    }),
  review: (input: { kind: AnomalyKind; key: string; note?: string }) =>
    api.post("/production/anomalies/review", AnomalyReviewResultSchema, input),
  unreview: (input: { kind: AnomalyKind; key: string }) =>
    api.delete("/production/anomalies/reviews", AnomalyReviewResultSchema, undefined, {
      query: input
    })
};
