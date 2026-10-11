import type {
  KnowledgeAuditAction,
  KnowledgeImportance,
  KnowledgeStatusGroup
} from "@/contracts/knowledge";
import { KnowledgeAuditActionSchema } from "@/contracts/knowledge";

import type { KnowledgeSort } from "./labels";

/**
 * Space page filters live in the URL (shareable, back/forward friendly):
 *
 *   /k/:space?cat=<id>|none&status=<id,…>&group=draft,active&imp=critical,important&tag=a,b
 *            &owner=<id>|me&review=1&pinned=1&sort=updated&q=…
 *
 * and become the API query of GET /knowledge/spaces/:id/items. Multi-value filters are sent as repeated
 * parameters (`statusId=a&statusId=b`), which is what the contract's `x | x[]` query fields accept.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string | null | undefined): value is string =>
  typeof value === "string" && uuidPattern.test(value);

const importanceValues: readonly KnowledgeImportance[] = ["normal", "important", "critical"];
const groupValues: readonly KnowledgeStatusGroup[] = ["draft", "active", "retired"];
const sortValues: readonly KnowledgeSort[] = ["updated", "title", "importance", "reviewBy", "created"];

export type SpaceFilters = {
  /** A category id, "none" (uncategorized) or null (all items). */
  category: string | null;
  statusIds: string[];
  groups: KnowledgeStatusGroup[];
  importance: KnowledgeImportance[];
  tags: string[];
  /** A user id or "me". */
  owner: string | null;
  reviewDue: boolean;
  pinned: boolean;
  sort: KnowledgeSort;
  q: string;
};

export const defaultSort: KnowledgeSort = "updated";

export const emptyFilters = (): SpaceFilters => ({
  category: null,
  statusIds: [],
  groups: [],
  importance: [],
  tags: [],
  owner: null,
  reviewDue: false,
  pinned: false,
  sort: defaultSort,
  q: ""
});

