/**
 * Number / money / calendar-day helpers for the production module (SPEC §0: money is integer VND,
 * credits are decimal(10,2), days are business calendar days in the organization timezone).
 * Pure functions — unit tested in format.test.ts.
 */

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

/**
 * KPI period containing `today` (PLAN §6): from the day after the close day of the previous month
 * through the close day of this month (close day 1–28, so it exists in every month).
 */
export const kpiPeriod = (today: string, closeDay: number) => {
  const date = dayToDate(today);
  if (!date) return null;
  const day = Math.min(Math.max(1, Math.trunc(closeDay)), 28);
  const year = date.getFullYear();
  const month = date.getMonth();
  const endMonth = date.getDate() <= day ? month : month + 1;
  const end = new Date(year, endMonth, day);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, day + 1);
  const daysLeft = Math.round((end.getTime() - date.getTime()) / 86_400_000);
  return { start: dateToDay(start), end: dateToDay(end), daysLeft };
};

/** True when `day` falls inside [from, to). Days compare lexicographically as YYYY-MM-DD. */
export const dayInRange = (day: string, from: string, to: string | null) =>
  from <= day && (to === null || day < to);
