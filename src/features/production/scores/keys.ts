/**
 * Query keys for scores, KPI and leave — all under the module prefix ["production"] (keys.ts), so
 * a module-wide invalidation still reaches them.
 *
 *   ["production", "scores", "me", from, to]
 *   ["production", "scores", "forecast", period]
 *   ["production", "scores", "board", period, teamId]
 *   ["production", "kpi", "targets", year]
 *   ["production", "kpi", "settlements", period]
 *   ["production", "kpi", "runs", period]
 *   ["production", "kpi", "report", from, to, teamId]
 *   ["production", "leave", "calendar", from, to, teamId]
 *   ["production", "leave", "mine"]
 *   ["production", "leave", "pending"]
 */
export const scoreKeys = {
  all: () => ["production", "scores"] as const,
  me: (from: string | null, to: string | null) => ["production", "scores", "me", from, to] as const,
  forecast: (period: string | null) => ["production", "scores", "forecast", period] as const,
  board: (period: string | null, teamId: string | null) =>
    ["production", "scores", "board", period, teamId] as const
};

export const kpiKeys = {
  all: () => ["production", "kpi"] as const,
  targets: (year: number) => ["production", "kpi", "targets", year] as const,
  settlements: (period: string | null) => ["production", "kpi", "settlements", period] as const,
  runs: (period: string | null) => ["production", "kpi", "runs", period] as const,
  /** Every KPI report window (provisional rows follow score entries). */
  reportAll: () => ["production", "kpi", "report"] as const,
  report: (from: string, to: string, teamId: string | null) =>
    ["production", "kpi", "report", from, to, teamId] as const
};

export const leaveKeys = {
  all: () => ["production", "leave"] as const,
  calendar: (from: string, to: string, teamId: string | null) =>
    ["production", "leave", "calendar", from, to, teamId] as const,
  mine: () => ["production", "leave", "mine"] as const,
  pending: () => ["production", "leave", "pending"] as const
};
