import type { KpiReport, KpiReportRollup, KpiReportTotal } from "@/contracts/production-scores";

import { quarterOfPeriod } from "../scores/periods";

/** Anchor of the KPI report on /production/settings/kpi-settlement. */
export const kpiReportAnchor = "bao-cao-kpi";

/** The KPI report (person × period, % đạt) opened on one period — e.g. from the Admin dashboard. */
export const kpiReportHref = (period: string) =>
  `/production/settings/kpi-settlement?period=${encodeURIComponent(period)}#${kpiReportAnchor}`;

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
  const keys = periods.map((period) =>
    view === "QUARTER" ? quarterOfPeriod(period) : period.slice(0, 4)
  );
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
 * State of a quarter / year (SPEC §8.4: always the whole quarter / year): every month settled → "Đã
 * chốt"; every month started but some not settled → "Tạm tính"; some months not started yet → "Chưa
 * hết kỳ" (points so far against the whole target).
 */
export type RollupStatus = "SETTLED" | "PROVISIONAL" | "OPEN";

export const rollupStatusInfo: Record<RollupStatus, { label: string; hint: string }> = {
  SETTLED: { label: "Đã chốt", hint: "Mọi tháng của kỳ đã chốt KPI." },
  PROVISIONAL: {
    label: "Tạm tính",
    hint: "Đủ các tháng nhưng còn tháng chưa chốt: số liệu tạm tính theo điểm hiện có."
  },
  OPEN: {
    label: "Chưa hết kỳ",
    hint: "Còn tháng chưa bắt đầu: điểm cộng các tháng đã qua, chỉ tiêu tính cho cả kỳ."
  }
};

export const statusOfRollup = (
  rollup: Pick<KpiReportRollup, "complete" | "settled">
): RollupStatus => (rollup.settled ? "SETTLED" : rollup.complete ? "PROVISIONAL" : "OPEN");

/** State of a quarter / year key over everyone shown (null for months or without data). */
export const rollupStatus = (
  report: KpiReport,
  view: ReportView,
  key: string
): RollupStatus | null => {
  if (view === "MONTH") return null;
  const items = report.rollups.filter((item) => item.periodType === view && item.key === key);
  if (items.length === 0) return null;
  if (items.every((item) => item.settled)) return "SETTLED";
  return items.every((item) => item.complete) ? "PROVISIONAL" : "OPEN";
};

/**
 * Team totals (one row per team, "no team" last) and the organization total of a month period or a
 * quarter / year key — ADMIN only, the API sends none to others.
 */
export const totalsFor = (report: KpiReport, view: ReportView, key: string) => {
  const rows = report.totals.filter((item) => item.periodType === view && item.key === key);
  const teams = rows
    .filter((item) => item.scope === "TEAM")
    .sort(
      (a, b) =>
        Number(a.teamId === null) - Number(b.teamId === null) ||
        (a.teamName ?? "").localeCompare(b.teamName ?? "", "vi")
    );
  return { teams, org: rows.find((item) => item.scope === "ORG") ?? null };
};

/** "9 người · đạt 8/9" — how a total row was made. */
export const totalSummary = (
  total: Pick<KpiReportTotal, "memberCount" | "withTargetCount" | "metCount">
) => `${total.memberCount} người · đạt ${total.metCount}/${total.withTargetCount}`;

/**
 * One row per person of the report for a month period or a quarter/year rollup key. People without
 * a row for the key get zero points and no target. `settled` is null for rollups; `status` is the
 * rollup's own state (null for months).
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
        status: null,
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
      status: rollup ? statusOfRollup(rollup) : null,
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

/**
 * People with a target, how many met the KPI, and the average percent. A month row carries the
 * settlement verdict (`met`: official points ≥ target, PLAN §6) which wins over the percent — Khoán
 * converted to points can lift % đạt to 100 while the KPI is still "Không đạt". Rollups have no
 * verdict and count 100 % or more.
 */
export const attainment = (
  rows: readonly { percent: number | null; met?: boolean | undefined }[]
) => {
  const withTarget = rows.filter((row) => row.percent !== null);
  const met = withTarget.filter((row) =>
    row.met === undefined ? (row.percent ?? 0) >= 100 : row.met
  ).length;
  const average =
    withTarget.length === 0
      ? null
      : Math.round(
          (withTarget.reduce((sum, row) => sum + (row.percent ?? 0), 0) / withTarget.length) * 100
        ) / 100;
  return { withTarget: withTarget.length, met, average };
};
