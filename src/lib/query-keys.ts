import type { TaskPriority, TaskSort } from "@/contracts/work";

/**
 * Query-key factory. Keys are hierarchical so one prefix invalidates a whole subtree:
 *
 *   ["session"]                                  current user + org + role (GET /workspace/context)
 *   ["projects"]                                 sidebar collection (projects + lists)
 *   ["project", id]                              one project (detail)
 *   ["project", id, "members"]                   project members
 *   ["project", id, "statuses", listId|"*"]      status workflow
 *   ["project", id, "tasks", normalizedQuery]    task pages (infinite)
 *   ["task", id]                                 task detail
 *   ["task", id, "timeline"]                     unified comments + activity timeline
 *   ["my-tasks", normalizedQuery]                cross-project "My tasks"
 *   ["directory", { q, projectId, channelId }]   people picker
 *   ["admin", ...]                               roles / permissions / org members
 *   ["chat", ...]                                channels / DMs / messages (chat UI)
 *   ["presence", sortedUserIds]                  realtime presence poll
 *   ["knowledge", ...]                           knowledge base spaces / items (see qk.knowledge)
 */

export type TaskQueryParams = {
  listId?: string | undefined;
  /** "root" = top-level only; a task id = its direct subtasks; omitted = all levels. */
  parent?: "root" | (string & {}) | undefined;
  statusIds?: readonly string[] | undefined;
  /** user ids, or "me" / "none". */
  assigneeIds?: readonly string[] | undefined;
  priorities?: readonly TaskPriority[] | undefined;
  /** Timezone-independent buckets; date windows (today / this week) go through dueFrom/dueTo. */
  due?: "overdue" | "none" | undefined;
  dueFrom?: string | undefined;
  dueTo?: string | undefined;
  includeDone?: boolean | undefined;
  q?: string | undefined;
  sort?: TaskSort | undefined;
  order?: "asc" | "desc" | undefined;
  limit?: number | undefined;
};

const taskQueryDefaults = { includeDone: true, sort: "rank", order: "asc", limit: 50 } as const;

/**
 * Canonical form of a task query so equivalent queries share one cache entry: drops undefined/empty
 * values and server defaults, trims the search term, and sorts multi-value filters.
 */
export const normalizeTaskQuery = (query: TaskQueryParams = {}): TaskQueryParams => {
  const normalized: TaskQueryParams = {};
  if (query.listId) normalized.listId = query.listId;
  if (query.parent) normalized.parent = query.parent;
  if (query.statusIds?.length) normalized.statusIds = [...new Set(query.statusIds)].sort();
  if (query.assigneeIds?.length) normalized.assigneeIds = [...new Set(query.assigneeIds)].sort();
  if (query.priorities?.length) normalized.priorities = [...new Set(query.priorities)].sort();
  if (query.due) normalized.due = query.due;
  if (query.dueFrom) normalized.dueFrom = query.dueFrom;
  if (query.dueTo) normalized.dueTo = query.dueTo;
  if (query.includeDone !== undefined && query.includeDone !== taskQueryDefaults.includeDone) {
    normalized.includeDone = query.includeDone;
  }
  const q = query.q?.trim();
  if (q) normalized.q = q;
  if (query.sort && query.sort !== taskQueryDefaults.sort) normalized.sort = query.sort;
  if (query.order && query.order !== taskQueryDefaults.order) normalized.order = query.order;
  if (query.limit !== undefined && query.limit !== taskQueryDefaults.limit)
    normalized.limit = query.limit;
  return normalized;
};

export type DirectoryParams = {
  q?: string | undefined;
  projectId?: string | undefined;
  channelId?: string | undefined;
};

