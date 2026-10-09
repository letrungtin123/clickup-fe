import {
  leaveLimits,
  type LeavePart,
  type LeaveRequest,
  type LeaveStatus
} from "@/contracts/production-leave";

/**
 * Leave calendar helpers (SPEC §6.3, PLAN §10 "Lịch nghỉ"). Days are business calendar days
 * (YYYY-MM-DD, Asia/Ho_Chi_Minh) and are handled as plain strings with UTC arithmetic, so the
 * browser's own timezone never shifts a day. Weeks start on Monday (T2). Pure, unit tested.
 */

const pad = (value: number) => String(value).padStart(2, "0");

const toUtc = (day: string) => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, date);
};
const fromUtc = (time: number) => new Date(time).toISOString().slice(0, 10);

export const shiftDay = (day: string, amount: number) => fromUtc(toUtc(day) + amount * 86_400_000);

/** Inclusive number of calendar days between two days (to ≥ from), else 0. */
export const daysBetween = (from: string, to: string) =>
  to < from ? 0 : Math.round((toUtc(to) - toUtc(from)) / 86_400_000) + 1;

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (day: string) => (new Date(toUtc(day)).getUTCDay() + 6) % 7;

/** Working days are Monday–Saturday (SPEC §6.3); Sunday is off. */
export const isSunday = (day: string) => weekdayIndex(day) === 6;

export const monthOfDay = (day: string) => day.slice(0, 7);

export const shiftMonth = (month: string, amount: number) => {
  const [year, value] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (value - 1) + amount;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
};

export const monthBounds = (month: string) => {
  const first = `${month}-01`;
  const last = shiftDay(`${shiftMonth(month, 1)}-01`, -1);
  return { first, last };
};

/**
 * Monday-first month grid: whole weeks covering the month (4–6 rows). `from`/`to` are the first and
 * last visible days — the calendar query window (≤ 42 days, inside leaveLimits.maxCalendarDays).
 */
export const monthGrid = (month: string) => {
  const { first, last } = monthBounds(month);
  const from = shiftDay(first, -weekdayIndex(first));
  const to = shiftDay(last, 6 - weekdayIndex(last));
  const weeks: { day: string; inMonth: boolean }[][] = [];
  for (let day = from; day <= to; day = shiftDay(day, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, index) => {
        const current = shiftDay(day, index);
        return { day: current, inMonth: monthOfDay(current) === month };
      })
    );
  }
  return { from, to, weeks };
};

// Requests → days ---------------------------------------------------------------------------------

/** Statuses drawn on the shared calendar; rejected/cancelled ones only appear in "Đơn của tôi". */
export const calendarStatuses: readonly LeaveStatus[] = ["APPROVED", "PENDING"];

export type LeaveDayEntry = {
  request: LeaveRequest;
  part: LeavePart;
  /** 1 for a full day, 0.5 for a half day. */
  amount: number;
};

const entryOrder = (a: LeaveDayEntry, b: LeaveDayEntry) =>
  (a.request.status === "APPROVED" ? 0 : 1) - (b.request.status === "APPROVED" ? 0 : 1) ||
  a.request.user.displayName.localeCompare(b.request.user.displayName, "vi") ||
  a.request.id.localeCompare(b.request.id);

/**
 * Spreads each visible request over the days it covers, clipped to [from, to]. Half-day requests
 * cover exactly one day with amount 0.5. Each day lists approved leave first, then pending, by name.
 */
export const bucketLeaveByDay = (
  items: readonly LeaveRequest[],
  from: string,
  to: string,
  statuses: readonly LeaveStatus[] = calendarStatuses
) => {
  const byDay = new Map<string, LeaveDayEntry[]>();
  for (const request of items) {
    if (!statuses.includes(request.status)) continue;
    const half = request.part !== "FULL_DAY";
    const start = request.fromDate > from ? request.fromDate : from;
    const endDay = half ? request.fromDate : request.toDate;
    const end = endDay < to ? endDay : to;
    for (let day = start; day <= end; day = shiftDay(day, 1)) {
      const list = byDay.get(day) ?? [];
      list.push({ request, part: request.part, amount: half ? 0.5 : 1 });
      byDay.set(day, list);
    }
  }
  for (const list of byDay.values()) list.sort(entryOrder);
  return byDay;
};

