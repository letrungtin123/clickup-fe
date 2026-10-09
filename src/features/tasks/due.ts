import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  format,
  isSameDay,
  isSameYear,
  startOfDay,
  startOfWeek
} from "date-fns";
import { vi } from "date-fns/locale";

import type { TaskSummary } from "@/contracts/work";

/**
 * Deadline semantics (spec §11). Derived on the fly from dueAt / completedAt / status category —
 * never stored. Dates picked without a time are saved as the local end of day (due) or start of
 * day (start), so "due today" stays "today" until midnight.
 */

export type DueTone = "overdue" | "today" | "soon" | "upcoming" | "done" | "none";

type DueSubject = Pick<TaskSummary, "dueAt" | "completedAt"> & {
  status: Pick<TaskSummary["status"], "category">;
};

export const isTaskDone = (task: { completedAt: string | null; status: { category: string } }) =>
  task.completedAt !== null || task.status.category !== "active";

export const dueTone = (task: DueSubject, now: Date = new Date()): DueTone => {
  if (!task.dueAt) return "none";
  if (isTaskDone(task)) return "done";
  const due = new Date(task.dueAt);
  if (due.getTime() < now.getTime()) return "overdue";
  if (isSameDay(due, now)) return "today";
  if (differenceInCalendarDays(due, now) === 1) return "soon";
  return "upcoming";
};

/** Text classes per tone: overdue red, today amber, upcoming normal, done muted. */
export const dueToneClass: Record<DueTone, string> = {
  overdue: "text-danger",
  today: "text-warning",
  soon: "text-foreground",
  upcoming: "text-foreground-muted",
  done: "text-foreground-subtle",
  none: "text-foreground-subtle"
};

export const dueToneLabel: Record<DueTone, string> = {
  overdue: "Quá hạn",
  today: "Đến hạn hôm nay",
  soon: "Đến hạn ngày mai",
  upcoming: "Sắp đến hạn",
  done: "Đã xong",
  none: "Không có hạn"
};

/** Compact relative date for rows and cards: Hôm nay / Ngày mai / Hôm qua / Thứ 5 / 12 thg 10. */
export const formatShortDate = (iso: string, now: Date = new Date()) => {
  const date = new Date(iso);
  const days = differenceInCalendarDays(date, now);
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Ngày mai";
  if (days === -1) return "Hôm qua";
  if (days > 1 && days < 7) return format(date, "EEEE", { locale: vi }).replace(/^thứ/i, "Thứ");
  return isSameYear(date, now)
    ? format(date, "d 'thg' M", { locale: vi })
    : format(date, "d 'thg' M, yyyy", { locale: vi });
};

/** Absolute short date for history ("12 thg 10", + time when not a whole day, + year when not current). */
export const formatDayMonth = (iso: string, now: Date = new Date()) => {
  const date = new Date(iso);
  const wholeDay =
    (date.getHours() === 23 && date.getMinutes() === 59) || (date.getHours() === 0 && date.getMinutes() === 0);
  const day = isSameYear(date, now) ? format(date, "d 'thg' M", { locale: vi }) : format(date, "d 'thg' M, yyyy", { locale: vi });
  return wholeDay ? day : `${day} ${format(date, "HH:mm")}`;
};

/** Full date (+ time when it is not a whole-day value) for tooltips and the detail panel. */
export const formatFullDate = (iso: string) => {
  const date = new Date(iso);
  const wholeDay =
    (date.getHours() === 23 && date.getMinutes() === 59) ||
    (date.getHours() === 0 && date.getMinutes() === 0);
  return format(date, wholeDay ? "EEEE, d 'tháng' M, yyyy" : "HH:mm, EEEE, d 'tháng' M, yyyy", {
    locale: vi
  }).replace(/^(\d{2}:\d{2}, )?thứ/i, (match) => match.replace(/thứ$/i, "Thứ"));
};

/** A picked calendar day → ISO timestamp (due = local end of day, start = local start of day). */
export const dayToIso = (day: Date, kind: "due" | "start") =>
  (kind === "due" ? endOfDay(day) : startOfDay(day)).toISOString();

/** due ≥ start (same rule the API enforces). */
export const datesValid = (startAt: string | null, dueAt: string | null) =>
  !startAt || !dueAt || new Date(dueAt).getTime() >= new Date(startAt).getTime();

// --- My tasks buckets ----------------------------------------------------------------------------

export type DueBucket = "overdue" | "today" | "week" | "later" | "none" | "done";

export const dueBuckets: readonly { key: DueBucket; label: string }[] = [
  { key: "overdue", label: "Quá hạn" },
  { key: "today", label: "Hôm nay" },
  { key: "week", label: "Tuần này" },
  { key: "later", label: "Sau này" },
  { key: "none", label: "Không có hạn" },
  { key: "done", label: "Đã xong" }
];

/** Client-side bucket of an assigned task by its deadline (local timezone, weeks start Monday). Done work is its own bucket. */
export const dueBucket = (task: DueSubject, now: Date = new Date()): DueBucket => {
  if (isTaskDone(task)) return "done";
  if (!task.dueAt) return "none";
  const due = new Date(task.dueAt);
  if (due.getTime() < now.getTime()) return "overdue";
  if (isSameDay(due, now)) return "today";
  const weekEnd = addDays(startOfWeek(now, { weekStartsOn: 1 }), 7);
  return due.getTime() < weekEnd.getTime() ? "week" : "later";
};
