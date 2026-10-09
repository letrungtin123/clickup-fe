import type {
  KpiPeriodType,
  KpiTarget,
  KpiTargetCell,
  KpiTargetMatrix
} from "@/contracts/production-scores";

import { formatCredit, formatInteger } from "../format";
import { formatPeriod, monthShortLabel, rollupLabel } from "../scores/periods";

/**
 * Pure helpers for the KPI target matrix (users × 12 months + quarters + year) and its CSV import
 * (user_email,target). Unit tested.
 */

export type MatrixRow = KpiTargetMatrix["rows"][number];

export type MatrixColumn = {
  /** Stable key: the period for months, "Q1".."Q4", "Y". */
  key: string;
  periodType: KpiPeriodType;
  label: string;
  title: string;
  pick: (row: MatrixRow) => KpiTargetCell | undefined;
};

/** Months, then quarters, then the year — in the order the API returns them. */
export const matrixColumns = (matrix: Pick<KpiTargetMatrix, "periods" | "year">): MatrixColumn[] => [
  ...matrix.periods.map((period, index) => ({
    key: period,
    periodType: "MONTH" as const,
    label: monthShortLabel(period),
    title: `Kỳ ${formatPeriod(period)}`,
    pick: (row: MatrixRow) => row.months[index]
  })),
  ...[0, 1, 2, 3].map((index) => ({
    key: `Q${index + 1}`,
    periodType: "QUARTER" as const,
    label: `Q${index + 1}`,
    title: rollupLabel(`${matrix.year}-Q${index + 1}`),
    pick: (row: MatrixRow) => row.quarters[index]
  })),
  {
    key: "Y",
    periodType: "YEAR" as const,
    label: "Năm",
    title: rollupLabel(String(matrix.year)),
    pick: (row: MatrixRow) => row.year
  }
];

export const periodTypeLabels: Record<KpiPeriodType, string> = {
  MONTH: "tháng",
  QUARTER: "quý",
  YEAR: "năm"
};

/** Targets are usually whole numbers: "2.400"; decimals keep two places: "1.848,50". */
export const formatTarget = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : Number.isInteger(value)
      ? formatInteger(value)
      : formatCredit(value);

/** Versions of one user's targets of one type, newest effective period first. */
export const historyFor = (
  history: readonly KpiTarget[],
  userId: string,
  periodType: KpiPeriodType
) =>
  history
    .filter((item) => item.userId === userId && item.periodType === periodType)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

/** The version in force for `period` (latest effectiveFrom ≤ period), or null. */
export const versionFor = (versions: readonly KpiTarget[], period: string) =>
  [...versions]
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
    .find((item) => item.effectiveFrom <= period) ?? null;

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();

/** Search by name or email (accents ignored) and filter by team. */
export const filterMatrixRows = (
  rows: readonly MatrixRow[],
  { q, teamId }: { q: string; teamId: string | null }
) => {
  const term = normalize(q.trim());
  return rows.filter(
    (row) =>
      (teamId === null || row.teamId === teamId) &&
      (term === "" ||
        normalize(row.user.displayName).includes(term) ||
        normalize(row.user.email ?? "").includes(term))
  );
};

/** How many rows have a target in force for `period` (month cells). */
export const coverageFor = (rows: readonly MatrixRow[], periodIndex: number) =>
  rows.filter((row) => (row.months[periodIndex]?.targetPoints ?? null) !== null).length;

// CSV ----------------------------------------------------------------------------------------------

export const KPI_CSV_HEADER = "user_email,target";

/** True when the first non-empty line has both columns (other columns are ignored by the API). */
export const hasKpiHeader = (text: string) => {
  const first = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .find((line) => line.trim() !== "");
  if (!first) return false;
  const cells = first.split(",").map((cell) => cell.trim().toLowerCase().replace(/^"|"$/g, ""));
  return cells.includes("user_email") && cells.includes("target");
};

/** Quarter/year targets must start at an aligned period (01/04/07/10, or 01 for a year). */
export const isAlignedPeriod = (periodType: KpiPeriodType, period: string) => {
  const month = Number(period.slice(5, 7));
  if (periodType === "QUARTER") return [1, 4, 7, 10].includes(month);
  if (periodType === "YEAR") return month === 1;
  return true;
};

/** CSS selector of one KPI grid cell (anchors the editor popover). */
export const kpiCellSelector = (ref: { userId: string; column: string }) =>
  `[data-kpi-user="${ref.userId}"][data-kpi-col="${ref.column}"]`;
