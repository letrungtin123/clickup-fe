import { customFieldEmptyValue, type CustomField } from "@/contracts/production-catalog";

/**
 * "Lọc nhân viên" of the KPI report and the score board (ADMIN only — members' tags and custom values
 * are Admin data, others get 403 CUSTOM_FIELDS_FORBIDDEN): USER tags (any of them) and USER custom
 * fields such as "Năng lực" (several fields combine with AND, several values of one field with OR).
 * On the wire: `tagId=a&tagId=b&cf.nang_luc=a&cf.nang_luc=b` — repeated parameters, so they are built
 * here rather than with the API client's comma-joined arrays. Pure — unit tested in people-filter.test.ts.
 */

export type PeopleFilter = {
  tagIds: string[];
  /** One entry per field key, values = option values ("__empty__" = no value). */
  fields: { key: string; values: string[] }[];
};

export const emptyPeopleFilter: PeopleFilter = { tagIds: [], fields: [] };

/** Members' fields that can filter people by a list of values (SELECT / MULTISELECT, active). */
export const peopleFilterFields = (fields: readonly CustomField[]) =>
  fields
    .filter(
      (field) =>
        field.entity === "USER" &&
        field.active &&
        (field.type === "SELECT" || field.type === "MULTISELECT")
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "vi"));

/** Number of chosen values (badge on the "Lọc nhân viên" button). */
export const peopleFilterCount = (filter: PeopleFilter) =>
  filter.tagIds.length + filter.fields.reduce((sum, field) => sum + field.values.length, 0);

export const isPeopleFilterEmpty = (filter: PeopleFilter) => peopleFilterCount(filter) === 0;

const toggle = (list: readonly string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export const toggleTag = (filter: PeopleFilter, tagId: string): PeopleFilter => ({
  ...filter,
  tagIds: toggle(filter.tagIds, tagId)
});

/** Adds / removes one value of a field; a field without values is dropped. */
export const toggleFieldValue = (
  filter: PeopleFilter,
  key: string,
  value: string
): PeopleFilter => {
  const current = filter.fields.find((field) => field.key === key);
  const values = toggle(current?.values ?? [], value);
  if (values.length === 0) {
    return { ...filter, fields: filter.fields.filter((field) => field.key !== key) };
  }
  return {
    ...filter,
    fields: current
      ? filter.fields.map((field) => (field.key === key ? { key, values } : field))
      : [...filter.fields, { key, values }]
  };
};

/** Query pairs for the API (repeated names), in a stable order. */
export const peopleFilterPairs = (filter: PeopleFilter): [string, string][] => [
  ...[...filter.tagIds].sort().map((id): [string, string] => ["tagId", id]),
  ...[...filter.fields]
    .sort((a, b) => a.key.localeCompare(b.key))
    .flatMap((field) =>
      [...field.values].sort().map((value): [string, string] => [`cf.${field.key}`, value])
    )
];

/**
 * `?a=1&b=2` from plain parameters (empty ones skipped) and the filter pairs; "" when nothing is set.
 */
export const searchWithPeopleFilter = (
  query: Record<string, string | null | undefined>,
  filter: PeopleFilter
) => {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(name, value);
  }
  for (const [name, value] of peopleFilterPairs(filter)) params.append(name, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

/** Cache-key part: the same filter always gives the same text. */
export const peopleFilterKey = (filter: PeopleFilter) =>
  peopleFilterPairs(filter)
    .map(([name, value]) => `${name}=${value}`)
    .join("&");

/** Reads a filter from page search params (`tag=` and `cf.<key>=`, repeated). */
export const peopleFilterFromParams = (params: URLSearchParams): PeopleFilter => {
  const fields = new Map<string, string[]>();
  for (const [name, value] of params) {
    const match = /^cf\.([a-z][a-z0-9_]{0,39})$/.exec(name);
    if (match && value) fields.set(match[1]!, [...(fields.get(match[1]!) ?? []), value]);
  }
  return {
    tagIds: params.getAll("tag").filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
    fields: [...fields].map(([key, values]) => ({ key, values: [...new Set(values)] }))
  };
};

/** Writes a filter into page search params (replacing the previous one). */
export const withPeopleFilterParams = (params: URLSearchParams, filter: PeopleFilter) => {
  const next = new URLSearchParams(params);
  for (const name of [...next.keys()]) {
    if (name === "tag" || name.startsWith("cf.")) next.delete(name);
  }
  for (const id of filter.tagIds) next.append("tag", id);
  for (const field of filter.fields) {
    for (const value of field.values) next.append(`cf.${field.key}`, value);
  }
  return next;
};

/** "Năng lực: A++, A · Tag: Kiêm QC" — summary of the active filter for captions and exports. */
export const describePeopleFilter = (
  filter: PeopleFilter,
  lookups: { fields: readonly CustomField[]; tagName: (id: string) => string | undefined }
) => {
  const parts = filter.fields.map((item) => {
    const field = lookups.fields.find((candidate) => candidate.key === item.key);
    const labels = item.values.map((value) =>
      value === customFieldEmptyValue
        ? "Chưa có"
        : (field?.options.find((option) => option.value === value)?.label ?? value)
    );
    return `${field?.label ?? item.key}: ${labels.join(", ")}`;
  });
  if (filter.tagIds.length > 0) {
    parts.push(`Tag: ${filter.tagIds.map((id) => lookups.tagName(id) ?? "tag đã xoá").join(", ")}`);
  }
  return parts.join(" · ");
};
