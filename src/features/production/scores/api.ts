import {
  MyScoresSchema,
  ScoreBoardSchema,
  ScoreForecastSchema
} from "@/contracts/production-scores";
import { api, buildQueryString, type QueryValue } from "@/lib/api/client";
import { webEnv } from "@/lib/env";

/** Production scores API (BE modules/production/scores.routes.ts, SPEC Phase 3). */
export const scoresApi = {
  me: (range: { from?: string | undefined; to?: string | undefined }, signal?: AbortSignal) =>
    api.get("/production/scores/me", MyScoresSchema, { query: range, signal }),
  forecast: (period: string | undefined, signal?: AbortSignal) =>
    api.get("/production/scores/forecast", ScoreForecastSchema, { query: { period }, signal }),
  board: (query: { period?: string | undefined; teamId?: string | undefined }, signal?: AbortSignal) =>
    api.get("/production/scores/board", ScoreBoardSchema, { query, signal })
};

/**
 * Same-origin URL of an Excel export (production-reports contract: GET …/export, cookie-authenticated
 * attachment). Downloaded through a plain link, never fetched and re-wrapped as a blob.
 */
export const exportUrl = (path: string, query: Record<string, QueryValue>) =>
  `${webEnv.apiBaseUrl}${path}${buildQueryString(query)}`;
