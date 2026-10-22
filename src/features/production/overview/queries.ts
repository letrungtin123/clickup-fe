import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { ProductionOverviewSchema } from "@/contracts/production-overview";
import { api, type QueryValue } from "@/lib/api/client";

import { productionKeys } from "../keys";
import { queryPath } from "../list-filters";

/** GET /production/overview (PD-076, BE modules/production/overview.service.ts). */
export const overviewApi = {
  get: (query: Record<string, QueryValue>, signal?: AbortSignal) =>
    api.get(queryPath("/production/overview", query), ProductionOverviewSchema, { signal })
};

/**
 * "Tổng quan" data. The previous answer stays on screen while another range or tab loads; it refreshes every minute
 * while open (Quá hạn and the due lists move with the clock) on top of the live-sync refreshes.
 */
export const useProductionOverview = (query: Record<string, QueryValue>, enabled = true) =>
  useQuery({
    queryKey: productionKeys.overview(query),
    queryFn: ({ signal }) => overviewApi.get(query, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    enabled
  });
