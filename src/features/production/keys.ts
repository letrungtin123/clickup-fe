/**
 * Production query keys. One prefix `["production"]` invalidates the whole module:
 *
 *   ["production", "me"]                                     roles, team, public settings
 *   ["production", "members"]                                production members (admin: all org members)
 *   ["production", "teams" | "clients" | "projects" | "processes" | "shifts" | "tags"]
 *   ["production", "credit-rules", "matrix", day]            rules effective on `day`
 *   ["production", "credit-rules", "history", project, process]
 *   ["production", "workflow"]                               statuses + transitions
 *   ["production", "custom-fields"]                          every entity (filtered client-side)
 *   ["production", "settings"]                               admin settings
 *   ["production", "allowed-emails"]                         login whitelist
 *   ["me", "notification-preferences"]                       personal (not production-only)
 *   ["production", "jobs", query]                            job list pages (infinite)
 *   ["production", "job", id] / ["production", "task", id]  job detail / task detail
 *   ["production", "my-tasks", role, includeFinished]        my tasks (infinite)
 *   ["production", "qc-queue"]                               tasks waiting for my QC
 *   ["production", "timeline", "jobs"|"tasks", id]           comments + history (infinite)
 */
export const productionKeys = {
  all: () => ["production"] as const,
  me: () => ["production", "me"] as const,
  members: () => ["production", "members"] as const,
  teams: () => ["production", "teams"] as const,
  clients: () => ["production", "clients"] as const,
  projects: () => ["production", "projects"] as const,
  processes: () => ["production", "processes"] as const,
  shifts: () => ["production", "shifts"] as const,
  tags: () => ["production", "tags"] as const,
  creditRules: () => ["production", "credit-rules"] as const,
  creditMatrix: (day: string) => ["production", "credit-rules", "matrix", day] as const,
  creditHistory: (projectId: string, processId: string) =>
    ["production", "credit-rules", "history", projectId, processId] as const,
  workflow: () => ["production", "workflow"] as const,
  customFields: () => ["production", "custom-fields"] as const,
  settings: () => ["production", "settings"] as const,
  allowedEmails: () => ["production", "allowed-emails"] as const,
  notificationPreferences: () => ["me", "notification-preferences"] as const,

  // Phase 2: jobs & tasks
  jobs: (query?: Record<string, unknown>) =>
    query === undefined
      ? (["production", "jobs"] as const)
      : (["production", "jobs", query] as const),
  job: (jobId: string) => ["production", "job", jobId] as const,
  jobAll: () => ["production", "job"] as const,
  task: (taskId: string) => ["production", "task", taskId] as const,
  taskAll: () => ["production", "task"] as const,
  /** Under the task key: refreshed with it (realtime, invalidations). */
  taskScores: (taskId: string) => ["production", "task", taskId, "scores"] as const,
  myTasks: (role?: string, includeFinished?: boolean) =>
    role === undefined
      ? (["production", "my-tasks"] as const)
      : (["production", "my-tasks", role, includeFinished ?? false] as const),
  qcQueue: () => ["production", "qc-queue"] as const,
  timeline: (entity?: "jobs" | "tasks", id?: string) =>
    entity === undefined
      ? (["production", "timeline"] as const)
      : (["production", "timeline", entity, id ?? ""] as const)
} as const;
