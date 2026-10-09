import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { AnomalyKind, ReportConfig } from "@/contracts/production-reports";
import { isApiError } from "@/lib/api/errors";
import { useRealtimeEvent } from "@/lib/realtime/hooks";
import { scheduleInvalidate } from "@/lib/realtime/socket";

import { reportsApi, type CreateSavedReportInput, type UpdateSavedReportInput } from "./api";
import { reportKeys } from "./keys";

/**
 * Data hooks for Phase 5. Mutations opt out of the global error toast (`errorMessage: false`):
 * callers show report-specific copy (errors.ts).
 */

/** Client errors (403 money/private, 400 invalid range) are answers, not glitches: never retried. */
const retryUnlessClientError = (failureCount: number, error: unknown) =>
  !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 2;

const silent = { meta: { errorMessage: false } } as const;

// Reports -------------------------------------------------------------------------------------------

/** POST /production/reports/query — null = nothing to run yet. Keeps the previous result while loading. */
/** The presentation part (chart type, Hàng/Cột split) does not change the rows: not part of the query. */
const dataPart = ({ view: _view, ...rest }: ReportConfig): ReportConfig => rest;

export const useReportResult = (config: ReportConfig | null) => {
  const query = config ? dataPart(config) : null;
  return useQuery({
    queryKey: query ? reportKeys.query(query) : [...reportKeys.results(), null],
    queryFn: ({ signal }) => reportsApi.query(query!, signal),
    enabled: query !== null,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    staleTime: 30_000
  });
};

export const useSavedReports = (enabled = true) =>
  useQuery({
    queryKey: reportKeys.saved(),
    queryFn: ({ signal }) => reportsApi.saved(signal),
    enabled,
    retry: retryUnlessClientError
  });

const useSavedMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>
) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    ...silent,
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: reportKeys.saved() }),
        client.invalidateQueries({ queryKey: reportKeys.admin() })
      ])
  });
};

export const useCreateSavedReport = () =>
  useSavedMutation((input: CreateSavedReportInput) => reportsApi.createSaved(input));

export const useUpdateSavedReport = () =>
  useSavedMutation(({ id, input }: { id: string; input: UpdateSavedReportInput }) =>
    reportsApi.updateSaved(id, input)
  );

export const useDeleteSavedReport = () =>
  useSavedMutation((id: string) => reportsApi.deleteSaved(id));

// Dashboards ----------------------------------------------------------------------------------------

/** GET /production/dashboard/leader — refreshed every minute (late / due-soon minutes move). */
export const useLeaderDashboard = (leaderId: string | null, enabled = true) =>
  useQuery({
    queryKey: reportKeys.leader(leaderId),
    queryFn: ({ signal }) => reportsApi.leaderDashboard(leaderId, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    retry: retryUnlessClientError,
    enabled
  });

export const useAdminDashboard = (enabled = true) =>
  useQuery({
    queryKey: reportKeys.admin(),
    queryFn: ({ signal }) => reportsApi.adminDashboard(signal),
    refetchInterval: 5 * 60_000,
    retry: retryUnlessClientError,
    enabled
  });

// Anomalies -----------------------------------------------------------------------------------------

export const useAnomalies = (days: number, includeReviewed: boolean) =>
  useQuery({
    queryKey: reportKeys.anomalyList(days, includeReviewed),
    queryFn: ({ signal }) => reportsApi.anomalies({ days, includeReviewed }, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError
  });

const useAnomalyMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>
) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    ...silent,
    onSettled: () => client.invalidateQueries({ queryKey: reportKeys.anomalies() })
  });
};

export const useReviewAnomaly = () =>
  useAnomalyMutation((input: { kind: AnomalyKind; key: string; note?: string }) =>
    reportsApi.review(input)
  );

export const useUnreviewAnomaly = () =>
  useAnomalyMutation((input: { kind: AnomalyKind; key: string }) => reportsApi.unreview(input));

// Realtime ------------------------------------------------------------------------------------------

/** At most one refresh of the dashboards per this window while the floor is busy. */
const LIVE_THROTTLE_MS = 10_000;

/**
 * Live dashboards: a production change (task status, quantities, scores…) refreshes the dashboards
 * and anomalies on screen — immediately, then at most every 10 s while changes keep coming. Report
 * results are not refetched (heavy; they refresh on edit / focus). The production room itself is
 * joined once for the whole shell by ProductionRuntime; nothing happens while it is not joined.
 */
export const useLiveReports = () => {
  const state = useRef<{ last: number; timer: number | null }>({ last: 0, timer: null });
  useEffect(() => {
    const current = state.current;
    return () => {
      if (current.timer !== null) window.clearTimeout(current.timer);
    };
  }, []);
  useRealtimeEvent("production:changed", () => {
    const current = state.current;
    if (current.timer !== null) return;
    const wait = Math.max(0, current.last + LIVE_THROTTLE_MS - Date.now());
    current.timer = window.setTimeout(() => {
      current.timer = null;
      current.last = Date.now();
      scheduleInvalidate(reportKeys.dashboards());
      scheduleInvalidate(reportKeys.anomalies());
    }, wait);
  });
};
