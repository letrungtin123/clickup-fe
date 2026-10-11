import {
  customFieldEmptyValue,
  customFieldKeyPattern,
  type CustomField
} from "@/contracts/production-catalog";
import type { QueryValue } from "@/lib/api/client";

import { formatCustomValue, isOptionType } from "./custom-fields";
import { formatDay } from "./format";

/**
 * Custom-field and tag filters of the production lists (PLAN §8 "trường hiện trong form, bảng và bộ
 * lọc"): jobs, "Việc của tôi", Hàng chờ QC, clients and members. The URL and the API use the same
 * parameters — `cf.<key>=<value>` (repeated), `cf.<key>.from` / `cf.<key>.to` for NUMBER / DATE and
 * `__empty__` for "no value" — plus the tag ids (`tag` in the URL, `tagId` for the API; several = any
 * of them). Pure functions, unit tested in list-filters.test.ts.
 */

/** Filter value meaning "the field has no value" (contracts `customFieldEmptyValue`). */
export const EMPTY_FILTER_VALUE = customFieldEmptyValue;

export type FieldFilter = { values: string[]; from: string | null; to: string | null };

export type ListFilters = {
  tagIds: string[];
  /** By field key; an entry without values or range is ignored. */
  fields: Readonly<Record<string, FieldFilter>>;
};

export const emptyListFilters: ListFilters = { tagIds: [], fields: {} };
export const emptyFieldFilter: FieldFilter = { values: [], from: null, to: null };

const MAX_FIELDS = 10;
const MAX_VALUES = 50;
const MAX_TAGS = 50;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dayPattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const numberPattern = /^-?\d+(\.\d+)?$/;
const cfParam = /^cf\.([^.]+)(?:\.(from|to))?$/;

const unique = (values: readonly string[]) => [...new Set(values)];

export const isFieldFilterActive = (filter: FieldFilter | undefined): filter is FieldFilter =>
  filter !== undefined && (filter.values.length > 0 || filter.from !== null || filter.to !== null);

/** Active field filters in a stable order (insertion order of the record). */
export const activeFieldFilters = (filters: ListFilters) =>
  Object.entries(filters.fields).filter((entry): entry is [string, FieldFilter] =>
    isFieldFilterActive(entry[1])
  );

/** Tags count as one filter; every field with a value or a range counts as one. */
export const activeListFilterCount = (filters: ListFilters) =>
  (filters.tagIds.length > 0 ? 1 : 0) + activeFieldFilters(filters).length;

/** Tag ids (`tagParam`, repeated) and `cf.<key>[.from|.to]` parameters of a URL. */
export const listFiltersFromSearch = (params: URLSearchParams, tagParam = "tag"): ListFilters => {
  const tagIds = unique(params.getAll(tagParam).filter((id) => uuid.test(id))).slice(0, MAX_TAGS);
  const fields: Record<string, FieldFilter> = {};
  for (const [name, raw] of params) {
    const match = cfParam.exec(name);
    const key = match?.[1];
    const value = raw.trim().slice(0, 200);
    if (!match || !key || !customFieldKeyPattern.test(key) || !value) continue;
    if (!fields[key] && Object.keys(fields).length >= MAX_FIELDS) continue;
    const current = fields[key] ?? { values: [], from: null, to: null };
    if (match[2] === "from") current.from = value.slice(0, 40);
    else if (match[2] === "to") current.to = value.slice(0, 40);
    else if (current.values.length < MAX_VALUES && !current.values.includes(value))
      current.values.push(value);
    fields[key] = current;
  }
  return { tagIds, fields };
};

/** Writes the filters into a copy of `params` (other parameters kept, previous tag / cf ones replaced). */
export const listFiltersToSearch = (
  filters: ListFilters,
  params: URLSearchParams = new URLSearchParams(),
  tagParam = "tag"
) => {
  const next = new URLSearchParams();
  for (const [name, value] of params) {
    if (name !== tagParam && !cfParam.test(name)) next.append(name, value);
  }
  for (const id of filters.tagIds) next.append(tagParam, id);
  for (const [key, filter] of activeFieldFilters(filters)) {
    for (const value of filter.values) next.append(`cf.${key}`, value);
    if (filter.from !== null) next.set(`cf.${key}.from`, filter.from);
    if (filter.to !== null) next.set(`cf.${key}.to`, filter.to);
  }
  return next;
};

