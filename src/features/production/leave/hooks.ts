import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requestScoresRefresh } from "../live-sync";
import { retryUnlessClientError } from "../scores/hooks";
import { leaveKeys } from "../scores/keys";
import { leaveApi, type CreateLeaveInput, type DecideLeaveInput } from "./api";

/**
 * Calendar window (≤ leaveLimits.maxCalendarDays days), optionally one team (the requester’s
 * report team); the previous month stays on screen while the next loads. Also feeds the
 * "Khoảng ngày" list (PD-057), disabled while that range is invalid.
 */
export const useLeaveCalendar = (from: string, to: string, teamId: string | null, enabled = true) =>
  useQuery({
    queryKey: leaveKeys.calendar(from, to, teamId),
    queryFn: ({ signal }) => leaveApi.calendar(from, to, teamId, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    enabled
  });

/** "Đơn của tôi": GET /production/leave/mine — own requests in any status, newest first. */
export const useMyLeaveRequests = (enabled = true) =>
  useQuery({
    queryKey: leaveKeys.mine(),
    queryFn: ({ signal }) => leaveApi.mine(signal),
    retry: retryUnlessClientError,
    enabled
  });

/** GET /production/leave/pending — LEADER/ADMIN may read it; only ADMIN decides (PD-057). */
export const usePendingLeave = (enabled: boolean) =>
  useQuery({
    queryKey: leaveKeys.pending(),
    queryFn: ({ signal }) => leaveApi.pending(signal),
    retry: retryUnlessClientError,
    enabled
  });

/**
 * Leave changes refresh the calendar and lists; approved leave also prorates KPI targets, so
 * decisions and cancellations refresh the score / KPI views too (throttled, BUG-PR-19).
 */
const useInvalidateLeave = (scores = false) => {
  const client = useQueryClient();
  return () => {
    if (scores) requestScoresRefresh(client);
    return client.invalidateQueries({ queryKey: leaveKeys.all() });
  };
};

export const useCreateLeave = () => {
  const invalidate = useInvalidateLeave();
  return useMutation({
    mutationFn: (input: CreateLeaveInput) => leaveApi.create(input),
    meta: { errorMessage: false },
    onSuccess: () => void invalidate()
  });
};

export const useCancelLeave = () => {
  const invalidate = useInvalidateLeave(true);
  return useMutation({
    mutationFn: (leaveId: string) => leaveApi.cancel(leaveId),
    meta: { errorMessage: false },
    onSettled: () => void invalidate()
  });
};

export const useDecideLeave = () => {
  const invalidate = useInvalidateLeave(true);
  return useMutation({
    mutationFn: ({ leaveId, input }: { leaveId: string; input: DecideLeaveInput }) =>
      leaveApi.decide(leaveId, input),
    meta: { errorMessage: false },
    onSettled: () => void invalidate()
  });
};
