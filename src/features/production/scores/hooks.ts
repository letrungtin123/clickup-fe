import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { UserScoreForecast, UserScores } from "@/contracts/production-scores";
import { isApiError } from "@/lib/api/errors";

import { scoresApi } from "./api";
import { scoreKeys } from "./keys";
import { emptyPeopleFilter, peopleFilterKey, type PeopleFilter } from "./people-filter";

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

/**
 * What the scores page shows for its subject: GET /production/scores/me (yourself) or GET
 * /production/scores/user/:userId (anyone, PD-052) — money null while hidden; who the person is only for others.
 */
export type ScoresView = Omit<UserScores, "user" | "teamId" | "teamName" | "moneyVisible"> &
  Partial<Pick<UserScores, "user" | "teamId" | "teamName" | "moneyVisible">>;

/** Scores of `userId` (null = the signed-in user, /me) for a day range; pages like useMyScores. */
export const useScores = (
  userId: string | null,
  range: { from: string; to: string },
  enabled = true
) =>
  useInfiniteQuery({
    enabled,
    queryKey: userId
      ? scoreKeys.user(userId, range.from, range.to)
      : scoreKeys.me(range.from, range.to),
    queryFn: ({ pageParam, signal }): Promise<ScoresView> =>
      userId
        ? scoresApi.user(userId, range, pageParam, signal)
        : scoresApi.me(range, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError
  });

/** KPI forecast of `userId` (null = the signed-in user) for a period (null = the current one). */
export const useForecastOf = (userId: string | null, period: string | null) =>
  useQuery({
    queryKey: userId ? scoreKeys.userForecast(userId, period) : scoreKeys.forecast(period),
    queryFn: ({ signal }): Promise<UserScoreForecast> =>
      userId
        ? scoresApi.userForecast(userId, period ?? undefined, signal)
        : scoresApi.forecast(period ?? undefined, signal),
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

/** GET /production/scores/board — open to every production member (PD-052). */
export const useScoreBoard = (
  period: string | null,
  teamId: string | null,
  people: PeopleFilter = emptyPeopleFilter,
  enabled = true
) =>
  useQuery({
    queryKey: scoreKeys.board(period, teamId, peopleFilterKey(people)),
    queryFn: ({ signal }) =>
      scoresApi.board({ period: period ?? undefined, teamId: teamId ?? undefined }, people, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    enabled
  });

/*
 * Live scores (PLAN §10 "Dự báo KPI … theo thời gian thực") are kept by ProductionRuntime through
 * live-sync.ts requestScoresRefresh: score and KPI views are marked stale on every relevant change
 * (own or not) and refetched while on screen at most every 30 s (PERF-01, BUG-PR-19).
 */
