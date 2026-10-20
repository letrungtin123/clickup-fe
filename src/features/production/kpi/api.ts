import type { z } from "zod";

import {
  ApplyDefaultKpiResultSchema,
  KpiReportSchema,
  KpiSettlementListSchema,
  KpiSettlementRunCollectionSchema,
  KpiSettlementRunResultSchema,
  KpiTargetCollectionSchema,
  KpiTargetImportResultSchema,
  KpiTargetMatrixSchema,
  KpiTargetsMissingSchema,
  type KpiTargetImportRequestSchema,
  type PutKpiTargetsRequestSchema,
  type RunKpiSettlementRequestSchema
} from "@/contracts/production-scores";
import { api, apiPath } from "@/lib/api/client";
import { OkResponseSchema } from "@/lib/api/schemas";

import { searchWithPeopleFilter, type PeopleFilter } from "../scores/people-filter";

export type PutKpiTargetsInput = z.input<typeof PutKpiTargetsRequestSchema>;
export type KpiImportInput = z.input<typeof KpiTargetImportRequestSchema>;
export type RunSettlementInput = z.input<typeof RunKpiSettlementRequestSchema>;

/** KPI targets (ADMIN), settlement and KPI report — BE scores.routes.ts (SPEC Phase 3 §4, Phase 6). */
export const kpiApi = {
  matrix: (year: number, signal?: AbortSignal) =>
    api.get("/production/kpi-targets", KpiTargetMatrixSchema, { query: { year }, signal }),
  putTargets: (input: PutKpiTargetsInput) =>
    api.put("/production/kpi-targets", KpiTargetCollectionSchema, input),
  deleteTarget: (targetId: string) =>
    api.delete(apiPath`/production/kpi-targets/${targetId}`, OkResponseSchema),
  importTargets: (input: KpiImportInput) =>
    api.post("/production/kpi-targets/import", KpiTargetImportResultSchema, input),
  applyDefaults: (period: string) =>
    api.post("/production/kpi-targets/apply-defaults", ApplyDefaultKpiResultSchema, { period }),
  /** PD-066: who must have a KPI for the period (default: the current one) and has none (ADMIN). */
  missingTargets: (period: string | undefined, signal?: AbortSignal) =>
    api.get("/production/kpi-targets/missing", KpiTargetsMissingSchema, {
      query: { period },
      signal
    }),

  /** `userId`: only that member's row ("Điểm cá nhân", PD-052). */
  settlements: (period: string | undefined, signal?: AbortSignal, userId?: string) =>
    api.get("/production/kpi/settlements", KpiSettlementListSchema, {
      query: { period, userId },
      signal
    }),
  runs: (period: string | undefined, signal?: AbortSignal) =>
    api.get("/production/kpi/settlement-runs", KpiSettlementRunCollectionSchema, {
      query: { period, limit: 50 },
      signal
    }),
  runSettlement: (input: RunSettlementInput) =>
    api.post("/production/kpi/settlements/run", KpiSettlementRunResultSchema, input),
  /** ADMIN may filter people by USER tags / custom fields (repeated parameters, see people-filter.ts). */
  report: (
    query: {
      from: string;
      to: string;
      teamId?: string | undefined;
      userId?: string | undefined;
    },
    people: PeopleFilter,
    signal?: AbortSignal
  ) =>
    api.get(`/production/kpi/report${searchWithPeopleFilter(query, people)}`, KpiReportSchema, {
      signal
    })
};
