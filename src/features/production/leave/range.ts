import { leaveLimits, type LeaveRequest } from "@/contracts/production-leave";

import { formatNumber } from "../format";
import {
  bucketLeaveByDay,
  calendarStatuses,
  daysBetween,
  leaveLoad,
  monthBounds,
  monthOfDay
} from "./calendar";

/**
 * Time filter of the Lịch nghỉ page (PD-057): "Theo tháng" (?month=YYYY-MM, the month grid) or
 * "Khoảng ngày" (?from=YYYY-MM-DD&to=YYYY-MM-DD, a list of requests overlapping the range). The range
 * lives in the URL so it survives a reload; any `from` / `to` parameter selects the range mode, even a
 * malformed one (shown as an inline problem rather than silently dropped). Pure, unit tested.
 */

export type LeaveTimeMode = "month" | "range";

export type LeaveTimeFilter =
  { mode: "month"; month: string } | { mode: "range"; from: string | null; to: string | null };

/** An inclusive window of business days (YYYY-MM-DD). */
export type LeaveWindow = { from: string; to: string };

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day written YYYY-MM-DD (no 2026-02-30). */
export const isCalendarDay = (value: string | null | undefined): value is string => {
  const match = value ? dayPattern.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

export const isMonth = (value: string | null | undefined): value is string =>
  Boolean(value && monthPattern.test(value));

/** Reads the time filter from the page URL; the month defaults to today's. */
export const parseLeaveTimeFilter = (params: URLSearchParams, today: string): LeaveTimeFilter => {
  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    return {
      mode: "range",
      from: isCalendarDay(from) ? from : null,
      to: isCalendarDay(to) ? to : null
    };
  }
  const month = params.get("month");
  return { mode: "month", month: isMonth(month) ? month : monthOfDay(today) };
};

/** Inline problem of a range (Vietnamese), or null when it can be queried / exported. */
export const validateLeaveRange = (from: string | null, to: string | null): string | null => {
  if (!from || !to) return "Chọn đủ Từ ngày và Đến ngày.";
  if (to < from) return "Đến ngày phải sau hoặc trùng Từ ngày.";
  if (daysBetween(from, to) > leaveLimits.maxCalendarDays) {
    return `Khoảng ngày tối đa ${leaveLimits.maxCalendarDays} ngày — hãy thu hẹp lại.`;
  }
  return null;
};

/**
 * The days the filter stands for: the whole shown month (first…last day) or the chosen range; null
 * while the range is incomplete or invalid (nothing is fetched or exported then).
 */
export const leaveFilterWindow = (filter: LeaveTimeFilter): LeaveWindow | null => {
  if (filter.mode === "month") {
    const { first, last } = monthBounds(filter.month);
    return { from: first, to: last };
  }
  return validateLeaveRange(filter.from, filter.to) === null && filter.from && filter.to
    ? { from: filter.from, to: filter.to }
    : null;
};

/**
 * URL changes for switching mode. To "Khoảng ngày": the shown month's first…last day (so the same
 * leave stays in view). Back to "Theo tháng": the month of the range start (no parameter for the
 * current month).
 */
export const leaveModePatch = (
  filter: LeaveTimeFilter,
  next: LeaveTimeMode,
  today: string
): Record<string, string | null> => {
  if (next === filter.mode) return {};
  if (filter.mode === "month") {
    const { first, last } = monthBounds(filter.month);
    return { month: null, from: first, to: last };
  }
  const month = monthOfDay(filter.from ?? filter.to ?? today);
  return { from: null, to: null, month: month === monthOfDay(today) ? null : month };
};

// "Khoảng ngày" list -----------------------------------------------------------------------------

/** The day a request really ends on (a half day only covers its first day). */
const lastDayOf = (request: Pick<LeaveRequest, "fromDate" | "toDate" | "part">) =>
  request.part === "FULL_DAY" ? request.toDate : request.fromDate;

/**
 * Rows of the "Khoảng ngày" list: requests overlapping the window, in the statuses the shared
 * calendar draws (approved and pending; rejected / cancelled stay in "Đơn của tôi"), earliest first,
 * then by name.
 */
export const leaveRangeRows = (items: readonly LeaveRequest[], span: LeaveWindow) =>
  items
    .filter(
      (request) =>
        calendarStatuses.includes(request.status) &&
        request.fromDate <= span.to &&
        lastDayOf(request) >= span.from
    )
    .sort(
      (a, b) =>
        a.fromDate.localeCompare(b.fromDate) ||
        a.user.displayName.localeCompare(b.user.displayName, "vi") ||
        a.id.localeCompare(b.id)
    );

/**
 * Headline of the list: requests, people, approved leave days inside the window (half day = 0.5,
 * days outside the window not counted) and pending requests.
 */
export const leaveRangeSummary = (rows: readonly LeaveRequest[], span: LeaveWindow) => {
  let approvedDays = 0;
  for (const entries of bucketLeaveByDay(rows, span.from, span.to, ["APPROVED"]).values()) {
    approvedDays += leaveLoad(entries);
  }
  return {
    requests: rows.length,
    people: new Set(rows.map((row) => row.user.id)).size,
    approvedDays,
    pending: rows.filter((row) => row.status === "PENDING").length
  };
};

/** "12 đơn · 9 người · 14,5 ngày nghỉ đã duyệt · 3 đơn chờ duyệt". */
export const leaveRangeSummaryText = (rows: readonly LeaveRequest[], span: LeaveWindow) => {
  const summary = leaveRangeSummary(rows, span);
  const parts = [
    `${summary.requests} đơn`,
    `${summary.people} người`,
    `${formatNumber(summary.approvedDays)} ngày nghỉ đã duyệt`
  ];
  if (summary.pending > 0) parts.push(`${summary.pending} đơn chờ duyệt`);
  return parts.join(" · ");
};