const list = (raw: string | null) =>
  (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const unique = <T>(values: readonly T[]) => [...new Set(values)];

const oneOf = <T extends string>(values: readonly T[], raw: string): raw is T =>
  (values as readonly string[]).includes(raw);

/** Reads (and sanitizes) the filters from the URL; unknown values are dropped. */
export const parseSpaceFilters = (params: URLSearchParams): SpaceFilters => {
  const cat = params.get("cat");
  const owner = params.get("owner");
  const sort = params.get("sort") ?? "";
  return {
    category: cat === "none" || isUuid(cat) ? cat : null,
    statusIds: unique(list(params.get("status")).filter(isUuid)),
    groups: unique(list(params.get("group")).filter((value) => oneOf(groupValues, value))),
    importance: unique(list(params.get("imp")).filter((value) => oneOf(importanceValues, value))),
    tags: unique(list(params.get("tag")).map((tag) => tag.slice(0, 40))).slice(0, 10),
    owner: owner === "me" || isUuid(owner) ? owner : null,
    reviewDue: params.get("review") === "1",
    pinned: params.get("pinned") === "1",
    sort: oneOf(sortValues, sort) ? sort : defaultSort,
    q: (params.get("q") ?? "").slice(0, 120)
  };
};

/**
 * Writes the filters into a copy of `current` (other params such as an open dialog are kept). Defaults
 * are omitted so a clean page has a clean URL.
 */
export const writeSpaceFilters = (current: URLSearchParams, filters: SpaceFilters) => {
  const next = new URLSearchParams(current);
  const set = (key: string, value: string | null) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  set("cat", filters.category);
  set("status", filters.statusIds.join(","));
  set("group", filters.groups.join(","));
  set("imp", filters.importance.join(","));
  set("tag", filters.tags.join(","));
  set("owner", filters.owner);
  set("review", filters.reviewDue ? "1" : null);
  set("pinned", filters.pinned ? "1" : null);
  set("sort", filters.sort === defaultSort ? null : filters.sort);
  set("q", filters.q.trim() || null);
  return next;
};

/** Number of active filters (the "Lọc (3)" badge); category, sort and search are shown elsewhere. */
export const activeFilterCount = (filters: SpaceFilters) =>
  filters.statusIds.length +
  filters.groups.length +
  filters.importance.length +
  filters.tags.length +
  (filters.owner ? 1 : 0) +
  (filters.reviewDue ? 1 : 0) +
  (filters.pinned ? 1 : 0);

export const hasNarrowingFilters = (filters: SpaceFilters) =>
  activeFilterCount(filters) > 0 || filters.category !== null || filters.q.trim().length > 0;

export type ApiQueryValue = string | readonly string[] | number | undefined;
export type ApiQuery = Record<string, ApiQueryValue>;

/**
 * The item list query for the API. Canonical (sorted multi-values, defaults dropped) so it doubles as
 * the TanStack Query key.
 */
export const toItemQuery = (
  filters: SpaceFilters,
  { selfId, limit = 50 }: { selfId: string; limit?: number }
): ApiQuery => {
  const query: ApiQuery = {};
  if (filters.category === "none") query.uncategorized = "true";
  else if (filters.category) query.categoryId = filters.category;
  if (filters.statusIds.length) query.statusId = [...filters.statusIds].sort();
  if (filters.groups.length) query.group = [...filters.groups].sort();
  if (filters.importance.length) query.importance = [...filters.importance].sort();
  if (filters.tags.length) query.tag = [...filters.tags].sort();
  const owner = filters.owner === "me" ? selfId : filters.owner;
  if (owner) query.ownerId = owner;
  if (filters.reviewDue) query.reviewDue = "true";
  if (filters.pinned) query.pinned = "true";
  const q = filters.q.trim();
  if (q) query.q = q;
  if (filters.sort !== defaultSort) query.sort = filters.sort;
  if (limit !== 50) query.limit = limit;
  return query;
};

/**
 * `?a=1&tag=x&tag=y` — repeated keys for arrays (the generic client joins arrays with commas, which the
 * knowledge contract does not accept). Keys are emitted in sorted order for stable URLs.
 */
export const knowledgeQueryString = (query: ApiQuery | undefined) => {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const entry of value as readonly string[]) if (entry !== "") params.append(key, entry);
    } else {
      params.append(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
};

// --- Audit log filters ------------------------------------------------------------------------------

export type AuditFilters = {
  actorId: string | null;
  actions: KnowledgeAuditAction[];
  itemId: string | null;
  /** Calendar days "YYYY-MM-DD" (inclusive), interpreted in the viewer's time zone. */
  from: string | null;
  to: string | null;
};

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const auditActionValues = KnowledgeAuditActionSchema.options;

export const parseAuditFilters = (params: URLSearchParams): AuditFilters => {
  const actor = params.get("actor");
  const item = params.get("item");
  const from = params.get("from");
  const to = params.get("to");
  return {
    actorId: isUuid(actor) ? actor : null,
    actions: unique(list(params.get("action")).filter((value) => oneOf(auditActionValues, value))),
    itemId: isUuid(item) ? item : null,
    from: from && dayPattern.test(from) ? from : null,
    to: to && dayPattern.test(to) ? to : null
  };
};

export const writeAuditFilters = (current: URLSearchParams, filters: AuditFilters) => {
  const next = new URLSearchParams(current);
  const set = (key: string, value: string | null) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  set("actor", filters.actorId);
  set("action", filters.actions.join(","));
  set("item", filters.itemId);
  set("from", filters.from);
  set("to", filters.to);
  return next;
};

/** Local midnight of a calendar day as an ISO instant (with offset); `endOfDay` = the next midnight. */
export const dayToIso = (day: string, endOfDay = false) => {
  const [year, month, date] = day.split("-").map(Number);
  const local = new Date(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + (endOfDay ? 1 : 0));
  return local.toISOString();
};

export const toAuditQuery = (filters: AuditFilters, limit = 50): ApiQuery => {
  const query: ApiQuery = {};
  if (filters.actorId) query.actorId = filters.actorId;
  if (filters.itemId) query.itemId = filters.itemId;
  if (filters.actions.length) query.action = [...filters.actions].sort();
  if (filters.from) query.from = dayToIso(filters.from);
  if (filters.to) query.to = dayToIso(filters.to, true);
  if (limit !== 50) query.limit = limit;
  return query;
};
