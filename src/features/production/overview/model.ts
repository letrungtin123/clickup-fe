import type { ProductionRole } from "@/contracts/production-catalog";
import type { JobListScope } from "@/contracts/production-jobs";
import {
  overviewDaySpan,
  overviewMaxDays,
  type OverviewRange,
  type ProductionOverview
} from "@/contracts/production-overview";
import { kpiPeriodOfDay, kpiPeriodRange, type KpiCloseDays } from "@/contracts/production-scores";
import type { QueryValue } from "@/lib/api/client";

import { addDays, isDay } from "../format";
import { jobScopeFromSearch, landingJobScope, scopeTabsShown } from "../jobs-model";
import { rangePresets, type RangePreset } from "../my-task-filters";
import { formatPeriod, isPeriod } from "../scores/periods";

/**
 * PD-076 — "Tổng quan" page state, kept in the URL: the time filter (`?from=&to=` organization-calendar days, both
 * included, or `?period=YYYY-MM` a KPI period; nothing = Hôm nay) and, for holders of LEADER or ADMIN, the scope tab
 * exactly like the Job list (PD-078: `?scope=mine|all`, "Tôi quản lý" = the Projects I own; no `?scope=` lands on the
 * role's tab — a Leader "Tôi quản lý", an Admin "Tất cả").
 * Pure helpers, unit tested.
 */

export type OverviewTime =
  | { kind: "today" }
  | { kind: "range"; from: string; to: string }
  | { kind: "period"; period: string };

export type OverviewPresetKey = RangePreset["key"];

/** From the URL: a KPI period wins over days; a reversed range is put in order; too long a range keeps its last 400 days. */
export const overviewTimeFromSearch = (params: URLSearchParams): OverviewTime => {
  const period = params.get("period");
  if (isPeriod(period)) return { kind: "period", period };
  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  const from = rawFrom && isDay(rawFrom) ? rawFrom : null;
  const to = rawTo && isDay(rawTo) ? rawTo : null;
  if (!from && !to) return { kind: "today" };
  const [first, last] = from && to && from > to ? [to, from] : [from ?? to!, to ?? from!];
  return overviewDaySpan(first, last) > overviewMaxDays
    ? { kind: "range", from: addDays(last, -(overviewMaxDays - 1)), to: last }
    : { kind: "range", from: first, to: last };
};

/** The URL with this time filter (other parameters kept); "Hôm nay" is the bare URL. */
export const overviewTimeToSearch = (time: OverviewTime, params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  for (const key of ["from", "to", "period"]) next.delete(key);
  if (time.kind === "period") next.set("period", time.period);
  if (time.kind === "range") {
    next.set("from", time.from);
    next.set("to", time.to);
  }
  return next;
};

/** A preset as a time filter ("Hôm nay" is the default, bare URL). */
export const presetTime = (preset: Pick<RangePreset, "key" | "from" | "to">): OverviewTime =>
  preset.key === "today" ? { kind: "today" } : { kind: "range", from: preset.from, to: preset.to };

/** The days a time filter covers. */
export const overviewRangeOf = (time: OverviewTime, today: string, closeDays: KpiCloseDays): OverviewRange =>
  time.kind === "today"
    ? { from: today, to: today }
    : time.kind === "period"
      ? kpiPeriodRange(time.period, closeDays)
      : { from: time.from, to: time.to };

/** The quick preset the filter is exactly (Hôm nay, Tuần này, Tháng này, Tháng trước), else null. */
export const activePreset = (time: OverviewTime, today: string): OverviewPresetKey | null => {
  if (time.kind === "today") return "today";
  if (time.kind === "period") return null;
  return (
    rangePresets(today).find((preset) => preset.from === time.from && preset.to === time.to)
      ?.key ?? null
  );
};

/** The KPI period holding `today` (close-day versions of the settings, PD-074). */
export const currentKpiPeriod = (today: string, closeDays: KpiCloseDays) =>
  kpiPeriodOfDay(today, closeDays);

const shortDay = (day: string, today: string) =>
  `${day.slice(8, 10)}/${day.slice(5, 7)}${day.slice(0, 4) === today.slice(0, 4) ? "" : `/${day.slice(0, 4)}`}`;

/**
 * "21/10", "19/10 – 25/10" this year; "01/09 – 30/09/2025" another year; "26/12/2025 – 25/01/2026" across two years.
 */