export const qk = {
  session: () => ["session"] as const,

  projects: () => ["projects"] as const,
  project: (projectId: string) => ["project", projectId] as const,
  projectMembers: (projectId: string) => ["project", projectId, "members"] as const,
  statuses: (projectId: string, listId?: string | null) =>
    ["project", projectId, "statuses", listId ?? "*"] as const,

  /** Without `query`: prefix matching every task page of the project (for invalidation). */
  tasks: (projectId: string, query?: TaskQueryParams) =>
    query === undefined
      ? (["project", projectId, "tasks"] as const)
      : (["project", projectId, "tasks", normalizeTaskQuery(query)] as const),
  task: (taskId: string) => ["task", taskId] as const,
  timeline: (taskId: string) => ["task", taskId, "timeline"] as const,
  myTasks: (query?: TaskQueryParams) =>
    query === undefined
      ? (["my-tasks"] as const)
      : (["my-tasks", normalizeTaskQuery(query)] as const),

  directory: (params: DirectoryParams = {}) =>
    [
      "directory",
      {
        q: params.q?.trim() || null,
        projectId: params.projectId ?? null,
        channelId: params.channelId ?? null
      }
    ] as const,

  admin: {
    all: () => ["admin"] as const,
    permissions: () => ["admin", "permissions"] as const,
    roles: () => ["admin", "roles"] as const,
    members: () => ["admin", "members"] as const
  },

  chat: {
    all: () => ["chat"] as const,
    channels: () => ["chat", "channels"] as const,
    channel: (channelId: string) => ["chat", "channel", channelId] as const,
    messages: (channelId: string, threadRootId?: string | null) =>
      ["chat", "channel", channelId, "messages", threadRootId ?? "root"] as const
  },

  notifications: {
    all: () => ["notifications"] as const,
    unreadCount: () => ["notifications", "unread-count"] as const,
    /** "mentions" = the "Nhắc đến" tab, filtered server side by type. */
    feed: (filter: "all" | "unread" | "mentions") => ["notifications", "feed", filter] as const
  },

  /**
   * Knowledge base (PD-031). Space-scoped lists live under the space so one prefix refreshes a space;
   * an item and everything about it (versions, history, comments) lives under the item.
   */
  knowledge: {
    all: () => ["knowledge"] as const,
    spaces: () => ["knowledge", "spaces"] as const,
    space: (spaceId: string) => ["knowledge", "space", spaceId] as const,
    members: (spaceId: string) => ["knowledge", "space", spaceId, "members"] as const,
    /** Without `query`: prefix for every item page of the space. */
    items: (spaceId: string, query?: Readonly<Record<string, unknown>>) =>
      query === undefined
        ? (["knowledge", "space", spaceId, "items"] as const)
        : (["knowledge", "space", spaceId, "items", query] as const),
    trash: (spaceId: string) => ["knowledge", "space", spaceId, "trash"] as const,
    audit: (spaceId: string, query?: Readonly<Record<string, unknown>>) =>
      query === undefined
        ? (["knowledge", "space", spaceId, "audit"] as const)
        : (["knowledge", "space", spaceId, "audit", query] as const),
    item: (itemId: string) => ["knowledge", "item", itemId] as const,
    versions: (itemId: string) => ["knowledge", "item", itemId, "versions"] as const,
    version: (itemId: string, number: number) => ["knowledge", "item", itemId, "version", number] as const,
    history: (itemId: string) => ["knowledge", "item", itemId, "history"] as const,
    comments: (itemId: string, filter?: "all" | "open") =>
      filter === undefined
        ? (["knowledge", "item", itemId, "comments"] as const)
        : (["knowledge", "item", itemId, "comments", filter] as const),
    replies: (itemId: string, commentId: string) =>
      ["knowledge", "item", itemId, "comments", "replies", commentId] as const,
    attachmentUrl: (attachmentId: string) => ["knowledge", "attachment-url", attachmentId] as const
  },

  search: (q: string, groups?: readonly string[]) =>
    ["search", q.trim().toLocaleLowerCase(), groups ? [...groups].sort() : "all"] as const,

  presence: (userIds: readonly string[]) => ["presence", [...new Set(userIds)].sort()] as const
} as const;
