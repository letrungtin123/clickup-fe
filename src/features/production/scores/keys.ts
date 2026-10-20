/**
 * Query keys for scores, KPI and leave — all under the module prefix ["production"] (keys.ts), so
 * a module-wide invalidation still reaches them.
 *
 *   ["production", "scores", "me", from, to]
 *   ["production", "scores", "forecast", period]
 *   ["production", "scores", "user", userId, from, to]          "Điểm cá nhân" (PD-052)
 *   ["production", "scores", "user", userId, "forecast", period]
 *   ["production", "scores", "board", period, teamId, peopleFilter]
 *   ["production", "kpi", "targets", year]
 *   ["production", "kpi", "missing", period]                  people without a KPI (PD-066)
 *   ["production", "kpi", "settlements", period, userId]
 *   ["production", "kpi", "runs", period]
 *   ["production", "kpi", "report", from, to, teamId, peopleFilter, userId]
 *   ["production", "leave", "calendar", from, to, teamId]
 *   ["production", "leave", "mine"]
 *   ["production", "leave", "pending"]
 */
export const scoreKeys = {
  all: () => ["production", "scores"] as const,
  me: (from: string | null, to: string | null) => ["production", "scores", "me", from, to] as const,
  forecast: (period: string | null) => ["production", "scores", "forecast", period] as const,
  /** Another member's scores ("Điểm cá nhân", PD-052). */
  user: (userId: string, from: string | null, to: string | null) =>
    ["production", "scores", "user", userId, from, to] as const,
  userForecast: (userId: string, period: string | null) =>
    ["production", "scores", "user", userId, "forecast", period] as const,
  /** `people` = peopleFilterKey (ADMIN tag / custom-field filter), "" when none. */
  board: (period: string | null, teamId: string | null, people = "") =>
    ["production", "scores", "board", period, teamId, people] as const
};

export const kpiKeys = {
  all: () => ["production", "kpi"] as const,
  targets: (year: number) => ["production", "kpi", "targets", year] as const,
  /** PD-066: who must have a KPI for the period and has none (null = the current period). */
  missing: (period: string | null) => ["production", "kpi", "missing", period] as const,
  /** `userId`: one member's row ("Điểm cá nhân", PD-052); null = the API default (own row, or everyone for ADMIN). */
  settlements: (period: string | null, userId: string | null = null) =>
    ["production", "kpi", "settlements", period, userId] as const,
  runs: (period: string | null) => ["production", "kpi", "runs", period] as const,
  /** Every KPI report window (provisional rows follow score entries). */
  reportAll: () => ["production", "kpi", "report"] as const,
  report: (
    from: string,
    to: string,
    teamId: string | null,
    people = "",
    userId: string | null = null
  ) => ["production", "kpi", "report", from, to, teamId, people, userId] as const
};

export const leaveKeys = {
  all: () => ["production", "leave"] as const,
  calendar: (from: string, to: string, teamId: string | null) =>
    ["production", "leave", "calendar", from, to, teamId] as const,
  mine: () => ["production", "leave", "mine"] as const,
  pending: () => ["production", "leave", "pending"] as const
};
