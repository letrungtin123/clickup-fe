import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";

import type { Placement, TaskDetail, TaskPage, TaskSummary } from "@/contracts/work";
import { qk, type TaskQueryParams } from "@/lib/query-keys";

/**
 * Task cache reconciliation. Every view keeps server pages under `qk.tasks(projectId, query)`
 * (infinite pages, or a flat page for lazily loaded subtasks with a "children" suffix). Instead of
 * refetching after each edit we place the updated summary where it belongs in every cached query:
 * replace it in place, move it into/out of status groups, or drop it when it no longer matches.
 * Realtime events still invalidate afterwards, so the server stays authoritative.
 */

export type TaskPages = InfiniteData<TaskPage, string | undefined>;
type CachedTaskData = TaskPages | TaskPage;

const isInfinite = (data: CachedTaskData): data is TaskPages => "pages" in data;

/** Flattened, de-duplicated items of an infinite task query (pages can overlap after moves). */
export const flattenPages = (data: { pages: readonly TaskPage[] } | undefined): TaskSummary[] => {
  if (!data) return [];
  const seen = new Set<string>();
  const items: TaskSummary[] = [];
  for (const page of data.pages) {
    for (const item of page.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
  }
  return items;
};

const compareRank = (a: Pick<TaskSummary, "rank" | "id">, b: Pick<TaskSummary, "rank" | "id">) =>
  a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Does `task` belong to the result of `query`? "unknown" when the server-only search applies. */
export const taskMatchesQuery = (
  task: TaskSummary,
  query: TaskQueryParams,
  selfId?: string | null,
  now: Date = new Date()
): boolean | "unknown" => {
  if (query.listId && task.listId !== query.listId) return false;
  if (query.parent === "root" && task.parentTaskId !== null) return false;
  if (query.parent && query.parent !== "root" && task.parentTaskId !== query.parent) return false;
  if (query.statusIds?.length && !query.statusIds.includes(task.status.id)) return false;
  if (query.includeDone === false && task.status.category !== "active") return false;
  if (query.priorities?.length && !query.priorities.includes(task.priority)) return false;
  if (query.assigneeIds?.length) {
    const ids = query.assigneeIds.map((id) => (id === "me" ? (selfId ?? "") : id));
    const assigned = task.assignees.some((user) => ids.includes(user.id));
    const unassigned = query.assigneeIds.includes("none") && task.assignees.length === 0;
    if (!assigned && !unassigned) return false;
  }
  const due = task.dueAt ? new Date(task.dueAt).getTime() : null;
  if (query.due === "none" && due !== null) return false;
  if (query.due === "overdue" && (due === null || due >= now.getTime() || task.completedAt)) return false;
  if (query.dueFrom && (due === null || due < new Date(query.dueFrom).getTime())) return false;
  if (query.dueTo && (due === null || due >= new Date(query.dueTo).getTime())) return false;
  if (query.q) return "unknown";
  return true;
};

type Anchor = { placement?: Placement | null | undefined };

const insertIntoItems = (
  items: TaskSummary[],
  task: TaskSummary,
  placement: Placement | null | undefined,
  byRank: boolean,
  isLastPage: boolean
): TaskSummary[] | null => {
  if (placement?.afterId) {
    const index = items.findIndex((item) => item.id === placement.afterId);
    if (index !== -1) return [...items.slice(0, index + 1), task, ...items.slice(index + 1)];
  }
  if (placement?.beforeId) {
    const index = items.findIndex((item) => item.id === placement.beforeId);
    if (index !== -1) return [...items.slice(0, index), task, ...items.slice(index)];
  }
  if (placement && (placement.afterId || placement.beforeId)) return null;
  if (byRank) {
    const index = items.findIndex((item) => compareRank(task, item) < 0);
    if (index !== -1) return [...items.slice(0, index), task, ...items.slice(index)];
  }
  return isLastPage ? [...items, task] : null;
};

/** Inserts into one cached query's data. Returns the same object when the task cannot be placed. */
const insertIntoData = <T extends CachedTaskData>(
  data: T,
  task: TaskSummary,
  query: TaskQueryParams,
  anchor: Anchor
): T => {
  const byRank = !query.sort || query.sort === "rank";
  if (!anchor.placement && !byRank) return data;
  if (!isInfinite(data)) {
    const items = insertIntoItems(data.items, task, anchor.placement, byRank, !data.pageInfo.hasMore);
    return items ? ({ ...data, items }) : data;
  }
  const pages = data.pages;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!page) continue;
    const isLast = index === pages.length - 1;
    // Anchored inserts look for the anchor in every page; rank inserts stop at the first slot.
    const items = insertIntoItems(page.items, task, anchor.placement, byRank, isLast && !page.pageInfo.hasMore);
    if (items) {
      const nextPages = [...pages];
      nextPages[index] = { ...page, items };
      return { ...data, pages: nextPages };
    }
  }
  if (pages.length === 0) {
    return data;
  }
  return data;
};

