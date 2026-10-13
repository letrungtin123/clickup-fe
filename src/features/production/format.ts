/**
 * Number / money / calendar-day helpers for the production module (SPEC §0: money is integer VND,
 * credits are decimal(10,2), days are business calendar days in the organization timezone).
 * Pure functions — unit tested in format.test.ts.
 */

import { kpiCloseDayEndOfMonth, type KpiCloseDayVersion } from "@/contracts/production-catalog";
import {
  closeDayOfPeriod,
  kpiPeriodOfDay,
  kpiPeriodRange,
  type KpiCloseDays
} from "@/contracts/production-scores";

const creditFormatter = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const moneyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0
});
const integerFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export const EMPTY_VALUE = "—";

/** Credits always show two decimals: 1 → "1,00", 1.48 → "1,48". */
export const formatCredit = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? EMPTY_VALUE
    : creditFormatter.format(value);

/** VND per image; null means "no price" (points only). */
export const formatMoney = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? EMPTY_VALUE
    : moneyFormatter.format(value);

export const formatInteger = (value: number) => integerFormatter.format(value);

const decimalFormatters = new Map<number, Intl.NumberFormat>();
const decimalFormatter = (maxFractionDigits: number) => {
  let formatter = decimalFormatters.get(maxFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: maxFractionDigits });
    decimalFormatters.set(maxFractionDigits, formatter);
  }
  return formatter;
};

/**
 * The one Vietnamese number format for quantities with decimals (BUG-PR-22): hours, days, rates —
 * 1.5 → "1,5", 1234.5 → "1.234,5", 2 → "2". At most `maxFractionDigits` (default 1); null → "—".
 */
export const formatNumber = (value: number | null | undefined, maxFractionDigits = 1) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? EMPTY_VALUE
    : decimalFormatter(maxFractionDigits).format(value);

/** KPI / progress percents already ×100, one decimal everywhere (BUG-PR-24): 94.65 → "94,7%". */
export const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? EMPTY_VALUE
    : `${decimalFormatter(1).format(value)}%`;

/** Number typed with either decimal separator ("1,5" or "1.5"); null when it is not a number. */
export const parseDecimalInput = (text: string) => {
  const raw = text.trim().replace(/\s/g, "");
  if (!/^\d+([.,]\d+)?$/.test(raw)) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
};

type ParseResult = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Credit typed by a person: accepts "1,48" and "1.48", at most two decimals, ≥ 0. Grouping
 * separators are tolerated when both kinds appear ("1.234,5" → 1234.5). Empty → null.
 */
export const parseCreditInput = (text: string, max = 99_999_999.99): ParseResult => {
  const raw = text.replace(/\s/g, "");
  if (raw === "") {
    return { ok: true, value: null };
  }
  let normalized = raw;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // The right-most separator is the decimal one; the other groups thousands.
    const decimal = lastComma > lastDot ? "," : ".";
    const group = decimal === "," ? "." : ",";
    normalized = raw.split(group).join("").replace(decimal, ".");
  } else {
    normalized = raw.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return { ok: false, error: "Nhập số ≥ 0, ví dụ 1,5." };
  }
  const [, fraction = ""] = normalized.split(".");
  if (fraction.length > 2) {
    return { ok: false, error: "Tối đa 2 chữ số thập phân." };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value > max) {
    return { ok: false, error: "Số quá lớn." };
  }
  return { ok: true, value };
};

/** Money typed by a person: "7.000", "7 000 ₫", "7000đ" → 7000. Empty → null (no price). */
export const parseMoneyInput = (text: string, max = 1_000_000_000): ParseResult => {
  const raw = text.replace(/[\s.,_₫]/g, "").replace(/(vnd|đ|d)$/i, "");
  if (raw === "") {
    return { ok: true, value: null };
  }
  if (!/^\d+$/.test(raw)) {
    return { ok: false, error: "Nhập số tiền nguyên (VND), ví dụ 7.000." };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > max) {
    return { ok: false, error: "Số tiền quá lớn." };
  }
  return { ok: true, value };
};

// Calendar days (YYYY-MM-DD) --------------------------------------------------------------------

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isDay = (value: string) => {
  const match = dayPattern.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
};

/** Today in `timeZone` as YYYY-MM-DD (the API's business day, not the browser's). */
export const todayIn = (timeZone: string, now: Date = new Date()) => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA").format(now);
  }
};

/** Local-midnight Date for a YYYY-MM-DD day (for calendars), or null when invalid. */
export const dayToDate = (day: string | null | undefined) => {
  if (!day || !isDay(day)) return null;
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, date);
};

