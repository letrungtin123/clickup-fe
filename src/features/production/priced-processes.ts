import { useQueries } from "@tanstack/react-query";

import type { CreditRule } from "@/contracts/production-catalog";

import { productionApi } from "./api";
import { useProductionMe } from "./hooks";
import { isoToDay } from "./jobs-model";
import { productionKeys } from "./keys";

/**
 * PD-080b — only priced processes: when a task line, a "Nhập Task" entry, a task edit or a subtask picks its process, the
 * list offers only the processes with a price (credit rule) in force for the job's project on the line's Ngày nhận (no
 * Ngày nhận: today). The API refuses the others (400 PROCESS_NOT_PRICED, BE pricing.ts). Prices come from the credit
 * matrix of that day (GET /production/credit-rules/matrix?at=, readable by every production member). Pure helpers are
 * unit tested in priced-processes.test.ts.
 */

/** Shown instead of the list when the project has no price that day. */
export const noPriceMessage = "Project chưa có đơn giá — liên hệ Quản trị";

/** Process ids priced for the project in that day's rules; null while unknown (no project, not loaded, or failed). */
export const pricedProcessIds = (
  rules: readonly Pick<CreditRule, "projectId" | "processId">[] | undefined,
  projectId: string | null | undefined
): ReadonlySet<string> | null =>
  rules && projectId
    ? new Set(rules.filter((rule) => rule.projectId === projectId).map((rule) => rule.processId))
    : null;

/**
 * The options a picker shows: the priced ones (all of them while unknown). `keepId`: the value already saved on a task
 * (an edit keeps showing it even if it lost its price).
 */
export const pricedOptions = <T extends { id: string }>(
  options: readonly T[],
  priced: ReadonlySet<string> | null,
  keepId: string | null = null
): T[] => (priced ? options.filter((option) => priced.has(option.id) || option.id === keepId) : [...options]);

/** The project has no priced process at all that day (the picker is disabled with `noPriceMessage`). */
export const projectUnpriced = (priced: ReadonlySet<string> | null) => priced !== null && priced.size === 0;

/** A chosen process that is not priced (any more) for its day — to be cleared. */
export const isUnpriced = (processId: string | null, priced: ReadonlySet<string> | null) =>
  processId !== null && priced !== null && !priced.has(processId);

const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Hint left on a line whose process was cleared because it has no price on the line's day. */
export const unpricedHint = (processName: string, day: string) =>
  `“${processName}” chưa có đơn giá ngày ${dayLabel(day)} — chọn lại quy trình.`;

/**
 * Priced process ids of a project for each of `days` (one credit-matrix query per distinct day, cached and shared with
 * Bảng đơn giá). A day maps to null while its matrix loads or when it failed (the picker then shows every process; the
 * API still refuses an unpriced one).
 */
export const usePricedProcesses = (projectId: string | null | undefined, days: readonly (string | null | undefined)[]) => {
  const unique = [...new Set(days.filter((day): day is string => Boolean(day)))].sort();
  const results = useQueries({
    queries: unique.map((day) => ({
      queryKey: productionKeys.creditMatrix(day),
      queryFn: ({ signal }: { signal: AbortSignal }) => productionApi.creditMatrix(day, signal),
      enabled: Boolean(projectId),
      staleTime: 60_000
    }))
  });
  const byDay = new Map<string, ReadonlySet<string> | null>();
  unique.forEach((day, index) => byDay.set(day, pricedProcessIds(results[index]?.data?.rules, projectId)));
  return {
    /** Priced ids on `day` (null: unknown). */
    on: (day: string | null | undefined) => (day ? (byDay.get(day) ?? null) : null),
    pending: Boolean(projectId) && results.some((result) => result.isPending)
  };
};

/**
 * Priced process ids for an existing task (its project, its Ngày nhận day; a subtask shares its line's). `enabled` false
 * (e.g. the editor is not available) asks nothing.
 */
export const useTaskPricedProcesses = (
  task: { project: { id: string }; assignedAt: string },
  enabled = true
) => {
  const timeZone = useProductionMe().data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const day = isoToDay(task.assignedAt, timeZone);
  return usePricedProcesses(enabled ? task.project.id : null, [day]).on(day);
};
