import type { z } from "zod";

import {
  LeaveCalendarSchema,
  LeaveRequestCollectionSchema,
  LeaveRequestSchema,
  type CreateLeaveRequestSchema,
  type DecideLeaveRequestSchema
} from "@/contracts/production-leave";
import { api, apiPath } from "@/lib/api/client";

export type CreateLeaveInput = z.input<typeof CreateLeaveRequestSchema>;
export type DecideLeaveInput = z.input<typeof DecideLeaveRequestSchema>;

/** Shared leave calendar — BE leave.routes.ts (SPEC §6.3). */
export const leaveApi = {
  calendar: (from: string, to: string, teamId: string | null, signal?: AbortSignal) =>
    api.get("/production/leave", LeaveCalendarSchema, {
      query: { from, to, teamId: teamId ?? undefined },
      signal
    }),
  /** The caller's own requests in any status, newest first (at most 200). */
  mine: (signal?: AbortSignal) =>
    api.get("/production/leave/mine", LeaveRequestCollectionSchema, { signal }),
  pending: (signal?: AbortSignal) =>
    api.get("/production/leave/pending", LeaveRequestCollectionSchema, { signal }),
  create: (input: CreateLeaveInput) => api.post("/production/leave", LeaveRequestSchema, input),
  cancel: (leaveId: string) =>
    api.post(apiPath`/production/leave/${leaveId}/cancel`, LeaveRequestSchema),
  decide: (leaveId: string, input: DecideLeaveInput) =>
    api.post(apiPath`/production/leave/${leaveId}/decide`, LeaveRequestSchema, input)
};
