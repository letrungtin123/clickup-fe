import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { isApiError } from "@/lib/api/errors";
import { useRealtimeEvent } from "@/lib/realtime/hooks";
import { scheduleInvalidate } from "@/lib/realtime/socket";

import { scoresApi } from "./api";
import { kpiKeys, scoreKeys } from "./keys";

/** Client errors (403 private board, 400 range) are answers, not glitches: never retried. */
export const retryUnlessClientError = (failureCount: number, error: unknown) =>
  !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 2;

/** GET /production/scores/me for an inclusive day range (null = the current KPI period). */
export const useMyScores = (range: { from: string; to: string } | null) =>
  useQuery({
    queryKey: scoreKeys.me(range?.from ?? null, range?.to ?? null),
    queryFn: ({ signal }) => scoresApi.me(range ?? {}, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError
  });

/** GET /production/scores/forecast (null = the current period). */
export const useScoreForecast = (period: string | null) =>
  useQuery({
    queryKey: scoreKeys.forecast(period),
    queryFn: ({ signal }) => scoresApi.forecast(period ?? undefined, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError
  });

/** GET /production/scores/board — 403 SCORES_PRIVATE when the board is private for the caller. */
export const useScoreBoard = (period: string | null, teamId: string | null, enabled = true) =>
  useQuery({
    queryKey: scoreKeys.board(period, teamId),
    queryFn: ({ signal }) =>
      scoresApi.board({ period: period ?? undefined, teamId: teamId ?? undefined }, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    enabled
  });

/**
 * Live scores (PLAN §10 "Dự báo KPI … theo thời gian thực"): any production task change may have
 * written score entries, so scores and KPI figures are refetched (coalesced) on `production:changed`.
 * The production room is joined once for the whole shell by ProductionRuntime.
 */
export const useLiveScores = () => {
  useRealtimeEvent("production:changed", (event) => {
    if (event.kind !== "tasks" && event.kind !== "job") return;
    scheduleInvalidate(scoreKeys.all());
    scheduleInvalidate(kpiKeys.all());
  });
};