/** YYYY-MM-DD for a calendar Date picked in the browser (local fields, no timezone shift). */
export const dateToDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const addDays = (day: string, amount: number) => {
  const date = dayToDate(day);
  if (!date) return day;
  date.setDate(date.getDate() + amount);
  return dateToDay(date);
};

/** "09/10/2026". */
export const formatDay = (day: string | null | undefined) => {
  const date = dayToDate(day);
  if (!date) return EMPTY_VALUE;
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
};

/**
 * Human range for a credit version. `effectiveTo` is exclusive in the API ([from, to)), so the last
 * day shown is the day before it.
 */
export const formatVersionRange = (effectiveFrom: string, effectiveTo: string | null) =>
  effectiveTo === null
    ? `Từ ${formatDay(effectiveFrom)}`
    : `${formatDay(effectiveFrom)} – ${formatDay(addDays(effectiveTo, -1))}`;

const dayIndex = (day: string) =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) /
  86_400_000;

/** "2026-10" → "2026-11" (or back with a negative step). */
export const shiftKpiPeriod = (period: string, months: number) => {
  const index = Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1 + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

/** "2026-11" → "11/2026". */
export const formatKpiPeriod = (period: string) => `${period.slice(5, 7)}/${period.slice(0, 4)}`;

/**
 * A close day the API accepts: 1–28, or 31 = "Cuối tháng" (PD-032); anything above 28 means the end of the
 * month, anything below 1 the 1st.
 */
export const normalizeCloseDay = (day: number) =>
  day > 28 ? kpiCloseDayEndOfMonth : Math.min(Math.max(1, Math.trunc(day)), 28);

/** "ngày 25", or "cuối tháng" for the close day 31 (PD-032): "Kỳ KPI chốt {label}". */
export const closeDayLabel = (day: number) =>
  day === kpiCloseDayEndOfMonth ? "cuối tháng" : `ngày ${day}`;

/** "ngày 25 hằng tháng", or "ngày cuối mỗi tháng" for the close day 31. */
export const closeDaySchedule = (day: number) =>
  day === kpiCloseDayEndOfMonth ? "ngày cuối mỗi tháng" : `ngày ${day} hằng tháng`;

/**
 * KPI period containing `today` (PLAN §6): from the day after the close day of the previous period
 * through this period's close day. `closeDays` is settings.kpiCloseDays (a changed close day applies
 * from the next period, G15) or one day for every period (normalizeCloseDay: 1–28 or 31 = the month's
 * last day). Uses the shared contract helpers (production-scores kpiPeriodOfDay / kpiPeriodRange).
 * `daysLeft` counts today, like the API forecast (BUG-PR-24): 1 on the close day itself.
 */
export const kpiPeriod = (today: string, closeDays: KpiCloseDays) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !dayToDate(today)) return null;
  const days = typeof closeDays === "number" ? normalizeCloseDay(closeDays) : closeDays;
  const period = kpiPeriodOfDay(today, days);
  const { from, to } = kpiPeriodRange(period, days);
  return { period, start: from, end: to, daysLeft: dayIndex(to) - dayIndex(today) + 1 };
};

/**
 * What saving close day `day` in Cài đặt chung does (G15, BE PATCH settings): the new day applies
 * from the NEXT period (the current one keeps its dates); saving the day in force cancels a
 * scheduled change. `nextRange` = the next period's dates once saved.
 */
export const closeDayChange = (
  today: string,
  closeDays: readonly KpiCloseDayVersion[],
  day: number
) => {
  const current = kpiPeriod(today, closeDays);
  if (!current) return null;
  const next = shiftKpiPeriod(current.period, 1);
  const inForce = closeDayOfPeriod(closeDays, current.period);
  const scheduled = closeDayOfPeriod(closeDays, next);
  const kept = closeDays.filter((version) => (version.fromPeriod ?? "") <= current.period);
  const saved = day === inForce ? kept : [...kept, { fromPeriod: next, closeDay: day }];
  return {
    current,
    inForce,
    next,
    /** Close day the next period has before saving (≠ inForce: a change is already scheduled). */
    scheduled,
    nextRange: kpiPeriodRange(next, saved),
    /** Saving changes what the next period uses. */
    changes: day !== scheduled
  };
};

/** True when `day` falls inside [from, to). Days compare lexicographically as YYYY-MM-DD. */
export const dayInRange = (day: string, from: string, to: string | null) =>
  from <= day && (to === null || day < to);
