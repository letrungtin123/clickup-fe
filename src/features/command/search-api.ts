import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { GlobalSearchResultSchema, type SearchGroup } from "@/contracts/search";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";

export const searchApi = {
  /** GET /search — every group is authorization-filtered server side. */
  global: (
    q: string,
    groups: readonly SearchGroup[] | undefined,
    limit: number,
    signal?: AbortSignal
  ) => api.get("/search", GlobalSearchResultSchema, { query: { q, groups, limit }, signal })
};

export const useDebouncedValue = <T>(value: T, delayMs: number) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
};

/** Debounced global search; previous results stay visible while typing. Requests are cancelled. */
export const useGlobalSearch = (term: string, groups?: readonly SearchGroup[], limit = 6) => {
  const q = useDebouncedValue(term.trim(), 200);
  const query = useQuery({
    queryKey: qk.search(q, groups),
    queryFn: ({ signal }) => searchApi.global(q, groups, limit, signal),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false
  });
  return { ...query, debouncedTerm: q, isDebouncing: q !== term.trim() };
};
