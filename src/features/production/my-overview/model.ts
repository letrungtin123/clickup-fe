import type { ProductionStatus } from "@/contracts/production-catalog";
import {
  myOverviewDaySpan,
  myOverviewMaxDays,
  myOverviewTagsOf,
  type MyOverview,
  type MyOverviewImages,
  type MyOverviewQcTask,
  type MyOverviewTagKey,
  type MyOverviewTask
} from "@/contracts/production-my-overview";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";

import { addDays, formatInteger, formatNumber, isDay } from "../format";
import { isoToZoned, maxDeclaredDoneQty, qcActions } from "../jobs-model";
import { myOverviewCopy as copy } from "./copy";

/**
 * PD-081 "Tổng quan của tôi" — pure page model (unit tested in model.test.ts): the time filter and its URL, the tag /
 * status filter, the wording of deadlines, waits and images, and which quick action a row offers (always one of the
 * task's own `capabilities.transitions` — never invented).
 */

// Time filter ----------------------------------------------------------------------------------------------------------

export type MyOverviewRangeKey = "today" | "week" | "month" | "custom";
export type MyOverviewTime = { key: MyOverviewRangeKey; from: string | null; to: string | null };
export type MyOverviewRange = { from: string; to: string };

export const todayTime: MyOverviewTime = { key: "today", from: null, to: null };

/** `?range=week|month|custom&from=&to=`; nothing (or anything unusable) = Hôm nay. */
export const myOverviewTimeFromSearch = (params: URLSearchParams): MyOverviewTime => {
  const key = params.get("range");
  if (key === "week" || key === "month") return { key, from: null, to: null };
  if (key === "custom") {
    const from = params.get("from");
    const to = params.get("to");
    if (from && isDay(from)) return { key, from, to: to && isDay(to) ? to : from };
  }
  return todayTime;
};

export const myOverviewTimeToSearch = (time: MyOverviewTime, previous: URLSearchParams) => {
  const next = new URLSearchParams(previous);
  for (const name of ["range", "from", "to"]) next.delete(name);
  if (time.key !== "today") next.set("range", time.key);
  if (time.key === "custom" && time.from) {
    next.set("from", time.from);
    next.set("to", time.to ?? time.from);
  }
  return next;
};

