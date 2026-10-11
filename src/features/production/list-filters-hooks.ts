import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import type { CustomFieldEntity } from "@/contracts/production-catalog";

import { fieldsFor } from "./custom-fields";
import { useCustomFields, useTags } from "./hooks";
import {
  activeListFilterCount,
  listFiltersFromSearch,
  listFiltersToQuery,
  listFiltersToSearch,
  sanitizeListFilters,
  type ListFilters
} from "./list-filters";

/**
 * Tag + custom-field filters of one list kept in the URL (`tag`, `cf.<key>…`), like the job filters:
 * shareable, back/forward friendly. Values are checked against the entity's active fields and the
 * known tags before they reach the API (a stale link drops what no longer exists instead of a 400).
 */
export const useUrlListFilters = (entity: CustomFieldEntity, { enabled = true } = {}) => {
  const [params, setParams] = useSearchParams();
  const customFields = useCustomFields(enabled);
  const tags = useTags(enabled);
  const fields = useMemo(
    () => fieldsFor(customFields.data?.items ?? [], entity),
    [customFields.data, entity]
  );
  const tagList = useMemo(() => tags.data?.items ?? [], [tags.data]);
  const raw = useMemo(() => listFiltersFromSearch(params), [params]);
  const filters = useMemo(
    () =>
      customFields.data
        ? sanitizeListFilters(
            raw,
            fields,
            tags.data ? new Set(tagList.map((tag) => tag.id)) : undefined
          )
        : raw,
    [customFields.data, raw, fields, tags.data, tagList]
  );
  const query = useMemo(() => listFiltersToQuery(filters), [filters]);
  // A link carrying cf / tag filters waits for the catalog, so a stale value is dropped before the
  // first request instead of answering 400 (no filters → nothing to wait for).
  const ready =
    (Object.keys(raw.fields).length === 0 ||
      customFields.data !== undefined ||
      customFields.isError) &&
    (raw.tagIds.length === 0 || tags.data !== undefined || tags.isError);
  const setFilters = useCallback(
    (next: ListFilters) =>
      setParams((current) => listFiltersToSearch(next, current), { replace: true }),
    [setParams]
  );
  return {
    /** Active fields of the entity (columns: `showInTable`; filters: all). */
    fields,
    tags: tagList,
    filters,
    /** API parameters (`tagId`, `cf.<key>`…) for the list hooks. */
    query,
    /** False while URL filters wait for the field / tag catalog: keep the list query disabled. */
    ready,
    setFilters,
    count: activeListFilterCount(filters)
  };
};
