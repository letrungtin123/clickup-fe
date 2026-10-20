import type { MyTaskDateBasis } from "@/contracts/production-jobs";
import type { QueryValue } from "@/lib/api/client";

import { addDays, dayToDate, dateToDay } from "./format";

/**
 * PD-068 — "Việc của tôi" search and date range, kept in the URL next to the tag / field filters: `q` (search), `dateBy`
 * ("deadline" = Ngày giao; omitted = Ngày nhận), `from` / `to` (organization-calendar days, inclusive). Pure helpers.
 */

export type DateRange = { by: MyTaskDateBasis; from: string | null; to: string | null };
export type MyTaskFilters = { q: string; range: DateRange };

export const emptyDateRange: DateRange = { by: "received", from: null, to: null };
export const emptyMyTaskFilters: MyTaskFilters = { q: "", range: emptyDateRange };

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: string | null): value is string =>
  value !== null &&
  dayPattern.test(value) &&
  dayToDate(value) !== null &&
  dateToDay(dayToDate(value)!) === value;

const keys = ["q", "dateBy", "from", "to"] as const;

/** From the URL; a reversed range ("from" after "to") is put in order, impossible days are dropped. */
export const myTaskFiltersFromSearch = (params: URLSearchParams): MyTaskFilters => {
  const from = params.get("from");
  const to = params.get("to");
  const days = [isDay(from) ? from : null, isDay(to) ? to : null] as const;
  const [first, last] = days[0] && days[1] && days[0] > days[1] ? [days[1], days[0]] : days;
  return {
    q: (params.get("q") ?? "").slice(0, 120),
    range: {
      by: params.get("dateBy") === "deadline" ? "deadline" : "received",
      from: first,
      to: last
    }
  };
};

/** The URL with these filters (other parameters — tags, fields, the open task — kept). */
export const myTaskFiltersToSearch = (filters: MyTaskFilters, params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  for (const key of keys) next.delete(key);
  if (filters.q.trim()) next.set("q", filters.q.trim());
  if (filters.range.by === "deadline") next.set("dateBy", "deadline");
  if (filters.range.from) next.set("from", filters.range.from);
  if (filters.range.to) next.set("to", filters.range.to);
  return next;
};

export const hasDateRange = (range: DateRange) => range.from !== null || range.to !== null;

/**
 * API parameters of GET /production/tasks/mine (`dateBy` only with a day). Only the set ones, so an unfiltered list keeps
 * the plain cache key.
 */
export const myTaskFiltersToQuery = (filters: MyTaskFilters): Record<string, QueryValue> => {
  const query: Record<string, QueryValue> = {};
  if (filters.q.trim()) query.q = filters.q.trim();
  if (hasDateRange(filters.range)) query.dateBy = filters.range.by;
  if (filters.range.from) query.from = filters.range.from;
  if (filters.range.to) query.to = filters.range.to;
  return query;
};

/** Search and date range count one each (with the tag / field filters: "Xóa bộ lọc"). */
export const activeMyTaskFilterCount = (filters: MyTaskFilters) =>
  (filters.q.trim() ? 1 : 0) + (hasDateRange(filters.range) ? 1 : 0);

// Date range presets and labels -----------------------------------------------------------------------------------------

export type RangePreset = {
  key: "today" | "week" | "month" | "lastMonth";
  label: string;
  from: string;
  to: string;
};

const monthBounds = (year: number, monthIndex: number) => ({
  from: dateToDay(new Date(year, monthIndex, 1)),
  to: dateToDay(new Date(year, monthIndex + 1, 0))
});

/** Hôm nay · Tuần này (Monday – Sunday) · Tháng này · Tháng trước, for `today` (organization calendar). */
export const rangePresets = (today: string): RangePreset[] => {
  const date = dayToDate(today);
  if (!date) return [];
  const monday = addDays(today, -((date.getDay() + 6) % 7));
  return [
    { key: "today", label: "Hôm nay", from: today, to: today },
    { key: "week", label: "Tuần này", from: monday, to: addDays(monday, 6) },
    { key: "month", label: "Tháng này", ...monthBounds(date.getFullYear(), date.getMonth()) },
    {
      key: "lastMonth",
      label: "Tháng trước",
      ...monthBounds(date.getFullYear(), date.getMonth() - 1)
    }
  ];
};

/** The preset a range is exactly, if any (highlighted in the picker). */
export const matchingPreset = (range: DateRange, today: string) =>
  rangePresets(today).find((preset) => preset.from === range.from && preset.to === range.to) ??
  null;

/** "19/10" this year, "19/10/2025" another year. */
const shortDay = (day: string, today: string) =>
  `${day.slice(8, 10)}/${day.slice(5, 7)}${day.slice(0, 4) === today.slice(0, 4) ? "" : `/${day.slice(0, 4)}`}`;

export const basisLabels: Record<MyTaskDateBasis, { long: string; short: string }> = {
  received: { long: "Theo Ngày nhận", short: "Nhận" },
  deadline: { long: "Theo Ngày giao", short: "Giao" }
};

/** The trigger's text: "Tháng này", "Nhận 01/10 – 19/10", "Giao từ 01/10", "Nhận đến 19/10"; null without a range. */
export const rangeLabel = (range: DateRange, today: string) => {
  if (!hasDateRange(range)) return null;
  const basis = basisLabels[range.by].short;
  const preset = matchingPreset(range, today);
  if (preset) return `${basis} · ${preset.label.toLowerCase()}`;
  if (range.from && range.to) {
    return range.from === range.to
      ? `${basis} ${shortDay(range.from, today)}`
      : `${basis} ${shortDay(range.from, today)} – ${shortDay(range.to, today)}`;
  }
  return range.from
    ? `${basis} từ ${shortDay(range.from, today)}`
    : `${basis} đến ${shortDay(range.to!, today)}`;
};