const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** The organization-calendar days of a choice: today; Monday – Sunday; the calendar month; a custom range (≤ 92 days). */
export const myOverviewRangeOf = (time: MyOverviewTime, today: string): MyOverviewRange => {
  switch (time.key) {
    case "week": {
      const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
      return { from: monday, to: addDays(monday, 6) };
    }
    case "month": {
      const first = `${today.slice(0, 7)}-01`;
      const next = new Date(`${first}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(0);
      return { from: first, to: next.toISOString().slice(0, 10) };
    }
    case "custom": {
      const a = time.from ?? today;
      const b = time.to ?? a;
      const from = a <= b ? a : b;
      const to = a <= b ? b : a;
      // A longer link keeps its last days (the API refuses more).
      return myOverviewDaySpan(from, to) > myOverviewMaxDays
        ? { from: addDays(to, -(myOverviewMaxDays - 1)), to }
        : { from, to };
    }
    default:
      return { from: today, to: today };
  }
};

/** "22/10" this year, "22/10/2025" another year. */
export const shortDay = (day: string, today: string) =>
  `${day.slice(8, 10)}/${day.slice(5, 7)}${day.slice(0, 4) === today.slice(0, 4) ? "" : `/${day.slice(0, 4)}`}`;

/** The header's sub-line: what the list holds ("Hôm nay, 22/10 · đến hạn hôm nay + task trễ và bị trả sửa từ trước"). */
export const myOverviewRangeText = (
  time: MyOverviewTime,
  range: MyOverviewRange,
  today: string
) => {
  const days =
    range.from === range.to
      ? shortDay(range.from, today)
      : `${shortDay(range.from, today)} – ${shortDay(range.to, today)}`;
  const intro =
    time.key === "today"
      ? copy.rangeIntro.today(shortDay(today, today))
      : time.key === "week"
        ? copy.rangeIntro.week(days)
        : time.key === "month"
          ? copy.rangeIntro.month(`${range.from.slice(5, 7)}/${range.from.slice(0, 4)}`)
          : copy.rangeIntro.custom(days);
  return `${intro} · ${time.key === "today" ? copy.rangeRule.today : copy.rangeRule.other}`;
};

// Tag / status filter ----------------------------------------------------------------------------------------------------

export type MyOverviewFilter = { tag: MyOverviewTagKey; statusId: string | null };
export const noFilter: MyOverviewFilter = { tag: "mine", statusId: null };

const tagKeys: ReadonlySet<string> = new Set(["inProgress", "qc", "done", "late"]);

/** `?tag=inProgress|qc|done|late&status=<id>` (status only within a list tag); "qc" only for holders of QC. */
export const myOverviewFilterFromSearch = (
  params: URLSearchParams,
  isQc: boolean
): MyOverviewFilter => {
  const raw = params.get("tag");
  const tag =
    raw && tagKeys.has(raw) && (raw !== "qc" || isQc) ? (raw as MyOverviewTagKey) : "mine";
  return { tag, statusId: tag === "qc" ? null : params.get("status") || null };
};

export const myOverviewFilterToSearch = (filter: MyOverviewFilter, previous: URLSearchParams) => {
  const next = new URLSearchParams(previous);
  next.delete("tag");
  next.delete("status");
  if (filter.tag !== "mine") next.set("tag", filter.tag);
  if (filter.statusId && filter.tag !== "qc") next.set("status", filter.statusId);
  return next;
};

/** A tag click: that tag (its status filter cleared); the chosen tag again → back to "Việc của tôi". */
export const toggleTag = (current: MyOverviewFilter, tag: MyOverviewTagKey): MyOverviewFilter =>
  current.tag === tag ? noFilter : { tag, statusId: null };

/** The lines of the chosen list tag and status (the QC tag shows the QC queue instead). */
export const filterMyTasks = (tasks: readonly MyOverviewTask[], filter: MyOverviewFilter) =>
  filter.tag === "qc"
    ? []
    : tasks.filter(
        (line) =>
          myOverviewTagsOf(line).includes(filter.tag as Exclude<MyOverviewTagKey, "qc">) &&
          (filter.statusId === null || line.task.status.id === filter.statusId)
      );

// Wording ------------------------------------------------------------------------------------------------------------------

/** Minutes as "2h 10m", "45m", "3h". */
export const formatClockMinutes = (minutes: number) => {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

/** "vừa xong", "10 phút trước", "3 giờ trước", "2 ngày trước". */
export const agoText = (iso: string, now: Date) => {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return copy.ago.now;
  if (minutes < 60) return copy.ago.minutes(minutes);
  if (minutes < 24 * 60) return copy.ago.hours(Math.floor(minutes / 60));
  return copy.ago.days(Math.floor(minutes / (24 * 60)));
};

/** "15:00" today, "21/10 15:00" another day (organization time). */
export const timeText = (iso: string, timeZone: string, today: string) => {
  const zoned = isoToZoned(iso, timeZone);
  return zoned.day === today ? zoned.time : `${shortDay(zoned.day, today)} ${zoned.time}`;
};

/** The deadline column: "22/10 15:00". */
export const deadlineText = (iso: string, timeZone: string, today: string) => {
  const zoned = isoToZoned(iso, timeZone);
  return `${shortDay(zoned.day, today)} ${zoned.time}`;
};

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

export type HintTone = "danger" | "warning" | "success" | "muted";
export type Hint = { text: string; tone: HintTone };

/**
 * The line under a row's deadline: "Trễ · 1 ngày" (red), "còn 2h 10m" (orange — core-window time, ≤ 3h), "Hôm nay",
 * "Ngày mai", "còn 4 ngày", "Xong · đã qua QC", "Done đúng hạn".
 */
export const deadlineHint = (line: MyOverviewTask, now: Date, timeZone: string): Hint => {
  const task = line.task;
  if (line.finished) {
    const text =
      task.status.code === "CHECKED"
        ? copy.deadline.passedQc
        : task.process.isQc
          ? copy.deadline.finished
          : copy.deadline.finishedJob;
    return { text, tone: "success" };
  }
  if (line.late) {
    const today = isoToZoned(now.toISOString(), timeZone).day;
    const dueDay = isoToZoned(task.deadline, timeZone).day;
    const days = dayNumber(today) - dayNumber(dueDay);
    const label =
      days >= 1
        ? `${days} ngày`
        : formatClockMinutes((now.getTime() - Date.parse(task.deadline)) / 60_000);
    return { text: copy.deadline.late(label), tone: "danger" };
  }
  if (line.withQc) {
    const doneAt = line.lastDoneAt ?? task.doneAt;
    const onTime = doneAt !== null && Date.parse(doneAt) <= Date.parse(task.deadline);
    return {
      text: onTime ? copy.deadline.doneOnTime : copy.deadline.doneLate,
      tone: onTime ? "success" : "muted"
    };
  }
  if (line.dueSoon && line.dueCoreMinutes !== null) {
    return {
      text:
        line.dueCoreMinutes > 0
          ? copy.deadline.left(formatClockMinutes(line.dueCoreMinutes))
          : copy.deadline.dueNow,
      tone: "warning"
    };
  }
  const today = isoToZoned(now.toISOString(), timeZone).day;
  const days = dayNumber(isoToZoned(task.deadline, timeZone).day) - dayNumber(today);
  if (days <= 0) return { text: copy.deadline.today, tone: "muted" };
  if (days === 1) return { text: copy.deadline.tomorrow, tone: "muted" };
  return { text: copy.deadline.inDays(days), tone: "muted" };
};

/**
 * "xong / giao": "— / 25 tấm" while the work is open (a line sent back too), "25 / 25 tấm" once Done (with QC or finished);
 * "— / chưa có số lượng" without a quantity (PD-058).
 */
export const imagesText = (line: {
  images: MyOverviewImages;
  finished: boolean;
  withQc: boolean;
}) => {
  const done =
    (line.finished || line.withQc) && line.images.done !== null
      ? formatInteger(line.images.done)
      : "—";
  return line.images.assigned === null
    ? `${done} / ${copy.list.noQty}`
    : copy.list.imagesOf(done, formatInteger(line.images.assigned));
};

/** My line waiting on QC: "Done 11:05 · đang chờ QC 3h" / "Done 11:05 · QC đang check" / "Done 11:05 · chờ chuyển QC". */
export const withQcText = (line: MyOverviewTask, timeZone: string, today: string) => {
  const doneAt = line.lastDoneAt ?? line.task.doneAt;
  const time = doneAt ? timeText(doneAt, timeZone, today) : "—";
  if (line.task.status.code === "QC_CHECKING") return copy.actions.checkingQc(time);
  if (line.task.status.code === "WAITING_QC")
    return copy.actions.waitingQc(time, formatClockMinutes(line.qcWait?.minutes ?? 0));
  return copy.actions.doneNoQc(time);
};

/** A queued line's time: "Chờ 2h 15m" (alert ≥ 2h of core time) or "Bạn bắt đầu check 10 phút trước". */
export const qcTimeText = (line: MyOverviewQcTask, now: Date): Hint => {
  if (line.task.status.code === "QC_CHECKING") {
    return {
      text: line.checkingSince
        ? copy.qc.started(agoText(line.checkingSince, now))
        : copy.qc.checking,
      tone: "muted"
    };
  }
  return {
    text:
      line.waitMinutes > 0
        ? copy.qc.waiting(formatClockMinutes(line.waitMinutes))
        : copy.qc.justArrived,
    tone: line.alert ? "warning" : "muted"
  };
};

/** The QC alert threshold in words: "2h" (or "1,5h"). */
export const alertHoursText = (minutes: number) => `${formatNumber(minutes / 60)}h`;

// Actions ----------------------------------------------------------------------------------------------------------------

type StatusMeta = Pick<
  ProductionStatus,
  "id" | "code" | "sortOrder" | "countsDone" | "countsChecked" | "isInitial"
>;

/**
 * "Done" of a row: straight into a Done status, or — a line sent back (Cần sửa lại) whose workflow goes through Đang làm
 * first — `via` that move, then the Done move the refreshed task offers.
 */
export type DonePath = { option: TaskTransitionOption | null; via: TaskTransitionOption | null };
export type MyTaskActions = { start: TaskTransitionOption | null; done: DonePath | null };

const noActions: MyTaskActions = { start: null, done: null };

/** Mới giao → "Bắt đầu" (into Đang làm); Đang làm / Cần sửa lại → "Done"; anything else: no quick action. */
export const myTaskActions = (
  task: Pick<ProductionTask, "status" | "capabilities" | "isSubtask" | "jobArchived">,
  statuses: readonly StatusMeta[]
): MyTaskActions => {
  if (task.isSubtask || task.jobArchived) return noActions;
  const byId = new Map(statuses.map((status) => [status.id, status]));
  const options = task.capabilities.transitions.filter((option) => !option.override);
  const into = (option: TaskTransitionOption) => byId.get(option.toStatusId);
  const doneOption = options.find((option) => into(option)?.countsDone) ?? null;
  const startOption =
    options.find((option) => into(option)?.code === "PROCESSING" && !option.requiresNote) ?? null;
  const current = byId.get(task.status.id);
  if (task.status.code === "ASSIGNED" || current?.isInitial)
    return { start: startOption, done: null };
  if (doneOption) return { start: null, done: { option: doneOption, via: null } };
  if (task.status.code === "REWORK" && startOption)
    return { start: null, done: { option: null, via: startOption } };
  return noActions;
};

/** The Done option a (refreshed) task offers now. */
export const doneOptionOf = (
  task: Pick<ProductionTask, "capabilities">,
  statuses: readonly StatusMeta[]
) => {
  const byId = new Map(statuses.map((status) => [status.id, status]));
  return (
    task.capabilities.transitions.find(
      (option) => !option.override && byId.get(option.toStatusId)?.countsDone
    ) ?? null
  );
};

/** "Số ảnh xong": a whole number ≥ 0 (≥ 1 when the line has no quantity yet, PD-058), at most the SEC2-03 cap. */
export const parseDoneQty = (
  text: string,
  task: Pick<ProductionTask, "qtyAssigned">
): { value: number } | { error: string } => {
  const raw = text.trim();
  if (raw === "") return { error: copy.actions.qtyRequired };
  if (!/^\d{1,7}$/.test(raw)) return { error: copy.actions.qtyInvalid };
  const value = Number(raw);
  if (task.qtyAssigned === null)
    return value >= 1 ? { value } : { error: copy.actions.qtyAtLeastOne };
  const max = maxDeclaredDoneQty(task.qtyAssigned);
  return value > max ? { error: copy.actions.qtyTooHigh(max, task.qtyAssigned) } : { value };
};

/** QC row: Chờ QC → "Bắt đầu check"; Đang check → "Đạt" and "Trả sửa" (from the task's own moves, PD-044). */
export const qcRowActions = (
  task: Pick<ProductionTask, "status" | "capabilities">,
  statuses: readonly Pick<ProductionStatus, "id" | "sortOrder" | "countsChecked">[]
) => {
  const { start, pass, fail } = qcActions(task, statuses);
  return task.status.code === "QC_CHECKING"
    ? { start: null, pass, fail }
    : task.status.code === "WAITING_QC"
      ? { start, pass: null, fail: null }
      : { start: null, pass: null, fail: null };
};

// Tags and "Cần bạn xử lý" -------------------------------------------------------------------------------------------------

export type TagCard = {
  key: MyOverviewTagKey;
  label: string;
  count: number;
  sub: string;
  tone: "brand" | "warning" | "info" | "success" | "danger";
  strong: boolean;
};

const imagesSub = (images: number, withoutQty: number) =>
  withoutQty > 0
    ? `${copy.tags.images(formatInteger(images))} · ${copy.tags.withoutQty(withoutQty)}`
    : copy.tags.images(formatInteger(images));

/** The tags in their fixed order: Việc của tôi · Đang làm · Chờ tôi QC (QC only) · Xong · Trễ. */
export const tagCards = (overview: Pick<MyOverview, "tags">): TagCard[] => {
  const { tags } = overview;
  return [
    {
      key: "mine",
      label: copy.tags.mine,
      count: tags.mine.count,
      sub: imagesSub(tags.mine.images, tags.mine.withoutQty),
      tone: "brand",
      strong: false
    },
    {
      key: "inProgress",
      label: copy.tags.inProgress,
      count: tags.inProgress.count,
      sub: imagesSub(tags.inProgress.images, tags.inProgress.withoutQty),
      tone: "warning",
      strong: false
    },
    ...(tags.qc
      ? [
          {
            key: "qc" as const,
            label: copy.tags.qc,
            count: tags.qc.count,
            sub:
              tags.qc.longestWaitMinutes > 0
                ? copy.tags.qcLongest(formatClockMinutes(tags.qc.longestWaitMinutes))
                : copy.tags.qcSub,
            tone: "info" as const,
            strong: false
          }
        ]
      : []),
    {
      key: "done",
      label: copy.tags.done,
      count: tags.done.count,
      sub: copy.tags.doneSub(formatInteger(tags.done.images)),
      tone: "success",
      strong: false
    },
    {
      key: "late",
      label: copy.tags.late,
      count: tags.late.count,
      sub: copy.tags.lateSub,
      tone: "danger",
      strong: tags.late.count > 0
    }
  ];
};

export type NeedItem = {
  key: "rework" | "late" | "dueSoon" | "qc";
  text: string;
  tone: "danger" | "warning" | "info";
  filter: MyOverviewFilter;
};

/** "Cần bạn xử lý": items with a count (0 hides one), each leading to its filter. */
export const needItems = (
  overview: Pick<MyOverview, "needs" | "statusCounts" | "clock">
): NeedItem[] => {
  const { needs } = overview;
  const reworkStatus =
    overview.statusCounts.inProgress.find((entry) => entry.status.code === "REWORK")?.status.id ??
    null;
  const items: NeedItem[] = [];
  if (needs.rework > 0) {
    items.push({
      key: "rework",
      text: copy.needs.rework(needs.rework),
      tone: "danger",
      filter: { tag: "inProgress", statusId: reworkStatus }
    });
  }
  if (needs.late > 0)
    items.push({
      key: "late",
      text: copy.needs.late(needs.late),
      tone: "danger",
      filter: { tag: "late", statusId: null }
    });
  if (needs.dueSoon > 0) {
    items.push({
      key: "dueSoon",
      text: copy.needs.dueSoon(needs.dueSoon),
      tone: "warning",
      filter: { tag: "inProgress", statusId: null }
    });
  }
  if (needs.qcWaiting !== null && needs.qcWaiting > 0) {
    const over = needs.qcOverAlert ?? 0;
    const overText =
      over === 0
        ? ""
        : overview.clock.qcAlertMinutes === 120
          ? ` (${copy.needs.qcOver(over)})`
          : ` (${copy.needs.qcOverHours(over, alertHoursText(overview.clock.qcAlertMinutes))})`;
    items.push({
      key: "qc",
      text: `${copy.needs.qc(needs.qcWaiting)}${overText}`,
      tone: "info",
      filter: { tag: "qc", statusId: null }
    });
  }
  return items;
};
