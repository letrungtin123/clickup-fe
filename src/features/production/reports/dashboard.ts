import type { LeaderDashboard } from "@/contracts/production-reports";

import { formatDay } from "../format";
import { maxSeries, type ChartModel } from "./pivot";

/** Pure helpers of the Leader / Admin dashboards. Unit tested in dashboard.test.ts. */

export type WorkloadRow = LeaderDashboard["workload"][number];
export type WorkloadSort = "load" | "done" | "name";

export const leaveLabels: Record<NonNullable<WorkloadRow["leaveToday"]>, string> = {
  FULL_DAY: "Nghỉ cả ngày",
  MORNING: "Nghỉ sáng",
  AFTERNOON: "Nghỉ chiều"
};

export const openLoad = (row: WorkloadRow) => row.qtyNotStarted + row.qtyProcessing;

/** Workers ordered for the table; ties fall back to the name (Vietnamese collation). */
export const sortWorkload = (rows: readonly WorkloadRow[], sort: WorkloadSort): WorkloadRow[] => {
  const collator = new Intl.Collator("vi", { sensitivity: "base" });
  const byName = (a: WorkloadRow, b: WorkloadRow) =>
    collator.compare(a.user.displayName, b.user.displayName);
  return [...rows].sort((a, b) => {
    if (sort === "load")
      return openLoad(b) - openLoad(a) || b.openTasks - a.openTasks || byName(a, b);
    if (sort === "done")
      return b.qtyDoneToday - a.qtyDoneToday || b.tasksDoneToday - a.tasksDoneToday || byName(a, b);
    return byName(a, b);
  });
};

/** Totals shown in the headline cards. */
export const workloadTotals = (rows: readonly WorkloadRow[]) =>
  rows.reduce(
    (sum, row) => ({
      notStarted: sum.notStarted + row.qtyNotStarted,
      processing: sum.processing + row.qtyProcessing,
      doneToday: sum.doneToday + row.qtyDoneToday,
      tasksDoneToday: sum.tasksDoneToday + row.tasksDoneToday,
      busy: sum.busy + (row.openTasks > 0 ? 1 : 0),
      onLeave: sum.onLeave + (row.leaveToday ? 1 : 0)
    }),
    { notStarted: 0, processing: 0, doneToday: 0, tasksDoneToday: 0, busy: 0, onLeave: 0 }
  );

/**
 * Team points per week as a stacked-column chart model: one series per team (fixed slots, teams
 * past the 8th folded into "Khác"), one category per Monday.
 */
export const teamPointsModel = (
  teamPoints: LeaderDashboard["teamPoints"],
  key: "points" | "pointsKhoan"
): ChartModel => {
  const totals = teamPoints.series.map((series) =>
    series[key].reduce((sum, value) => sum + value, 0)
  );
  let teams = teamPoints.series.map((series, index) => ({ series, total: totals[index] ?? 0 }));
  let folded: typeof teams = [];
  if (teams.length > maxSeries) {
    const keep = new Set(
      [...teams]
        .sort((a, b) => b.total - a.total)
        .slice(0, maxSeries - 1)
        .map((team) => team.series)
    );
    folded = teams.filter((team) => !keep.has(team.series));
    teams = teams.filter((team) => keep.has(team.series));
  }
  const data = teamPoints.weeks.map((week, index) => {
    const record: Record<string, string | number | null> = {
      category: week,
      label: `Tuần ${formatDay(week)}`
    };
    teams.forEach((team, slot) => {
      record[`s${slot}`] = team.series[key][index] ?? 0;
    });
    if (folded.length > 0)
      record.other = folded.reduce((sum, team) => sum + (team.series[key][index] ?? 0), 0);
    return record;
  });
  return {
    data,
    series: [
      ...teams.map((team, slot) => ({ key: `s${slot}`, label: team.series.teamName })),
      ...(folded.length > 0 ? [{ key: "other", label: "Khác", other: true }] : [])
    ],
    measure: key === "points" ? "points" : "points_khoan",
    hiddenCategories: 0,
    hiddenSeries: folded.length,
    timeAxis: true
  };
};

/** "14:30 · 12/05" in the organization timezone. */
export const formatDeadline = (iso: string, timeZone: string) => {
  const date = new Date(iso);
  try {
    const parts = new Intl.DateTimeFormat("vi-VN", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      hour12: false
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${get("hour")}:${get("minute")} · ${get("day")}/${get("month")}`;
  } catch {
    return date.toLocaleString("vi-VN");
  }
};