const mapItems = <T extends CachedTaskData>(data: T, fn: (items: TaskSummary[]) => TaskSummary[]): T => {
  if (!isInfinite(data)) {
    const items = fn(data.items);
    return items === data.items ? data : ({ ...data, items });
  }
  let changed = false;
  const pages = data.pages.map((page) => {
    const items = fn(page.items);
    if (items === page.items) return page;
    changed = true;
    return { ...page, items };
  });
  return changed ? ({ ...data, pages }) : data;
};

const containsTask = (data: CachedTaskData, taskId: string) =>
  isInfinite(data)
    ? data.pages.some((page) => page.items.some((item) => item.id === taskId))
    : data.items.some((item) => item.id === taskId);

const withoutTask = (items: TaskSummary[], taskId: string) =>
  items.some((item) => item.id === taskId) ? items.filter((item) => item.id !== taskId) : items;

const replaceTask = (items: TaskSummary[], task: TaskSummary) =>
  items.some((item) => item.id === task.id) ? items.map((item) => (item.id === task.id ? task : item)) : items;

const queryOfKey = (key: QueryKey): TaskQueryParams | null => {
  const query = key[3];
  return query && typeof query === "object" ? (query) : null;
};

export type ReconcileOptions = {
  selfId?: string | null | undefined;
  /** Insert into matching queries that do not contain the task yet (default true). */
  insert?: boolean | undefined;
  /** Exact placement in one query (drag & drop / quick add), keyed by that query's key. */
  anchor?: { queryKey: QueryKey; placement: Placement | null | undefined } | undefined;
  /** Keep the current position when the rank did not change (default true). */
  keepPosition?: boolean | undefined;
  /** The task was just created: when it was not cached yet, its parent gains a subtask. */
  created?: boolean | undefined;
};

const isOpen = (task: Pick<TaskSummary, "status">) => task.status.category === "active";

type CountDelta = { total: number; open: number };

/**
 * Keeps a parent's subtask counters ("2/5" on its row) in step with its children (BUG-WK-19). A cached
 * parent detail is authoritative (its counters were recomputed from its subtask list); otherwise the
 * delta is applied to every cached row of the parent.
 */
const propagateParentCounts = (client: QueryClient, projectId: string, parentId: string, delta: CountDelta) => {
  if (delta.total === 0 && delta.open === 0) return;
  const detail = client.getQueryData<TaskDetail>(qk.task(parentId));
  patchTaskRows(client, projectId, parentId, (row) =>
    detail && "subtasks" in detail
      ? { subtaskCount: detail.subtaskCount, openSubtaskCount: detail.openSubtaskCount }
      : {
          subtaskCount: Math.max(0, row.subtaskCount + delta.total),
          openSubtaskCount: Math.max(0, row.openSubtaskCount + delta.open)
        }
  );
};

/** Parent counter changes implied by `next` replacing `previous` (undefined = not cached before). */
export const subtaskCountDeltas = (
  previous: Pick<TaskSummary, "parentTaskId" | "status"> | undefined,
  next: Pick<TaskSummary, "parentTaskId" | "status"> | null,
  created = false
): Map<string, CountDelta> => {
  const deltas = new Map<string, CountDelta>();
  const add = (parentId: string | null, total: number, open: number) => {
    if (!parentId) return;
    const current = deltas.get(parentId) ?? { total: 0, open: 0 };
    deltas.set(parentId, { total: current.total + total, open: current.open + open });
  };
  if (!previous) {
    if (created && next) add(next.parentTaskId, 1, isOpen(next) ? 1 : 0);
    return deltas;
  }
  if (!next) {
    add(previous.parentTaskId, -1, isOpen(previous) ? -1 : 0);
    return deltas;
  }
  if (previous.parentTaskId !== next.parentTaskId) {
    add(previous.parentTaskId, -1, isOpen(previous) ? -1 : 0);
    add(next.parentTaskId, 1, isOpen(next) ? 1 : 0);
  } else if (isOpen(previous) !== isOpen(next)) {
    add(next.parentTaskId, 0, isOpen(next) ? 1 : -1);
  }
  return deltas;
};

