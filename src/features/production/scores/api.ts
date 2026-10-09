import {
  MyScoresSchema,
  ScoreBoardSchema,
  ScoreForecastSchema
} from "@/contracts/production-scores";
import { api } from "@/lib/api/client";

/** Production scores API (BE modules/production/scores.routes.ts, SPEC Phase 3). */
export const scoresApi = {
  me: (range: { from?: string | undefined; to?: string | undefined }, signal?: AbortSignal) =>
    api.get("/production/scores/me", MyScoresSchema, { query: range, signal }),
  forecast: (period: string | undefined, signal?: AbortSignal) =>
    api.get("/production/scores/forecast", ScoreForecastSchema, { query: { period }, signal }),
  board: (query: { period?: string | undefined; teamId?: string | undefined }, signal?: AbortSignal) =>
    api.get("/production/scores/board", ScoreBoardSchema, { query, signal })
};
