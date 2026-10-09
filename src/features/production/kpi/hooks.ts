import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { retryUnlessClientError } from "../scores/hooks";
import { kpiKeys, scoreKeys } from "../scores/keys";
import { kpiApi, type KpiImportInput, type PutKpiTargetsInput, type RunSettlementInput } from "./api";

/**
 * KPI data hooks. Targets feed the forecast and the report, so every target or settlement write
 * refreshes both the KPI and the scores caches. Mutations opt out of the global error toast; the
 * screens show the copy from scores/errors.ts inline.
 */

const useInvalidateKpi = () => {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: kpiKeys.all() }),
      client.invalidateQueries({ queryKey: scoreKeys.all() })
    ]);
};

export const useKpiMatrix = (year: number, enabled = true) =>
  useQuery({
    queryKey: kpiKeys.targets(year),
    queryFn: ({ signal }) => kpiApi.matrix(year, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    enabled
  });

export const usePutKpiTargets = () => {
  const invalidate = useInvalidateKpi();
  return useMutation({
    mutationFn: (input: PutKpiTargetsInput) => kpiApi.putTargets(input),
    meta: { errorMessage: false },
    onSuccess: () => void invalidate()
  });
};

export const useDeleteKpiTarget = () => {
  const invalidate = useInvalidateKpi();
  return useMutation({
    mutationFn: (targetId: string) => kpiApi.deleteTarget(targetId),
    meta: { errorMessage: false },
    onSuccess: () => void invalidate()
  });
};

/** All-or-nothing CSV import: nothing is written when the result has errors. */
export const useImportKpiTargets = () => {
  const invalidate = useInvalidateKpi();
  return useMutation({
    mutationFn: (input: KpiImportInput) => kpiApi.importTargets(input),
    meta: { errorMessage: false },
    onSuccess: (result) => {
      if (result.ok) void invalidate();
    }
  });
};

export const useApplyDefaultKpi = () => {
  const invalidate = useInvalidateKpi();
  return useMutation({
    mutationFn: (period: string) => kpiApi.applyDefaults(period),
    meta: { errorMessage: false },
    onSuccess: () => void invalidate()
  });
};

/** null period = the latest closed period (API default). */
export const useKpiSettlements = (period: string | null, enabled = true) =>
  useQuery({
    queryKey: kpiKeys.settlements(period),
    queryFn: ({ signal }) => kpiApi.settlements(period ?? undefined, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    enabled
  });

export const useKpiSettlementRuns = (period: string | null, enabled = true) =>
  useQuery({
    queryKey: kpiKeys.runs(period),
    queryFn: ({ signal }) => kpiApi.runs(period ?? undefined, signal),
    retry: retryUnlessClientError,
    enabled
  });

export const useRunKpiSettlement = () => {
  const invalidate = useInvalidateKpi();
  return useMutation({
    mutationFn: (input: RunSettlementInput) => kpiApi.runSettlement(input),
    meta: { errorMessage: false },
    onSuccess: () => void invalidate()
  });
};

export const useKpiReport = (
  range: { from: string; to: string; teamId: string | null },
  enabled = true
) =>
  useQuery({
    queryKey: kpiKeys.report(range.from, range.to, range.teamId),
    queryFn: ({ signal }) =>
      kpiApi.report(
        { from: range.from, to: range.to, teamId: range.teamId ?? undefined },
        signal
      ),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    enabled
  });