export const formatOverviewRange = (range: OverviewRange, today: string) => {
  if (range.from === range.to) return shortDay(range.from, today);
  const fromYear = range.from.slice(0, 4);
  const toYear = range.to.slice(0, 4);
  if (fromYear !== toYear) return `${shortDay(range.from, "")} – ${shortDay(range.to, "")}`;
  return `${shortDay(range.from, range.from)} – ${shortDay(range.to, today)}`;
};

/** What the filter shows: "Hôm nay", "Tuần này", …, "Kỳ 10/2026", or the days. */
export const overviewTimeLabel = (time: OverviewTime, today: string) => {
  if (time.kind === "period") return `Kỳ ${formatPeriod(time.period)}`;
  const preset = activePreset(time, today);
  if (preset) return rangePresets(today).find((item) => item.key === preset)?.label ?? "";
  return time.kind === "range" ? formatOverviewRange(time, today) : "Hôm nay";
};

/**
 * The API's comparison days: "so với hôm qua" / "so với 21 ngày trước đó" (short enough for a phone card;
 * `comparisonTitle` gives the dates).
 */
export const comparisonLabel = (previous: OverviewRange, today: string) =>
  previous.from === previous.to && previous.from === addDays(today, -1)
    ? "so với hôm qua"
    : `so với ${overviewDaySpan(previous.from, previous.to)} ngày trước đó`;

/** "So với 10/09 – 30/09" (tooltip). */
export const comparisonTitle = (previous: OverviewRange, today: string) =>
  `So với ${formatOverviewRange(previous, today)}`;

// Scope tabs (PD-078) -------------------------------------------------------------------------------------------------

/**
 * The tab from the URL for holders of LEADER or ADMIN (null for everyone else: no tabs): `?scope=mine|all`; without it,
 * PD-076 links (`?leader=<my id>` → "Tôi quản lý", `?leader=all` or another person → "Tất cả"), else the role's landing
 * tab (a Leader "Tôi quản lý", an Admin without LEADER "Tất cả").
 */
export const overviewTabOf = (
  params: URLSearchParams,
  roles: readonly ProductionRole[],
  myId: string
): JobListScope | null => {
  if (!scopeTabsShown(roles)) return null;
  const scope = jobScopeFromSearch(params);
  if (scope) return scope;
  const leader = params.get("leader");
  if (leader !== null) return leader === myId ? "mine" : "all";
  return landingJobScope(roles);
};

/** The URL for a tab: `?scope=mine|all` (kept explicit, like the Job list); a PD-076 `?leader=` goes. */
export const overviewTabToSearch = (tab: JobListScope, params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  next.delete("leader");
  next.set("scope", tab);
  return next;
};

/** GET /production/overview parameters ("Tôi quản lý" = `scope=mine`). */
export const overviewQuery = (
  range: OverviewRange,
  tab: JobListScope | null
): Record<string, QueryValue> => ({
  from: range.from,
  to: range.to,
  ...(tab === "mine" ? { scope: "mine" } : {})
});

/** Job list of a Project, in the same scope tab (`/production/jobs?project=…&scope=…`). */
export const projectJobsHref = (projectId: string, tab: JobListScope | null) => {
  const params = new URLSearchParams({ project: projectId });
  if (tab) params.set("scope", tab);
  return `/production/jobs?${params.toString()}`;
};

// Figures ---------------------------------------------------------------------------------------------------------------

/** Whole percent of `value` over `total`, 0–100 (0 without a total). */
export const percentOf = (value: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;

/**
 * Change against the comparison days: "up" / "down" / "flat", with the percent when the earlier count is not 0
 * (null: nothing to compare with — "mới").
 */
export const trendOf = (current: number, previous: number) => {
  if (current === previous) return { direction: "flat" as const, percent: 0 };
  const direction = current > previous ? ("up" as const) : ("down" as const);
  return {
    direction,
    percent: previous > 0 ? Math.round((Math.abs(current - previous) / previous) * 100) : null
  };
};

/** Share of the range's open lines (not finished) that are Quá hạn. */
export const overdueShare = (stats: ProductionOverview["stats"]) =>
  percentOf(stats.overdue, stats.total - stats.done);

/** "dd/MM" of a day. */
export const dayMonth = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** "T4" (Vietnamese weekday) of a day. */
export const weekdayOf = (day: string) => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return weekdays[new Date(Date.UTC(year, month - 1, date)).getUTCDay()] ?? "";
};

/** Whether `day` is inside the range (both ends included). */
export const inRange = (day: string, range: OverviewRange) => day >= range.from && day <= range.to;