/** Total leave (in days) per day, e.g. two full days and one half day → 2.5. */
export const leaveLoad = (entries: readonly LeaveDayEntry[] | undefined) =>
  (entries ?? []).reduce((total, entry) => total + entry.amount, 0);

// Labels ------------------------------------------------------------------------------------------

export const leavePartLabels: Record<LeavePart, string> = {
  FULL_DAY: "Cả ngày",
  MORNING: "Buổi sáng",
  AFTERNOON: "Buổi chiều"
};

/** One-letter marker for half days on dense cells: S(áng) / C(hiều). */
export const leavePartShort: Record<LeavePart, string> = { FULL_DAY: "", MORNING: "S", AFTERNOON: "C" };

export const leaveStatusLabels: Record<LeaveStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy"
};

const dayMonth = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const fullDay = (day: string) => `${dayMonth(day)}/${day.slice(0, 4)}`;

/** "12/10/2026", "12/10 – 14/10/2026", "28/12/2026 – 02/01/2027". */
export const formatLeaveDates = (fromDate: string, toDate: string) => {
  if (fromDate === toDate) return fullDay(fromDate);
  return fromDate.slice(0, 4) === toDate.slice(0, 4)
    ? `${dayMonth(fromDate)} – ${fullDay(toDate)}`
    : `${fullDay(fromDate)} – ${fullDay(toDate)}`;
};

const dayCountFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
export const formatLeaveDays = (days: number) => `${dayCountFormatter.format(days)} ngày`;

// Request form ------------------------------------------------------------------------------------

export type LeaveDraft = { fromDate: string; toDate: string; part: LeavePart; note: string };

/** Days a draft covers (0.5 for half days), 0 when the range is reversed. */
export const draftDays = (draft: Pick<LeaveDraft, "fromDate" | "toDate" | "part">) => {
  const days = daysBetween(draft.fromDate, draft.toDate);
  if (days === 0) return 0;
  return draft.part === "FULL_DAY" ? days : 0.5;
};

/**
 * Client-side checks mirroring the server rules (leaveLimits). Returns the first problem as
 * Vietnamese copy, or null. The server validates again.
 */
export const validateLeaveDraft = (draft: LeaveDraft, today: string): string | null => {
  if (!draft.fromDate || !draft.toDate) return "Chọn ngày bắt đầu và ngày kết thúc.";
  if (draft.toDate < draft.fromDate) return "Ngày kết thúc phải sau hoặc trùng ngày bắt đầu.";
  if (draft.part !== "FULL_DAY" && draft.fromDate !== draft.toDate) {
    return "Nghỉ nửa ngày chỉ áp dụng cho đơn nghỉ trong một ngày.";
  }
  if (daysBetween(draft.fromDate, draft.toDate) > leaveLimits.maxRequestDays) {
    return `Mỗi đơn nghỉ tối đa ${leaveLimits.maxRequestDays} ngày.`;
  }
  if (draft.fromDate < shiftDay(today, -leaveLimits.maxPastDays)) {
    return `Không thể xin nghỉ cho ngày đã qua quá ${leaveLimits.maxPastDays} ngày.`;
  }
  if (draft.fromDate > shiftDay(today, leaveLimits.maxFutureDays)) {
    return `Chỉ có thể xin nghỉ trước tối đa ${leaveLimits.maxFutureDays} ngày.`;
  }
  if (draft.note.trim().length > leaveLimits.noteMaxLength) {
    return `Ghi chú tối đa ${leaveLimits.noteMaxLength} ký tự.`;
  }
  return null;
};

/**
 * Query windows (≤ maxCalendarDays each) covering [from, to]: "Đơn của tôi" spans the past
 * maxPastDays through maxFutureDays ahead, more than one calendar query allows.
 */
export const queryWindows = (from: string, to: string, size: number = leaveLimits.maxCalendarDays) => {
  const windows: { from: string; to: string }[] = [];
  for (let start = from; start <= to; start = shiftDay(start, size)) {
    const end = shiftDay(start, size - 1);
    windows.push({ from: start, to: end < to ? end : to });
  }
  return windows;
};