const cleanNumber = (value: string | null) => {
  if (value === null) return null;
  const normalized = value.trim().replace(",", ".");
  return numberPattern.test(normalized) && Math.abs(Number(normalized)) <= 1e12 ? normalized : null;
};
/** A real calendar day (no 31/02). */
const isCalendarDay = (value: string) => {
  if (!dayPattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const cleanDay = (value: string | null) => (value !== null && isCalendarDay(value) ? value : null);

/**
 * Keeps what the API accepts for the entity's active fields (anything else answers 400
 * CUSTOM_FIELD_FILTER_INVALID): known keys, existing options, numbers and days; ranges only on
 * NUMBER / DATE. A stale URL (field archived, option removed) then simply drops that part.
 */
export const sanitizeListFilters = (
  filters: ListFilters,
  fields: readonly CustomField[],
  tagIds?: ReadonlySet<string>
): ListFilters => {
  const byKey = new Map(fields.filter((field) => field.active).map((field) => [field.key, field]));
  const next: Record<string, FieldFilter> = {};
  for (const [key, filter] of activeFieldFilters(filters)) {
    const field = byKey.get(key);
    if (!field) continue;
    const empty = filter.values.includes(EMPTY_FILTER_VALUE) ? [EMPTY_FILTER_VALUE] : [];
    let values: string[];
    let from: string | null = null;
    let to: string | null = null;
    if (isOptionType(field.type)) {
      const allowed = new Set(field.options.map((option) => option.value));
      values = filter.values.filter((value) => allowed.has(value));
    } else if (field.type === "TEXT") {
      values = filter.values.filter((value) => value !== EMPTY_FILTER_VALUE);
    } else if (field.type === "NUMBER") {
      values = filter.values.flatMap((value) => {
        const number = value === EMPTY_FILTER_VALUE ? null : cleanNumber(value);
        return number === null ? [] : [number];
      });
      from = cleanNumber(filter.from);
      to = cleanNumber(filter.to);
    } else {
      values = filter.values.filter(isCalendarDay);
      from = cleanDay(filter.from);
      to = cleanDay(filter.to);
    }
    const result = { values: unique([...values, ...empty]), from, to };
    if (isFieldFilterActive(result)) next[key] = result;
  }
  return {
    tagIds: tagIds ? filters.tagIds.filter((id) => tagIds.has(id)) : filters.tagIds,
    fields: next
  };
};

/** API parameters: `tagId` (repeated) and `cf.<key>` / `cf.<key>.from` / `cf.<key>.to`. */
export const listFiltersToQuery = (filters: ListFilters): Record<string, QueryValue> => {
  const query: Record<string, QueryValue> = {};
  if (filters.tagIds.length > 0) query.tagId = filters.tagIds;
  for (const [key, filter] of activeFieldFilters(filters)) {
    if (filter.values.length > 0) query[`cf.${key}`] = filter.values;
    if (filter.from !== null) query[`cf.${key}.from`] = filter.from;
    if (filter.to !== null) query[`cf.${key}.to`] = filter.to;
  }
  return query;
};

/**
 * `path?query` where arrays repeat their parameter (`tagId=a&tagId=b`). The production list
 * endpoints read repeated parameters; the shared API client joins arrays with commas instead.
 */
export const queryPath = (path: string, query: Record<string, QueryValue>) => {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value as readonly string[]) if (item !== "") params.append(name, item);
    } else {
      params.set(name, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
};

/** Updates one field's filter (an empty filter removes the key). */
export const withFieldFilter = (filters: ListFilters, key: string, filter: FieldFilter | null) => {
  const fields: Record<string, FieldFilter> = { ...filters.fields };
  if (filter && isFieldFilterActive(filter)) fields[key] = filter;
  else delete fields[key];
  return { ...filters, fields };
};

const formatNumberText = (value: string) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(Number(value));

/** Short summary for a filter chip: "Gấp, Rất gấp", "chứa “ĐH26”", "01/10 – 31/10", "Chưa có". */
export const describeFieldFilter = (field: CustomField, filter: FieldFilter) => {
  const parts: string[] = [];
  const values = filter.values.filter((value) => value !== EMPTY_FILTER_VALUE);
  if (isOptionType(field.type)) {
    parts.push(
      ...values.map(
        (value) => formatCustomValue(field, field.type === "SELECT" ? value : [value]) || value
      )
    );
  } else if (field.type === "TEXT") {
    parts.push(...values.map((value) => `chứa “${value}”`));
  } else {
    const show = (value: string) =>
      field.type === "DATE" ? formatDay(value) : formatNumberText(value);
    parts.push(...values.map(show));
    if (filter.from !== null && filter.to !== null)
      parts.push(`${show(filter.from)} – ${show(filter.to)}`);
    else if (filter.from !== null) parts.push(`từ ${show(filter.from)}`);
    else if (filter.to !== null) parts.push(`đến ${show(filter.to)}`);
  }
  if (filter.values.includes(EMPTY_FILTER_VALUE)) parts.push("Chưa có");
  return parts.join(", ");
};
