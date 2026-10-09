import type { ReportConfig } from "@/contracts/production-reports";

/**
 * Query keys for Phase 5 (reports, dashboards, anomalies) — all under the module prefix
 * ["production"] (../keys.ts), so a module-wide invalidation still reaches them.
 *
 *   ["production", "reports", "query", config]          report result
 *   ["production", "reports", "saved"]                  saved reports (mine + shared)
 *   ["production", "dashboard", "leader", leaderId]     Leader dashboard (null = own / every job)
 *   ["production", "dashboard", "admin"]                Admin dashboard
 *   ["production", "anomalies", days, includeReviewed]  anomaly list (every kind)
 */
export const reportKeys = {
  all: () => ["production", "reports"] as const,
  results: () => ["production", "reports", "query"] as const,
  query: (config: ReportConfig) => ["production", "reports", "query", config] as const,
  saved: () => ["production", "reports", "saved"] as const,
  dashboards: () => ["production", "dashboard"] as const,
  leader: (leaderId: string | null) => ["production", "dashboard", "leader", leaderId] as const,
  admin: () => ["production", "dashboard", "admin"] as const,
  anomalies: () => ["production", "anomalies"] as const,
  anomalyList: (days: number, includeReviewed: boolean) =>
    ["production", "anomalies", days, includeReviewed] as const
};
