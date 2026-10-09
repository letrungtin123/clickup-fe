import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { clearTaskFilters, parseTaskFilters, writeTaskFilters, type TaskFilters } from "./filters";

/** Filter / sort state of the current list view, stored in the URL (replace, no history spam). */
export const useTaskFilters = () => {
  const [params, setParams] = useSearchParams();
  const serialized = params.toString();
  // Re-parse only when the URL changes so consumers get a stable object.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => parseTaskFilters(params), [serialized]);

  const setFilters = useCallback(
    (patch: Partial<TaskFilters> | ((current: TaskFilters) => Partial<TaskFilters>)) =>
      setParams(
        (current) => {
          const base = parseTaskFilters(current);
          const next = typeof patch === "function" ? patch(base) : patch;
          return writeTaskFilters(current, { ...base, ...next });
        },
        { replace: true }
      ),
    [setParams]
  );

  const resetFilters = useCallback(
    () => setParams((current) => clearTaskFilters(current), { replace: true }),
    [setParams]
  );

  return { filters, setFilters, resetFilters };
};
