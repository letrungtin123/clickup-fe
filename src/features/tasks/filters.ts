import { addDays, startOfDay, startOfWeek } from "date-fns";

import type { TaskPriority, TaskSort } from "@/contracts/work";
import type { TaskQueryParams } from "@/lib/query-keys";

/**
 * Filter / sort state shared by the List, Board and Table views. Lives in the URL so views are
 * shareable and survive reloads:
 *
 *   ?q=…&status=<id,id>&assignee=<id|me|none,…>&priority=urgent,high&due=overdue|today|week|none
 *   &done=0 (hide done/closed)  &sort=dueAt&order=desc (Table only)
 */

export type DueFilter = "overdue" | "today" | "week" | "none";
export type SortOrder = "asc" | "desc";

export type TaskFilters = {
  q: string;
  statusIds: string[];
  assigneeIds: string[];
  priorities: TaskPriority[];
  due: DueFilter | null;
  includeDone: boolean;
  sort: TaskSort;
  order: SortOrder;
};

export const defaultTaskFilters: TaskFilters = {
  q: "",
  statusIds: [],
  assigneeIds: [],
  priorities: [],
  due: null,
  includeDone: true,
  sort: "rank",
  order: "asc"
};

export const filterParamKeys = ["q", "status", "assignee", "priority", "due", "done", "sort", "order"] as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const priorities: readonly TaskPriority[] = ["urgent", "high", "normal", "low"];
const dueValues: readonly DueFilter[] = ["overdue", "today", "week", "none"];
const sortValues: readonly TaskSort[] = ["rank", "dueAt", "priority", "createdAt", "updatedAt", "title", "number"];

const csv = (value: string | null) =>
  value
    ? [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))].slice(0, 50)
    : [];

/** URL → filters. Unknown / malformed values are ignored (never trusted). */
export const parseTaskFilters = (params: URLSearchParams): TaskFilters => {
  const due = params.get("due");
  const sort = params.get("sort");
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    statusIds: csv(params.get("status")).filter((id) => uuidPattern.test(id)),
    assigneeIds: csv(params.get("assignee")).filter(
      (id) => id === "me" || id === "none" || uuidPattern.test(id)
    ),
    priorities: csv(params.get("priority")).filter((value): value is TaskPriority =>
      priorities.includes(value as TaskPriority)
    ),
    due: dueValues.includes(due as DueFilter) ? (due as DueFilter) : null,
    includeDone: params.get("done") !== "0",
    sort: sortValues.includes(sort as TaskSort) ? (sort as TaskSort) : "rank",
    order: params.get("order") === "desc" ? "desc" : "asc"
  };
};

/** Filters → URL. Returns a copy of `current` (other params such as view/task are preserved). */
export const writeTaskFilters = (current: URLSearchParams, filters: TaskFilters): URLSearchParams => {
  const next = new URLSearchParams(current);
  const set = (key: string, value: string | null) => {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  };
  set("q", filters.q.trim() || null);
  set("status", filters.statusIds.join(",") || null);
  set("assignee", filters.assigneeIds.join(",") || null);
  set("priority", filters.priorities.join(",") || null);
  set("due", filters.due);
  set("done", filters.includeDone ? null : "0");
  set("sort", filters.sort === "rank" ? null : filters.sort);
  set("order", filters.sort === "rank" || filters.order === "asc" ? null : filters.order);
  return next;
};

/** Removes every filter param (keeps view/task). */
export const clearTaskFilters = (current: URLSearchParams) => {
  const next = new URLSearchParams(current);
  for (const key of filterParamKeys) next.delete(key);
  return next;
};

/**
 * Due windows in the browser's timezone ("today" / "this week" are local notions); "overdue" and
 * "none" are timezone independent and evaluated by the server. Weeks start on Monday (vi-VN).
 */
export const dueWindow = (
  due: DueFilter | null,
  now: Date = new Date()
): Pick<TaskQueryParams, "due" | "dueFrom" | "dueTo"> => {
  if (due === "overdue" || due === "none") return { due };
  if (due === "today") {
    const start = startOfDay(now);
    return { dueFrom: start.toISOString(), dueTo: addDays(start, 1).toISOString() };
  }
  if (due === "week") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    return { dueFrom: start.toISOString(), dueTo: addDays(start, 7).toISOString() };
  }
  return {};
};

/** Filters that narrow the set beyond status (they switch hierarchical views to a flat result). */
export const hasNarrowingFilters = (filters: TaskFilters) =>
  filters.q.trim().length > 0 ||
  filters.assigneeIds.length > 0 ||
  filters.priorities.length > 0 ||
  filters.due !== null;

export const activeFilterCount = (filters: TaskFilters) =>
  (filters.q.trim() ? 1 : 0) +
  (filters.statusIds.length > 0 ? 1 : 0) +
  (filters.assigneeIds.length > 0 ? 1 : 0) +
  (filters.priorities.length > 0 ? 1 : 0) +
  (filters.due ? 1 : 0) +
  (filters.includeDone ? 0 : 1);

/**
 * Base server query for a view. List / Board group by status (statusIds are added per group);
 * Table sorts server side. Without narrowing filters only top-level tasks are listed (subtasks
 * expand lazily); with them every level is searched so matching subtasks are not hidden.
 */
export const filtersToQuery = (
  filters: TaskFilters,
  options: { listId: string; view: "list" | "board" | "table"; now?: Date }
): TaskQueryParams => {
  const flat = hasNarrowingFilters(filters);
  const query: TaskQueryParams = {
    listId: options.listId,
    parent: flat ? undefined : "root",
    assigneeIds: filters.assigneeIds,
    priorities: filters.priorities,
    includeDone: filters.includeDone,
    q: filters.q.trim() || undefined,
    ...dueWindow(filters.due, options.now)
  };
  if (options.view === "table") {
    query.statusIds = filters.statusIds;
    query.sort = filters.sort;
    query.order = filters.sort === "rank" ? "asc" : filters.order;
  }
  return query;
};
