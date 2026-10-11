/**
 * Calendar days of knowledge items ("YYYY-MM-DD": effective date, review date) — local fields, no time
 * zone shift.
 */

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isDay = (value: string | null | undefined): value is string => Boolean(value && dayPattern.test(value));

export const formatDay = (day: string | null | undefined) => {
  const match = day ? dayPattern.exec(day) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
};

export const dateToDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const todayDay = (now = new Date()) => dateToDay(now);

/** Adds whole months, clamping to the month's last day (31/01 + 1 month → 28/02). */
export const addMonths = (day: string, months: number) => {
  const match = dayPattern.exec(day);
  if (!match) return day;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1 + months;
  const target = new Date(year, month, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(Number(match[3]), lastDay));
  return dateToDay(target);
};

/** Days from `from` to `day` (negative = in the past). */
export const daysUntil = (day: string, from = todayDay()) => {
  const parse = (value: string) => {
    const match = dayPattern.exec(value);
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
  };
  return Math.round((parse(day) - parse(from)) / 86_400_000);
};

/** "còn 5 ngày" / "hôm nay" / "quá 3 ngày". */
export const describeDue = (day: string, from = todayDay()) => {
  const days = daysUntil(day, from);
  if (Number.isNaN(days)) return "";
  if (days === 0) return "hôm nay";
  if (days > 0) return `còn ${days} ngày`;
  return `quá ${-days} ngày`;
};
