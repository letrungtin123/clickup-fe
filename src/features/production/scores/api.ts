import {
  MyScoresSchema,
  ScoreBoardSchema,
  ScoreForecastSchema
} from "@/contracts/production-scores";
import { api } from "@/lib/api/client";

import { searchWithPeopleFilter, type PeopleFilter } from "./people-filter";

/** Score entries per page of GET /production/scores/me (API default 100, max 500). */
export const SCORE_ENTRIES_PAGE = 100;

/** Production scores API (BE modules/production/scores.routes.ts, SPEC Phase 3). */
export const scoresApi = {
  /** One page of entries (newest first) with the whole range's summary; `cursor` = previous nextCursor. */
  me: (
    range: { from?: string | undefined; to?: string | undefined },
    cursor?: string,
    signal?: AbortSignal
  ) =>
    api.get("/production/scores/me", MyScoresSchema, {
      query: { ...range, cursor, limit: SCORE_ENTRIES_PAGE },
      signal
    }),
  forecast: (period: string | undefined, signal?: AbortSignal) =>
    api.get("/production/scores/forecast", ScoreForecastSchema, { query: { period }, signal }),
  /** ADMIN may filter people by USER tags / custom fields (repeated parameters, see people-filter.ts). */
  board: (
    query: { period?: string | undefined; teamId?: string | undefined },
    people: PeopleFilter,
    signal?: AbortSignal
  ) =>
    api.get(`/production/scores/board${searchWithPeopleFilter(query, people)}`, ScoreBoardSchema, {
      signal
    })
};