/**
 * Patches a task's rows (lists, boards, tables, My Tasks, its parent's subtask list) without touching
 * its own detail. `fn` returns the fields to change.
 */
export const patchTaskRows = (
  client: QueryClient,
  projectId: string,
  taskId: string,
  fn: (task: TaskSummary) => Partial<TaskSummary>
) => {
  const apply = (items: TaskSummary[]) =>
    items.some((item) => item.id === taskId)
      ? items.map((item) => (item.id === taskId ? { ...item, ...fn(item) } : item))
      : items;
  for (const prefix of [qk.tasks(projectId), qk.myTasks()]) {
    for (const [key, data] of client.getQueriesData<CachedTaskData>({ queryKey: prefix })) {
      if (!data || !("pages" in data || "items" in data) || !containsTask(data, taskId)) continue;
      client.setQueryData(key, mapItems(data, apply));
    }
  }
  for (const [key, detail] of client.getQueriesData<TaskDetail>({ queryKey: ["task"] })) {
    if (!detail || key.length !== 2 || !("subtasks" in detail) || detail.id === taskId) continue;
    const subtasks = apply(detail.subtasks);
    if (subtasks !== detail.subtasks) client.setQueryData<TaskDetail>(key, { ...detail, subtasks });
  }
};

/** Patches a task everywhere it is cached: its rows and its own detail (comment / attachment counters). */
export const patchTaskEverywhere = (
  client: QueryClient,
  projectId: string,
  taskId: string,
  fn: (task: TaskSummary) => Partial<TaskSummary>
) => {
  patchTaskRows(client, projectId, taskId, fn);
  client.setQueryData<TaskDetail>(qk.task(taskId), (detail) => (detail ? { ...detail, ...fn(detail) } : detail));
};

/** Places an up-to-date summary in every cached task query, the detail and the parent's subtasks. */
export const reconcileTask = (client: QueryClient, task: TaskSummary, options: ReconcileOptions = {}) => {
  const insert = options.insert ?? true;
  const anchorKey = options.anchor ? JSON.stringify(options.anchor.queryKey) : null;
  const previous = findCachedTask(client, task.id, task.projectId);

  for (const [key, data] of client.getQueriesData<CachedTaskData>({ queryKey: qk.tasks(task.projectId) })) {
    if (!data) continue;
    const query = queryOfKey(key);
    if (!query) continue;
    const isAnchor = anchorKey !== null && JSON.stringify(key) === anchorKey;
    const match = isAnchor ? true : taskMatchesQuery(task, query, options.selfId);
    const present = containsTask(data, task.id);
    let next: CachedTaskData = data;

    if (match === false) {
      next = present ? mapItems(data, (items) => withoutTask(items, task.id)) : data;
    } else if (present && !isAnchor) {
      const byRank = !query.sort || query.sort === "rank";
      const current = isInfinite(data)
        ? data.pages.flatMap((page) => page.items).find((item) => item.id === task.id)
        : data.items.find((item) => item.id === task.id);
      if (byRank && current && current.rank !== task.rank && options.keepPosition === false) {
        const removed = mapItems(data, (items) => withoutTask(items, task.id));
        next = insertIntoData(removed, task, query, {});
      } else {
        next = mapItems(data, (items) => replaceTask(items, task));
      }
    } else if (isAnchor || (match === true && insert)) {
      const removed = present ? mapItems(data, (items) => withoutTask(items, task.id)) : data;
      next = insertIntoData(removed, task, query, isAnchor ? { placement: options.anchor?.placement } : {});
    }
    if (next !== data) client.setQueryData(key, next);
  }

  // "My tasks": keep membership in sync (assignment / completion), never insert (other sort orders).
  for (const [key, data] of client.getQueriesData<TaskPages>({ queryKey: qk.myTasks() })) {
    if (!data || !containsTask(data, task.id)) continue;
    const query = (key[1] ?? {}) as TaskQueryParams;
    const stillMine = !options.selfId || task.assignees.some((user) => user.id === options.selfId);
    const visible = query.includeDone !== false || task.status.category === "active";
    client.setQueryData(
      key,
      mapItems(data, (items) => (stillMine && visible ? replaceTask(items, task) : withoutTask(items, task.id)))
    );
  }

  // Task details: the task itself and any parent listing it among its subtasks.
  for (const [key, detail] of client.getQueriesData<TaskDetail>({ queryKey: ["task"] })) {
    if (!detail || key.length !== 2 || typeof detail !== "object" || !("subtasks" in detail)) continue;
    if (detail.id === task.id) {
      client.setQueryData<TaskDetail>(key, { ...detail, ...task });
      continue;
    }
    const listed = detail.subtasks.some((item) => item.id === task.id);
    if (task.parentTaskId === detail.id) {
      const subtasks = listed
        ? detail.subtasks.map((item) => (item.id === task.id ? task : item))
        : [...detail.subtasks, task].sort(compareRank);
      client.setQueryData<TaskDetail>(key, { ...detail, subtasks, ...subtaskCounts(subtasks) });
    } else if (listed) {
      const subtasks = detail.subtasks.filter((item) => item.id !== task.id);
      client.setQueryData<TaskDetail>(key, { ...detail, subtasks, ...subtaskCounts(subtasks) });
    }
  }

  for (const [parentId, delta] of subtaskCountDeltas(previous, task, options.created)) {
    propagateParentCounts(client, task.projectId, parentId, delta);
  }
};

