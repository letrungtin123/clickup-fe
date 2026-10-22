import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { ProductionOverviewSchema, RiskHistorySchema } from "@/contracts/production-overview";
import { api, type QueryValue } from "@/lib/api/client";

import { productionKeys } from "../keys";
import { queryPath } from "../list-filters";

/** GET /production/overview (PD-080 Overview V2) and its At risk history (BE modules/production/overview.service.ts). */
export const overviewApi = {
  get: (query: Record<string, QueryValue>, signal?: AbortSignal) =>
    api.get(queryPath("/production/overview", query), ProductionOverviewSchema, { signal }),
  riskHistory: (query: Record<string, QueryValue>, signal?: AbortSignal) =>
    api.get(queryPath("/production/overview/risk-history", query), RiskHistorySchema, { signal })
};

/**
 * "Tổng quan" data. The previous answer stays on screen while another range / scope loads; it refreshes every minute
 * while open (the clocks and time-left move) on top of the live-sync refreshes (its key sits under the job lists').
 */
export const useProductionOverview = (query: Record<string, QueryValue>, enabled = true) =>
  useQuery({
    queryKey: productionKeys.overview(query),
    queryFn: ({ signal }) => overviewApi.get(query, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    enabled
  });

/** PD-080 At risk history (superadmin, Director). */
export const useRiskHistory = (query: Record<string, QueryValue>, enabled = true) =>
  useQuery({
    queryKey: productionKeys.riskHistory(query),
    queryFn: ({ signal }) => overviewApi.riskHistory(query, signal),
    placeholderData: keepPreviousData,
    enabled
  });
