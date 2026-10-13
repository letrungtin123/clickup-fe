import type { KpiCloseDayVersion } from "@/contracts/production-catalog";
import { closeDayOfPeriod, type KpiCloseDays } from "@/contracts/production-scores";

/**
 * KPI period helpers (PLAN §6, SPEC Phase 3 §2): a period "YYYY-MM" runs from the day after the
 * previous period's close day through this period's close day, so with close day 25 the period 2026-06
 * is 26/05/2026 – 25/06/2026; with 31 = "Cuối tháng" (PD-032) it is the calendar month (01/02 – 28/02).
 * The close day can change from a given period (settings.kpiCloseDays): the
 * day ↔ period maths is the contract's kpiPeriodOfDay / kpiPeriodRange / closeDayOfPeriod, fed with
 * `closeDaysOf(me.settings)`. Pure functions, unit tested.
 */

const periodPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const isPeriod = (value: string | null | undefined): value is string =>
  typeof value === "string" && periodPattern.test(value);

const parse = (period: string) => {
  const match = periodPattern.exec(period);
  if (!match) throw new RangeError(`Invalid period ${period}`);
  return { year: Number(match[1]), month: Number(match[2]) };
};

const key = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Close days to compute periods with: the versions of /production/me (a change applies from a given
 * period), else the single close day, else 25 while /me loads.
 */
export const closeDaysOf = (
  settings:
    { kpiCloseDay?: number; kpiCloseDays?: readonly KpiCloseDayVersion[] } | null | undefined
): KpiCloseDays =>
  settings?.kpiCloseDays && settings.kpiCloseDays.length > 0
    ? settings.kpiCloseDays
    : (settings?.kpiCloseDay ?? 25);

/**
 * The next close-day change after `period` (e.g. an Admin moved the close day to 20 from 11/2026):
 * its first period and day, or null when the close day stays the same.
 */
export const upcomingCloseDayChange = (closeDays: KpiCloseDays, period: string) => {
  if (typeof closeDays === "number") return null;
  const current = closeDayOfPeriod(closeDays, period);
  const next = [...closeDays]
    .filter((version) => version.fromPeriod !== null && version.fromPeriod > period)
    .sort((a, b) => (a.fromPeriod ?? "").localeCompare(b.fromPeriod ?? ""))[0];
  return next && next.closeDay !== current
    ? { fromPeriod: next.fromPeriod ?? period, closeDay: next.closeDay }
    : null;
};

/** Period `amount` months after (or before, when negative) `period`. */
export const shiftPeriod = (period: string, amount: number) => {
  const { year, month } = parse(period);
  const index = year * 12 + (month - 1) + amount;
  return key(Math.floor(index / 12), (index % 12) + 1);
};

/** Every period from `from` to `to` inclusive (empty when reversed). */
export const periodsBetween = (from: string, to: string) => {
  const result: string[] = [];
  for (
    let current = from;
    current <= to && result.length < 1200;
    current = shiftPeriod(current, 1)
  ) {
    result.push(current);
  }
  return result;
};

/** "2026-06" → "06/2026". */
export const formatPeriod = (period: string) => {
  if (!isPeriod(period)) return period;
  const { year, month } = parse(period);
  return `${pad(month)}/${year}`;
};

/** "Kỳ 06/2026". */
export const periodLabel = (period: string) => `Kỳ ${formatPeriod(period)}`;

/** "26/05 – 25/06/2026" (year shown once when both ends share it). */
export const formatDayRange = (from: string, to: string) => {
  const [fy, fm, fd] = from.split("-");
  const [ty, tm, td] = to.split("-");
  if (!fy || !ty) return `${from} – ${to}`;
  return fy === ty ? `${fd}/${fm} – ${td}/${tm}/${ty}` : `${fd}/${fm}/${fy} – ${td}/${tm}/${ty}`;
};

/** Quarter key of a period, as the KPI report uses it: "2026-06" → "2026-Q2". */
export const quarterOfPeriod = (period: string) => {
  const { year, month } = parse(period);
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
};

/** Labels for KPI report rollup keys: "2026-Q2" → "Quý 2/2026", "2026" → "Năm 2026". */
export const rollupLabel = (rollupKey: string) => {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(rollupKey);
  if (quarter) return `Quý ${quarter[2]}/${quarter[1]}`;
  if (/^\d{4}$/.test(rollupKey)) return `Năm ${rollupKey}`;
  return rollupKey;
};

/** Short month header for matrices: "2026-06" → "T6". */
export const monthShortLabel = (period: string) => `T${parse(period).month}`;
