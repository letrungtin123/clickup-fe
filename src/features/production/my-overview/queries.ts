import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { MyOverviewSchema } from "@/contracts/production-my-overview";
import { api } from "@/lib/api/client";

import { queryPath } from "../list-filters";
import type { MyOverviewRange } from "./model";

/** GET /production/my-overview (PD-081, BE modules/production/my-overview.service.ts). */
export const myOverviewApi = {
  get: (range: MyOverviewRange, signal?: AbortSignal) =>
    api.get(
      queryPath("/production/my-overview", { from: range.from, to: range.to }),
      MyOverviewSchema,
      { signal }
    )
};

/**
 * Query key. Under the job lists' prefix (["production", "jobs"]): every task write — a move from this page, the task
 * sheet, "Nhập Task" — refreshes it (applyTask / invalidateProductionViews), like the Leader overview's key.
 */
export const myOverviewKey = (range?: MyOverviewRange) =>
  range === undefined
    ? (["production", "jobs", "my-overview"] as const)
    : (["production", "jobs", "my-overview", range.from, range.to] as const);

/**
 * "Tổng quan của tôi" data. The previous answer stays on screen while another range loads; it refreshes every minute while
 * open (late / due-soon / QC clocks move with time) and when the window regains focus.
 */
export const useMyOverview = (range: MyOverviewRange) =>
  useQuery({
    queryKey: myOverviewKey(range),
    queryFn: ({ signal }) => myOverviewApi.get(range, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000
  });
