import type { KpiReport } from "@/contracts/production-scores";

import { quarterOfPeriod } from "../scores/periods";

/** Figures of one row of a KPI table (one person or one period). */
export type KpiFigures = {
  target: number | null;
  pointsOfficial: number;
  khoanPointsConverted: number;
  totalPoints: number;
  percent: number | null;
  difference: number | null;
  khoanMoney: number | null;
};

export type ReportView = "MONTH" | "QUARTER" | "YEAR";

/** Selectable keys of a view, newest first: periods, "YYYY-Qn" quarters or "YYYY" years. */
export const reportKeys = (view: ReportView, periods: readonly string[]) => {
  if (view === "MONTH") return [...periods].reverse();
  const keys = periods.map((period) => (view === "QUARTER" ? quarterOfPeriod(period) : period.slice(0, 4)));
  return [...new Set(keys)].reverse();
};

const empty: KpiFigures = {
  target: null,
  pointsOfficial: 0,
  khoanPointsConverted: 0,
  totalPoints: 0,
  percent: null,
  difference: null,
  khoanMoney: null
};

/**
 * One row per person of the report for a month period or a quarter/year rollup key. People without
 * a row for the key get zero points and no target. `settled` is null for rollups.
 */
export const reportRowsFor = (report: KpiReport, view: ReportView, key: string) =>
  report.users.map((entry) => {
    if (view === "MONTH") {
      const row = report.rows.find((item) => item.userId === entry.user.id && item.period === key);
      return {
        user: entry.user,
        teamName: entry.teamName,
        settled: row ? row.settled : null,
        met: row?.met ?? null,
        figures: row
          ? {
              target: row.target,
              pointsOfficial: row.pointsOfficial,
              khoanPointsConverted: row.khoanPointsConverted,
              totalPoints: row.totalPoints,
              percent: row.percent,
              difference: row.difference,
              khoanMoney: row.khoanMoney
            }
          : empty
      };
    }
    const rollup = report.rollups.find(
      (item) => item.userId === entry.user.id && item.periodType === view && item.key === key
    );
    return {
      user: entry.user,
      teamName: entry.teamName,
      settled: null,
      met: null,
      figures: rollup
        ? {
            target: rollup.target,
            pointsOfficial: rollup.pointsOfficial,
            khoanPointsConverted: rollup.khoanPointsConverted,
            totalPoints: rollup.totalPoints,
            percent: rollup.percent,
            difference: rollup.difference,
            khoanMoney: rollup.khoanMoney
          }
        : empty
    };
  });

/** People with a target, how many reached 100 %, and the average percent. */
export const attainment = (rows: readonly { percent: number | null }[]) => {
  const withTarget = rows.filter((row) => row.percent !== null);
  const met = withTarget.filter((row) => (row.percent ?? 0) >= 100).length;
  const average =
    withTarget.length === 0
      ? null
      : Math.round((withTarget.reduce((sum, row) => sum + (row.percent ?? 0), 0) / withTarget.length) * 100) /
        100;
  return { withTarget: withTarget.length, met, average };
};