const subtaskCounts = (subtasks: TaskSummary[]) => ({
  subtaskCount: subtasks.length,
  openSubtaskCount: subtasks.filter((item) => item.status.category === "active").length
});

/** Removes a task (deleted / moved away) from every cached list, board, table and detail. */
export const removeTaskEverywhere = (client: QueryClient, projectId: string, taskId: string) => {
  const previous = findCachedTask(client, taskId, projectId);
  for (const [key, data] of client.getQueriesData<CachedTaskData>({ queryKey: qk.tasks(projectId) })) {
    if (data && containsTask(data, taskId)) {
      client.setQueryData(key, mapItems(data, (items) => withoutTask(items, taskId)));
    }
  }
  for (const [key, data] of client.getQueriesData<TaskPages>({ queryKey: qk.myTasks() })) {
    if (data && containsTask(data, taskId)) {
      client.setQueryData(key, mapItems(data, (items) => withoutTask(items, taskId)));
    }
  }
  for (const [key, detail] of client.getQueriesData<TaskDetail>({ queryKey: ["task"] })) {
    if (!detail || key.length !== 2 || !("subtasks" in detail)) continue;
    if (detail.subtasks.some((item) => item.id === taskId)) {
      const subtasks = detail.subtasks.filter((item) => item.id !== taskId);
      client.setQueryData<TaskDetail>(key, { ...detail, subtasks, ...subtaskCounts(subtasks) });
    }
  }
  for (const [parentId, delta] of subtaskCountDeltas(previous, null)) {
    propagateParentCounts(client, projectId, parentId, delta);
  }
};

/** Latest cached summary of a task (lists first, then detail). */
export const findCachedTask = (client: QueryClient, taskId: string, projectId?: string): TaskSummary | undefined => {
  const detail = client.getQueryData<TaskDetail>(qk.task(taskId));
  if (detail) return detail;
  const prefixes: QueryKey[] = projectId ? [qk.tasks(projectId), qk.myTasks()] : [["project"], qk.myTasks()];
  for (const prefix of prefixes) {
    for (const [, data] of client.getQueriesData<CachedTaskData>({ queryKey: prefix })) {
      if (!data || typeof data !== "object" || !("pages" in data || "items" in data)) continue;
      const found = isInfinite(data)
        ? data.pages.flatMap((page) => page.items).find((item) => item.id === taskId)
        : data.items.find((item) => item.id === taskId);
      if (found) return found;
    }
  }
  for (const [, detail] of client.getQueriesData<TaskDetail>({ queryKey: ["task"] })) {
    const found = detail && "subtasks" in detail ? detail.subtasks.find((item) => item.id === taskId) : undefined;
    if (found) return found;
  }
  return undefined;
};

export type TaskCacheSnapshot = [QueryKey, unknown][];

/** References (no copies) of everything a task mutation may touch, for rollback. */
export const snapshotTaskCaches = (client: QueryClient, projectId: string): TaskCacheSnapshot => [
  ...client.getQueriesData({ queryKey: qk.tasks(projectId) }),
  ...client.getQueriesData({ queryKey: qk.myTasks() }),
  ...client.getQueriesData({ queryKey: ["task"] }).filter(([key]) => key.length === 2)
];

export const restoreTaskCaches = (client: QueryClient, snapshot: TaskCacheSnapshot) => {
  for (const [key, data] of snapshot) client.setQueryData(key, data);
};

/** Cancels in-flight task fetches so they cannot overwrite an optimistic update. */
export const cancelTaskQueries = (client: QueryClient, projectId: string) =>
  Promise.all([
    client.cancelQueries({ queryKey: qk.tasks(projectId) }),
    client.cancelQueries({ queryKey: qk.myTasks() })
  ]);
