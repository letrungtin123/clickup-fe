import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { isApiError } from "@/lib/api/errors";

import { scoresApi } from "./api";
import { scoreKeys } from "./keys";

/** Client errors (403 private board, 400 range) are answers, not glitches: never retried. */
export const retryUnlessClientError = (failureCount: number, error: unknown) =>
  !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 2;

/**
 * GET /production/scores/me for an inclusive day range (null = the current KPI period). Entries come
 * in pages (newest first); every page repeats the range's summary and cards, read from the first.
 */
export const useMyScores = (range: { from: string; to: string } | null) =>
  useInfiniteQuery({
    queryKey: scoreKeys.me(range?.from ?? null, range?.to ?? null),
    queryFn: ({ pageParam, signal }) => scoresApi.me(range ?? {}, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
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

/*
 * Live scores (PLAN §10 "Dự báo KPI … theo thời gian thực") are kept by ProductionRuntime through
 * live-sync.ts requestScoresRefresh: score and KPI views are marked stale on every relevant change
 * (own or not) and refetched while on screen at most every 30 s (PERF-01, BUG-PR-19).
 */
