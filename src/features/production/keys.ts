/**
 * Production query keys. One prefix `["production"]` invalidates the whole module:
 *
 *   ["production", "me"]                                     roles, team, public settings
 *   ["production", "members"(, filters)]                     production members (admin: all org members)
 *   ["production", "teams" | "clients" | "projects" | "processes" | "shifts" | "tags"]
 *   ["production", "credit-rules", "matrix", day]            rules effective on `day`
 *   ["production", "credit-rules", "history", project, process]
 *   ["production", "workflow"]                               statuses + transitions
 *   ["production", "job-statuses"]                           manual job status catalog (PD-038)
 *   ["production", "job-options", query]                     "Gói công việc" picker of "Nhập công việc"
 *   ["production", "custom-fields"]                          every entity (filtered client-side)
 *   ["production", "settings"]                               admin settings
 *   ["production", "allowed-emails"]                         login whitelist
 *   ["me", "notification-preferences"]                       personal (not production-only)
 *   ["production", "jobs", query]                            job list pages (infinite)
 *   ["production", "jobs", "facets", query]                  job List view counts per month / project (PD-067)
 *   ["production", "jobs", "overview", query]                "Tổng quan" dashboard (PD-076)
 *   ["production", "job", id] / ["production", "task", id]  job detail / task detail
 *   ["production", "my-tasks", role, includeFinished(, filters)]  my tasks (infinite)
 *   ["production", "qc-queue"(, filters)]                    tasks waiting for my QC
 *   (filters = tag / custom-field query, list-filters.ts; only present when non-empty)
 *   ["production", "timeline", "jobs"|"tasks", id]           comments + history (infinite)
 */
export const productionKeys = {
  all: () => ["production"] as const,
  me: () => ["production", "me"] as const,
  /** With a tag / custom-field query: a filtered variant under the same prefix. */
  members: (filters?: Record<string, unknown>) =>
    filters && Object.keys(filters).length > 0
      ? (["production", "members", filters] as const)
      : (["production", "members"] as const),
  /** Open jobs a person still leads (GET /production/users/:id/led-jobs). */
  ledJobs: (userId: string) => ["production", "led-jobs", userId] as const,
  teams: () => ["production", "teams"] as const,
  clients: (filters?: Record<string, unknown>) =>
    filters && Object.keys(filters).length > 0
      ? (["production", "clients", filters] as const)
      : (["production", "clients"] as const),
  projects: () => ["production", "projects"] as const,
  processes: () => ["production", "processes"] as const,
  shifts: () => ["production", "shifts"] as const,
  tags: () => ["production", "tags"] as const,
  creditRules: () => ["production", "credit-rules"] as const,
  creditMatrix: (day: string) => ["production", "credit-rules", "matrix", day] as const,
  creditHistory: (projectId: string, processId: string) =>
    ["production", "credit-rules", "history", projectId, processId] as const,
  workflow: () => ["production", "workflow"] as const,
  /** Manual job status catalog (PD-038). */
  jobStatuses: () => ["production", "job-statuses"] as const,
  /** Job picker of "Nhập công việc" (GET /production/jobs/options); without a query: every variant. */
  jobOptions: (query?: Record<string, unknown>) =>
    query === undefined
      ? (["production", "job-options"] as const)
      : (["production", "job-options", query] as const),
  customFields: () => ["production", "custom-fields"] as const,
  settings: () => ["production", "settings"] as const,
  allowedEmails: () => ["production", "allowed-emails"] as const,
  notificationPreferences: () => ["me", "notification-preferences"] as const,

  // Phase 2: jobs & tasks
  jobs: (query?: Record<string, unknown>) =>
    query === undefined
      ? (["production", "jobs"] as const)
      : (["production", "jobs", query] as const),
  /**
   * Month / project counts of the job List view (PD-067). Under the job lists' prefix, so whatever refreshes the lists
   * refreshes them too (the list helpers skip this non-paged entry).
   */
  jobFacets: (query?: Record<string, unknown>) =>
    query === undefined
      ? (["production", "jobs", "facets"] as const)
      : (["production", "jobs", "facets", query] as const),
  /**
   * "Tổng quan" (PD-076). Under the job lists' prefix too: every write that refreshes the lists refreshes it; other
   * people's changes refresh it while on screen at most every LIVE_REFRESH_MS (live-sync.ts).
   */
  overview: (query?: Record<string, unknown>) =>
    query === undefined
      ? (["production", "jobs", "overview"] as const)
      : (["production", "jobs", "overview", query] as const),
  /**
   * PD-080 "ảnh đang ôm" of the team (GET /production/team-load), for the Chia task suggestions and the assignee picker.
   * Under the job lists' prefix: every task write that refreshes the lists refreshes it.
   */
  teamLoad: () => ["production", "jobs", "team-load"] as const,
  /** PD-080 At risk history (GET /production/overview/risk-history), superadmin / Director. */
  riskHistory: (query?: Record<string, unknown>) =>
    query === undefined
      ? (["production", "risk-history"] as const)
      : (["production", "risk-history", query] as const),
  job: (jobId: string) => ["production", "job", jobId] as const,
  jobAll: () => ["production", "job"] as const,
  task: (taskId: string) => ["production", "task", taskId] as const,
  taskAll: () => ["production", "task"] as const,
  /** Under the task key: refreshed with it (realtime, invalidations). */
  taskScores: (taskId: string) => ["production", "task", taskId, "scores"] as const,
  /** `filters`: tag / custom-field query of the list (omitted when empty, so plain keys stay short). */
  myTasks: (role?: string, includeFinished?: boolean, filters?: Record<string, unknown>) =>
    role === undefined
      ? (["production", "my-tasks"] as const)
      : filters && Object.keys(filters).length > 0
        ? (["production", "my-tasks", role, includeFinished ?? false, filters] as const)
        : (["production", "my-tasks", role, includeFinished ?? false] as const),
  /** Without `filters`: the plain queue (also the prefix of every filtered variant). */
  qcQueue: (filters?: Record<string, unknown>) =>
    filters && Object.keys(filters).length > 0
      ? (["production", "qc-queue", filters] as const)
      : (["production", "qc-queue"] as const),
  timeline: (entity?: "jobs" | "tasks", id?: string) =>
    entity === undefined
      ? (["production", "timeline"] as const)
      : (["production", "timeline", entity, id ?? ""] as const)
} as const;
