import type { ProductionRole } from "@/contracts/production-catalog";
import type { JobListScope } from "@/contracts/production-jobs";
import {
  defaultOverviewScope,
  hasOverviewScopeSwitch,
  overviewDaySpan,
  overviewJobOrder,
  overviewMaxDays,
  seesOverview,
  type OverviewJob,
  type OverviewJobPhase,
  type OverviewRange,
  type OverviewRisk,
  type OverviewStale,
  type OverviewTask,
  type OverviewTaskStage,
  type ProductionOverview
} from "@/contracts/production-overview";
import type { QueryValue } from "@/lib/api/client";

import { addDays, formatInteger, formatNumber, isDay } from "../format";
import { isoToZoned } from "../jobs-model";
import { rangePresets } from "../my-task-filters";

/**
 * PD-080 — "Tổng quan" (Overview V2) page state and figures, as pure helpers (unit tested). The API computes every
 * definition (contracts/production-overview.ts: time rules, stages, phases, cards, needs, clocks, At risk); this file only
 * keeps the page state in the URL, filters / groups the shown jobs for the table and words what is shown.
 *
 * URL: time `?from=&to=` (nothing = Hôm nay; Tuần này / Tháng này / Tùy chọn = their days, at most `overviewMaxDays`),
 * scope `?scope=mine|all` (holders of the switch; written on landing), filter `?card=` + `?sub=`.
 * Strings are Vietnamese and kept here or next to their component, easy to find for a later English switch.
 */

// Landing ------------------------------------------------------------------------------------------------------------------

/**
 * Where `/production` sends someone: the Overview for Leader / Account / Quản trị / Director, "Tổng quan của tôi"
 * (PD-081, the personal overview) for the rest.
 */
export const overviewLandingPath = (roles: readonly ProductionRole[]) =>
  seesOverview(roles) ? null : "/production/my-overview";

// Time ---------------------------------------------------------------------------------------------------------------------

export type OverviewTime = { kind: "today" } | { kind: "range"; from: string; to: string };
export type OverviewPresetKey = "today" | "week" | "month";

/** The presets of the page: Hôm nay · Tuần này (Mon–Sun) · Tháng này. */
export const overviewPresets = (today: string) =>
  rangePresets(today).filter((preset): preset is typeof preset & { key: OverviewPresetKey } =>
    preset.key === "today" || preset.key === "week" || preset.key === "month"
  );

/** From the URL: a reversed range is put in order; too long a range keeps its last `overviewMaxDays` days. */
export const overviewTimeFromSearch = (params: URLSearchParams): OverviewTime => {
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

/** The URL with this time (other parameters kept); "Hôm nay" is the bare URL. */
export const overviewTimeToSearch = (time: OverviewTime, params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  next.delete("from");
  next.delete("to");
  next.delete("period");
  if (time.kind === "range") {
    next.set("from", time.from);
    next.set("to", time.to);
  }
  return next;
};

export const overviewRangeOf = (time: OverviewTime, today: string): OverviewRange =>
  time.kind === "today" ? { from: today, to: today } : { from: time.from, to: time.to };

/** The preset the time is exactly, else null (= Tùy chọn). A range of exactly today is "Hôm nay". */
export const activeOverviewPreset = (time: OverviewTime, today: string): OverviewPresetKey | null => {
  if (time.kind === "today") return "today";
  return overviewPresets(today).find((preset) => preset.from === time.from && preset.to === time.to)?.key ?? null;
};

export const presetToTime = (preset: { key: OverviewPresetKey; from: string; to: string }): OverviewTime =>
  preset.key === "today" ? { kind: "today" } : { kind: "range", from: preset.from, to: preset.to };

/** The last `weeks` weeks (from a Monday to today): the default of the At risk history. */
export const lastWeeks = (today: string, weeks = 8) => {
  const [year, month, date] = today.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));
  return { from: addDays(monday, -(weeks - 1) * 7), to: today };
};

const dayMonth = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const dayMonthYear = (day: string, today: string) =>
  day.slice(0, 4) === today.slice(0, 4) ? dayMonth(day) : `${dayMonth(day)}/${day.slice(0, 4)}`;

/** "22/10", "19/10 – 25/10" (another year: with the year). */
export const formatRange = (range: OverviewRange, today: string) =>
  range.from === range.to
    ? dayMonthYear(range.from, today)
    : `${dayMonthYear(range.from, today)} – ${dayMonthYear(range.to, today)}`;

/** First part of the subtitle: what the range is and what it shows. */
export const timeDescription = (time: OverviewTime, today: string) => {
  const range = overviewRangeOf(time, today);
  switch (activeOverviewPreset(time, today)) {
    case "today":
      return `Hôm nay, ${dayMonth(today)} · đến hạn hôm nay + trễ từ trước`;
    case "week":
      return `Tuần này, ${formatRange(range, today)} · đến hạn trong tuần + trễ từ trước`;
    case "month":
      return `Tháng này, ${range.from.slice(5, 7)}/${range.from.slice(0, 4)} · đến hạn trong tháng + trễ từ trước`;
    default:
      return `${formatRange(range, today)} · đến hạn trong khoảng + trễ từ trước`;
  }
};

/** "Hôm nay, 22/10 · đến hạn hôm nay + trễ từ trước · 8 Job Code · 6 Project · cập nhật 14:05". */
export const overviewSubtitle = (time: OverviewTime, overview: Pick<ProductionOverview, "today" | "jobs" | "generatedAt" | "timeZone">) => {
  const projects = new Set(overview.jobs.map((job) => job.project.id)).size;
  return [
    timeDescription(time, overview.today),
    `${formatInteger(overview.jobs.length)} Job Code`,
    `${formatInteger(projects)} Project`,
    `cập nhật ${isoToZoned(overview.generatedAt, overview.timeZone).time}`
  ].join(" · ");
};

const weekdays = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** "Thứ Năm, 22/10/2026". */
export const longDayLabel = (day: string) => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return `${weekdays[new Date(Date.UTC(year, month - 1, date)).getUTCDay()]}, ${dayMonth(day)}/${day.slice(0, 4)}`;
};

// Scope --------------------------------------------------------------------------------------------------------------------

/**
 * The scope of the page: holders of the switch (LEADER / ADMIN) read `?scope=`, else an older `?leader=` link (my id →
 * mine, anything else → all), else their default (a Leader "mine", Quản trị / Director / Account "all"). Without the
 * switch it is always "all".
 */
export const overviewScopeOf = (params: URLSearchParams, roles: readonly ProductionRole[], myId: string): JobListScope => {
  if (!hasOverviewScopeSwitch(roles)) return "all";
  const scope = params.get("scope");
  if (scope === "mine" || scope === "all") return scope;
  const leader = params.get("leader");
  if (leader !== null) return leader === myId ? "mine" : "all";
  return defaultOverviewScope(roles);
};

/** Whether the URL still needs the landing scope written (switch holders without `?scope=`). */
export const needsScopeLanding = (params: URLSearchParams, roles: readonly ProductionRole[]) =>
  hasOverviewScopeSwitch(roles) && !params.has("scope");

export const overviewScopeToSearch = (scope: JobListScope, params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  next.delete("leader");
  next.set("scope", scope);
  return next;
};

/** GET /production/overview parameters (the scope always explicit). */
export const overviewQuery = (range: OverviewRange, scope: JobListScope): Record<string, QueryValue> => ({
  from: range.from,
  to: range.to,
  scope
});

// Filters ------------------------------------------------------------------------------------------------------------------

export const overviewCards = ["total", "unassigned", "inProgress", "done", "overdue"] as const;
export type OverviewCardKey = (typeof overviewCards)[number];
/** Card filters plus the Needs-you-only ones. */
export type OverviewFilterCard = OverviewCardKey | "risk" | "stale";
export type OverviewFilter = { card: OverviewFilterCard; sub: string | null };

const filterCards: readonly string[] = [...overviewCards, "risk", "stale"];
export const noFilter: OverviewFilter = { card: "total", sub: null };

export const overviewFilterFromSearch = (params: URLSearchParams): OverviewFilter => {
  const card = params.get("card");
  const sub = params.get("sub");
  return {
    card: card && filterCards.includes(card) ? (card as OverviewFilterCard) : "total",
    sub: sub && sub.length <= 40 ? sub : null
  };
};

export const overviewFilterToSearch = (filter: OverviewFilter, params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  next.delete("card");
  next.delete("sub");
  if (filter.card !== "total") next.set("card", filter.card);
  if (filter.sub) next.set("sub", filter.sub);
  return next;
};

export const isFiltered = (filter: OverviewFilter) => filter.card !== "total" || filter.sub !== null;
export const sameFilter = (a: OverviewFilter, b: OverviewFilter) => a.card === b.card && a.sub === b.sub;

/** Clicking a card: the card (its whole), or back to Tổng when it is already the selected one. */
export const toggleCard = (current: OverviewFilter, card: OverviewCardKey): OverviewFilter =>
  current.card === card && card !== "total" ? noFilter : { card, sub: null };

/** Clicking a Needs-you item: its filter, or back to Tổng when it is already applied. */
export const toggleFilter = (current: OverviewFilter, next: OverviewFilter): OverviewFilter =>
  sameFilter(current, next) ? noFilter : next;

/** Lines are listed under each job: Đang làm, Xong, and Trễ unless only "Trễ khách" is asked. */
export const isTaskMode = (filter: OverviewFilter) =>
  filter.card === "inProgress" || filter.card === "done" || (filter.card === "overdue" && filter.sub !== "client");

export const QC_ALERT = "qcAlert";
export const NEW_NOT_SPLIT = "newNotSplit";

const taskMatches = (task: OverviewTask, filter: OverviewFilter) => {
  switch (filter.card) {
    case "inProgress":
      if (task.group !== "IN_PROGRESS") return false;
      if (filter.sub === QC_ALERT) return Boolean(task.qcWait?.alert);
      return filter.sub === null || task.stage === filter.sub;
    case "done":
      return task.group === "DONE" && (filter.sub === null || task.stage === filter.sub);
    case "overdue":
      return task.overdue;
    default:
      return false;
  }
};

export type FilteredJob = { job: OverviewJob; tasks: OverviewTask[] };

/** The jobs (and, in task mode, their matching lines) a filter keeps. */
export const filterJobs = (jobs: readonly OverviewJob[], filter: OverviewFilter): FilteredJob[] => {
  const result: FilteredJob[] = [];
  for (const job of jobs) {
    switch (filter.card) {
      case "total":
        if (filter.sub === null || job.phase === filter.sub) result.push({ job, tasks: [] });
        break;
      case "unassigned":
        if (job.noTasks && (filter.sub !== NEW_NOT_SPLIT || job.newNotSplit)) result.push({ job, tasks: [] });
        break;
      case "risk":
        if (job.risk) result.push({ job, tasks: [] });
        break;
      case "stale":
        if (job.stale) result.push({ job, tasks: [] });
        break;
      case "overdue": {
        const tasks = job.tasks.filter((task) => task.overdue);
        if (filter.sub === "client" ? job.clientLate : filter.sub === "task" ? tasks.length > 0 : tasks.length > 0 || job.clientLate) {
          result.push({ job, tasks: filter.sub === "client" ? [] : tasks });
        }
        break;
      }
      default: {
        const tasks = job.tasks.filter((task) => taskMatches(task, filter));
        if (tasks.length > 0) result.push({ job, tasks });
      }
    }
  }
  return result;
};

// Dropdown -----------------------------------------------------------------------------------------------------------------

export type SubOption = { key: string; label: string; count: number };
export type SubMenu = { title: string; all: number; options: SubOption[] };

export const phaseLabels: Record<OverviewJobPhase, string> = {
  NEW: "Mới",
  IN_PROGRESS: "Đang làm",
  FEEDBACK: "Feedback",
  READY: "Sẵn sàng Complete",
  COMPLETE: "Complete",
  DELIVERING: "Đang giao client",
  DELIVERED: "Đã giao khách"
};

const stageName = (overview: Pick<ProductionOverview, "stageNames">, stage: OverviewTaskStage) =>
  overview.stageNames.find((item) => item.stage === stage)?.name ?? stage;

/** Hours of the alert threshold: "2h", "1,5h". */
export const hoursLabel = (hours: number) => `${formatNumber(hours, 2)}h`;

/** The status dropdown of a selected card, with counts over the shown jobs (null: no dropdown). */
export const subMenuOf = (overview: Pick<ProductionOverview, "jobs" | "stageNames" | "clock">, card: OverviewFilterCard): SubMenu | null => {
  const jobs = overview.jobs;
  const tasks = jobs.flatMap((job) => job.tasks);
  const countTasks = (predicate: (task: OverviewTask) => boolean) => tasks.filter(predicate).length;
  switch (card) {
    case "total": {
      const phases: OverviewJobPhase[] = ["NEW", "IN_PROGRESS", "FEEDBACK", "READY", "COMPLETE", "DELIVERING", "DELIVERED"];
      return {
        title: "Trạng thái job",
        all: jobs.length,
        options: phases
          .map((phase) => ({ key: phase, label: phaseLabels[phase], count: jobs.filter((job) => job.phase === phase).length }))
          .filter((option) => option.count > 0 || !(option.key === "DELIVERING" || option.key === "DELIVERED"))
      };
    }
    case "inProgress": {
      const stages: OverviewTaskStage[] = ["ASSIGNED", "PROCESSING", "REWORK", "WAITING_QC", "QC_CHECKING", "FEEDBACK"];
      const alerting = countTasks((task) => task.group === "IN_PROGRESS" && Boolean(task.qcWait?.alert));
      return {
        title: "Trạng thái task",
        all: countTasks((task) => task.group === "IN_PROGRESS"),
        options: [
          ...stages.map((stage) => ({ key: stage, label: stageName(overview, stage), count: countTasks((task) => task.stage === stage) })),
          ...(alerting > 0 ? [{ key: QC_ALERT, label: `${stageName(overview, "WAITING_QC")} quá ${hoursLabel(overview.clock.alertHours)}`, count: alerting }] : [])
        ]
      };
    }
    case "done":
      return {
        title: "Trạng thái task",
        all: countTasks((task) => task.group === "DONE"),
        options: (["CHECKED", "COMPLETE"] as const).map((stage) => ({
          key: stage,
          label: stageName(overview, stage),
          count: countTasks((task) => task.stage === stage)
        }))
      };
    case "overdue": {
      const late = countTasks((task) => task.overdue);
      const client = jobs.filter((job) => job.clientLate).length;
      return {
        title: "Loại",
        all: late + client,
        options: [
          { key: "task", label: "Task trễ", count: late },
          { key: "client", label: "Trễ khách", count: client }
        ]
      };
    }
    default:
      return null;
  }
};

// Needs you ----------------------------------------------------------------------------------------------------------------

export type NeedTone = "risk" | "neutral" | "qc" | "feedback" | "done" | "idle" | "late";
export type NeedItem = { key: string; count: number; label: string; tone: NeedTone; filter: OverviewFilter };

/**
 * "Cần bạn xử lý": the Leader's items (Leader / Quản trị / Director) then the Account's, zero items hidden, At risk once.
 */
export const needItemsOf = (overview: Pick<ProductionOverview, "leaderNeeds" | "accountNeeds" | "clock">): NeedItem[] => {
  const hours = hoursLabel(overview.clock.alertHours);
  const items: NeedItem[] = [];
  const leader = overview.leaderNeeds;
  const account = overview.accountNeeds;
  if (leader) {
    items.push(
      { key: "atRisk", count: leader.atRisk, label: "job At risk", tone: "risk", filter: { card: "risk", sub: null } },
      { key: "unassigned", count: leader.unassignedJobs, label: "Job Code chưa chia task", tone: "neutral", filter: { card: "unassigned", sub: null } },
      { key: "qcWait", count: leader.qcWaitImages, label: `tấm chờ QC quá ${hours}`, tone: "qc", filter: { card: "inProgress", sub: QC_ALERT } },
      { key: "feedback", count: leader.feedbackJobs, label: "job Feedback của khách", tone: "feedback", filter: { card: "total", sub: "FEEDBACK" } },
      { key: "ready", count: leader.readyJobs, label: "job sẵn sàng Complete", tone: "done", filter: { card: "total", sub: "READY" } },
      { key: "stale", count: leader.staleJobs, label: `job không cập nhật ${hours}+`, tone: "idle", filter: { card: "stale", sub: null } }
    );
  }
  if (account) {
    items.push(
      { key: "readyToDeliver", count: account.readyToDeliver, label: "job sẵn sàng giao", tone: "done", filter: { card: "total", sub: "COMPLETE" } },
      ...(leader ? [] : [{ key: "atRisk", count: account.atRisk, label: "job At risk", tone: "risk" as const, filter: { card: "risk" as const, sub: null } }]),
      { key: "clientLate", count: account.clientLate, label: "job trễ khách", tone: "late", filter: { card: "overdue", sub: "client" } },
      { key: "newNotSplit", count: account.newNotSplit, label: `job mới chưa chia ${hours}+`, tone: "neutral", filter: { card: "unassigned", sub: NEW_NOT_SPLIT } }
    );
  }
  return items.filter((item) => item.count > 0);
};

// Table --------------------------------------------------------------------------------------------------------------------

export type Bar = { done: number; inProgress: number; unassigned: number; total: number };
export type ProjectGroup = {
  project: OverviewJob["project"];
  /** The filtered jobs of the project (most urgent first). */
  rows: FilteredJob[];
  /** Every shown job of the project, whatever the filter (the project row's figures). */
  jobs: OverviewJob[];
  openJobs: number;
  bar: Bar;
  nextDeadline: string | null;
  clientLateJobs: number;
  noTaskJobs: OverviewJob[];
};

const sumBars = (jobs: readonly OverviewJob[]): Bar =>
  jobs.reduce(
    (bar, job) => ({
      done: bar.done + job.images.done,
      inProgress: bar.inProgress + job.images.inProgress,
      unassigned: bar.unassigned + job.images.unassigned,
      total: bar.total + job.images.total
    }),
    { done: 0, inProgress: 0, unassigned: 0, total: 0 }
  );

const delivered = (job: Pick<OverviewJob, "phase">) => job.phase === "DELIVERING" || job.phase === "DELIVERED";

/**
 * Most urgent first (`overviewJobOrder`: client-late, then the soonest client deadline) — PD-082: a job already handed to
 * the client (Đang giao client / Đã giao khách) is not urgent, it goes after the open ones (its old deadline used to put
 * it on top of its project).
 */
const urgentFirst = (a: OverviewJob, b: OverviewJob) => Number(delivered(a)) - Number(delivered(b)) || overviewJobOrder(a, b);

/** Groups by project: the project with the most urgent job first; inside, client-late first then the soonest deadline. */
export const groupByProject = (rows: readonly FilteredJob[], allJobs: readonly OverviewJob[]): ProjectGroup[] => {
  const groups = new Map<string, FilteredJob[]>();
  for (const row of rows) {
    const list = groups.get(row.job.project.id) ?? [];
    list.push(row);
    groups.set(row.job.project.id, list);
  }
  return [...groups.values()]
    .map((list) => {
      const sorted = list.slice().sort((a, b) => urgentFirst(a.job, b.job));
      const project = sorted[0]!.job.project;
      const jobs = allJobs.filter((job) => job.project.id === project.id).sort(urgentFirst);
      const open = jobs.filter((job) => !delivered(job));
      return {
        project,
        rows: sorted,
        jobs,
        openJobs: open.length,
        bar: sumBars(jobs),
        nextDeadline: (open[0] ?? jobs[0])?.deadline ?? null,
        clientLateJobs: jobs.filter((job) => job.clientLate).length,
        noTaskJobs: jobs.filter((job) => job.noTasks)
      };
    })
    .sort((a, b) => urgentFirst(a.rows[0]!.job, b.rows[0]!.job));
};

export type BarFocus = keyof Omit<Bar, "total"> | null;

/** Which part of the bar a filter is about (the others are dimmed). */
export const barFocus = (filter: OverviewFilter): BarFocus =>
  filter.card === "inProgress" ? "inProgress" : filter.card === "done" ? "done" : filter.card === "unassigned" ? "unassigned" : null;

/** "done / total" — or the focused part over the total. */
export const barRatio = (bar: Bar, focus: keyof Omit<Bar, "total"> | null) =>
  `${formatInteger(focus ? bar[focus] : bar.done)} / ${formatInteger(bar.total)}`;

/** "xong 20 · đang làm 9 · chưa chia 10". */
export const barDetail = (bar: Bar) =>
  [
    bar.done > 0 ? `xong ${formatInteger(bar.done)}` : null,
    bar.inProgress > 0 ? `đang làm ${formatInteger(bar.inProgress)}` : null,
    bar.unassigned > 0 ? `chưa chia ${formatInteger(bar.unassigned)}` : null
  ]
    .filter(Boolean)
    .join(" · ");

// Words --------------------------------------------------------------------------------------------------------------------

/** "45m", "3h 55m", "1 ngày 3h", "10 ngày". */
export const durationLabel = (minutes: number) => {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours < 24) return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const leftHours = hours % 24;
  return days >= 7 || leftHours === 0 ? `${days} ngày` : `${days} ngày ${leftHours}h`;
};

export type Tone = "danger" | "warning" | "muted";

/** Time to the client deadline: "còn 3h 55m" (orange within 24 h) or "trễ 14h" (red). */
export const timeLeft = (deadline: string, now: Date): { label: string; tone: Tone } => {
  const minutes = (Date.parse(deadline) - now.getTime()) / 60_000;
  if (minutes < 0) return { label: `trễ ${durationLabel(-minutes)}`, tone: "danger" };
  return { label: `còn ${durationLabel(minutes)}`, tone: minutes <= 24 * 60 ? "warning" : "muted" };
};

/** "22/10 14:00" in the organization timezone. */
export const dateTimeLabel = (iso: string, timeZone: string) => {
  const zoned = isoToZoned(iso, timeZone);
  return `${dayMonth(zoned.day)} ${zoned.time}`;
};

/** "vừa xong", "25 phút trước", "3 giờ trước", "2 ngày trước". */
export const agoLabel = (iso: string, now: Date) => {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
};

/** "Cập nhật vừa xong", "Cập nhật 25 phút trước", "Cập nhật 3 giờ trước", "Cập nhật 2 ngày trước". */
export const updatedAgo = (iso: string, now: Date) => `Cập nhật ${agoLabel(iso, now)}`;

/** The second line of a job: "Leader Tên · nhận 21/10 · cập nhật 3 giờ trước" (PD-082). */
export const jobMetaLine = (
  job: Pick<OverviewJob, "leader" | "receivedAt" | "lastActivityAt">,
  now: Date,
  timeZone: string
) =>
  [
    job.leader ? `Leader ${job.leader.displayName}` : "Chưa có Leader",
    `nhận ${dateTimeLabel(job.receivedAt, timeZone).slice(0, 5)}`,
    `cập nhật ${agoLabel(job.lastActivityAt, now)}`
  ].join(" · ");

/**
 * How a deadline reads next to its date (PD-082): one wording everywhere — "Trễ 5 ngày 13h" (danger), "Còn 8h 9m"
 * (warning within 24 h, else muted). A job already handed to the client (Đang giao client / Đã giao khách) is never late:
 * "Đã giao" / "Đang giao", neutral. A task: "Đã xong" once Done, "Chờ QC 2h 30m" while waiting for its QC.
 */
export type DeadlineKind = "late" | "soon" | "later" | "delivered" | "delivering" | "done" | "qc";
export type DeadlineState = { kind: DeadlineKind; label: string; tone: Tone | "done"; title: string };

const countdown = (deadline: string, now: Date, late: boolean, what: string): DeadlineState => {
  const minutes = (Date.parse(deadline) - now.getTime()) / 60_000;
  if (late || minutes < 0) {
    const overBy = minutes < 0 ? durationLabel(-minutes) : null;
    return {
      kind: "late",
      label: overBy ? `Trễ ${overBy}` : "Trễ",
      tone: "danger",
      title: overBy ? `Trễ ${what} ${overBy}` : `Trễ ${what}`
    };
  }
  const left = durationLabel(minutes);
  return minutes <= 24 * 60
    ? { kind: "soon", label: `Còn ${left}`, tone: "warning", title: `Còn ${left} đến ${what}` }
    : { kind: "later", label: `Còn ${left}`, tone: "muted", title: `Còn ${left} đến ${what}` };
};

export const jobDeadline = (job: Pick<OverviewJob, "deadline" | "clientLate" | "phase">, now: Date): DeadlineState => {
  if (job.phase === "DELIVERED") return { kind: "delivered", label: "Đã giao", tone: "done", title: "Đã giao khách" };
  if (job.phase === "DELIVERING") return { kind: "delivering", label: "Đang giao", tone: "done", title: "Đang giao client" };
  return countdown(job.deadline, now, job.clientLate, "deadline khách");
};

export const taskDeadline = (
  task: Pick<OverviewTask, "deadline" | "overdue" | "group" | "qcWait">,
  now: Date
): DeadlineState => {
  if (task.group === "DONE") return { kind: "done", label: "Đã xong", tone: "done", title: "Task đã xong · ngày là deadline task" };
  if (task.qcWait) {
    const wait = durationLabel(task.qcWait.minutes);
    return {
      kind: "qc",
      label: `Chờ QC ${wait}`,
      tone: task.overdue ? "danger" : task.qcWait.alert ? "warning" : "muted",
      title: `Chờ QC ${wait} (tính trong giờ lõi)`
    };
  }
  return countdown(task.deadline, now, task.overdue, "deadline task");
};

/** The orange "Không cập nhật" line (null when the job is fine). */
export const staleLabel = (stale: OverviewStale | null, alertHours: number) =>
  !stale ? null : stale.reason === "STAFF_ON_LEAVE" ? "Nhân viên đang nghỉ" : `Không cập nhật ${hoursLabel(alertHours)}+`;

/** The At risk chip: "At risk · cần ~12h, còn 7h (2 người)" / "At risk · chưa ai được giao". */
export const riskLabel = (risk: Pick<OverviewRisk, "reason" | "workHours" | "capacityHours" | "people">) =>
  risk.reason === "UNASSIGNED"
    ? "At risk · chưa ai được giao"
    : `At risk · cần ~${formatNumber(risk.workHours, 1)}h, còn ${formatNumber(risk.capacityHours, 1)}h (${formatInteger(risk.people)} người)`;

export type StuckChip = { key: string; label: string; tone: "qc" | "late" | "neutral" | "feedback" | "done" | "danger" };

const workImages = (tasks: readonly OverviewTask[]) => tasks.reduce((sum, task) => sum + (task.process.isQc ? 0 : (task.images ?? 0)), 0);

/** "Đang kẹt ở đâu" of a job (over its shown lines). */
export const stuckChips = (job: OverviewJob, alertHours: number): StuckChip[] => {
  const chips: StuckChip[] = [];
  const atQc = job.tasks.filter((task) => task.stage === "WAITING_QC" || task.stage === "QC_CHECKING");
  if (atQc.length > 0) {
    const longest = Math.max(0, ...atQc.filter((task) => task.qcWait?.alert && !task.qcOnLeave).map((task) => task.qcWait!.minutes));
    const images = workImages(atQc);
    chips.push({
      key: "qc",
      label: `${images > 0 ? `${formatInteger(images)} tấm` : `${atQc.length} task`} ở QC${longest >= alertHours * 60 ? ` · chờ ${durationLabel(longest)}` : ""}`,
      tone: "qc"
    });
  }
  if (job.tasks.some((task) => task.stage === "WAITING_QC" && task.qcOnLeave)) {
    chips.push({ key: "qcLeave", label: "QC đang nghỉ — đổi QC", tone: "danger" });
  }
  const rework = job.tasks.filter((task) => task.stage === "REWORK");
  if (rework.length > 0) {
    const images = workImages(rework);
    chips.push({ key: "rework", label: images > 0 ? `${formatInteger(images)} tấm cần sửa lại` : `${rework.length} task cần sửa lại`, tone: "late" });
  }
  const late = job.tasks.filter((task) => task.overdue).length;
  if (late > 0) chips.push({ key: "late", label: `${late} task trễ`, tone: "late" });
  if (job.noTasks) {
    chips.push({ key: "noTasks", label: job.totalImages > 0 ? `Chưa chia · ${formatInteger(job.totalImages)} tấm` : "Chưa chia task", tone: "neutral" });
  } else if (job.images.unassigned > 0) {
    chips.push({ key: "unassigned", label: `${formatInteger(job.images.unassigned)} tấm chưa chia`, tone: "neutral" });
  }
  if (job.phase === "FEEDBACK") chips.push({ key: "feedback", label: "Feedback của khách", tone: "feedback" });
  if (job.phase === "READY") chips.push({ key: "ready", label: "Đã check đủ, chờ Complete", tone: "done" });
  if (job.phase === "COMPLETE") chips.push({ key: "complete", label: "Complete · chờ Account giao", tone: "done" });
  return chips;
};

/**
 * PD-082 — one colour scale for every flag of the table: At risk (orange), danger (late, rework, QC on leave), warning
 * (không cập nhật / nhân viên nghỉ), info (QC), feedback, muted (chưa chia), success (ready / complete).
 */
export type FlagTone = "risk" | "danger" | "warning" | "info" | "feedback" | "muted" | "success";
export type JobFlag = { key: string; label: string; tone: FlagTone; detail?: string };

const flagToneOf: Record<StuckChip["tone"], FlagTone> = {
  qc: "info",
  late: "danger",
  danger: "danger",
  neutral: "muted",
  feedback: "feedback",
  done: "success"
};
const flagOrder: Record<FlagTone, number> = { risk: 0, danger: 1, warning: 2, info: 3, feedback: 4, muted: 5, success: 6 };

/** Most severe first (a stable sort: equal tones keep their order). */
export const sortFlags = <T extends { tone: FlagTone }>(flags: readonly T[]) =>
  flags.slice().sort((a, b) => flagOrder[a.tone] - flagOrder[b.tone]);

/** The flags of a job row: At risk, "Không cập nhật" / "Nhân viên đang nghỉ", then "Đang kẹt ở đâu" — most severe first. */
export const jobFlags = (job: OverviewJob, alertHours: number): JobFlag[] => {
  const flags: JobFlag[] = [];
  if (job.risk) flags.push({ key: "risk", label: "At risk", tone: "risk", detail: riskLabel(job.risk) });
  const stale = staleLabel(job.stale, alertHours);
  if (stale) flags.push({ key: job.stale?.reason === "STAFF_ON_LEAVE" ? "staffLeave" : "stale", label: stale, tone: "warning" });
  for (const chip of stuckChips(job, alertHours)) flags.push({ key: chip.key, label: chip.label, tone: flagToneOf[chip.tone] });
  return sortFlags(flags);
};

/** The flags of a project band: "2 job trễ khách", "1 Job Code chưa chia". */
export const projectFlags = (group: Pick<ProjectGroup, "clientLateJobs" | "noTaskJobs">): JobFlag[] => [
  ...(group.clientLateJobs > 0 ? [{ key: "clientLate", label: `${formatInteger(group.clientLateJobs)} job trễ khách`, tone: "danger" as const }] : []),
  ...(group.noTaskJobs.length > 0
    ? [{ key: "noTasks", label: `${formatInteger(group.noTaskJobs.length)} Job Code chưa chia`, tone: "muted" as const }]
    : [])
];

/** Task-mode chip of a job: "3 task · 45 tấm". */
export const matchedLabel = (tasks: readonly OverviewTask[]) => {
  const images = workImages(tasks);
  return `${tasks.length} task${images > 0 ? ` · ${formatInteger(images)} tấm` : ""}`;
};

/** A Job Code of the Chia task picker: "AXP-01 — 120 tấm · hạn 22/10 17:00". */
export const assignJobLabel = (job: Pick<OverviewJob, "code" | "totalImages" | "deadline">, timeZone: string) =>
  `${job.code} — ${job.totalImages > 0 ? `${formatInteger(job.totalImages)} tấm` : "chưa có Tổng tấm"} · hạn ${dateTimeLabel(job.deadline, timeZone)}`;

/** Titles of the table per filter. */
export const tableTitles = (filter: OverviewFilter, alertHours: number) => {
  const hours = hoursLabel(alertHours);
  switch (filter.card) {
    case "unassigned":
      return filter.sub === NEW_NOT_SPLIT
        ? { title: "Job mới chưa chia", description: `Job Code Account tạo, chưa có task sau ${hours} giờ lõi — dùng “Chia task”.` }
        : { title: "Job Code chưa chia task", description: "Job Code chưa có task nào — dùng “Chia task” trên dòng Project." };
    case "inProgress":
      return { title: "Task đang làm", description: "Chỉ liệt kê task đang làm dưới mỗi job · các màu khác được làm mờ." };
    case "done":
      return { title: "Task đã xong", description: "Chỉ liệt kê task đã xong dưới mỗi job · các màu khác được làm mờ." };
    case "overdue":
      return { title: "Trễ", description: "Task quá hạn (chưa Done) và job quá deadline khách chưa giao." };
    case "risk":
      return { title: "Job At risk", description: "Ước tính: việc còn lại nhiều hơn năng lực trước deadline khách, hoặc chưa ai được giao." };
    case "stale":
      return { title: "Job không cập nhật", description: `Không có thao tác nào ${hours}+ giờ lõi, hoặc nhân viên đang nghỉ — hỏi lại nhân viên.` };
    default:
      return { title: "Job đang theo dõi", description: "Nhóm theo Project · job gấp nhất lên đầu (trễ khách trước, rồi deadline khách gần nhất)." };
  }
};

/** Percent of a part over a total, 0–100 (0 without a total). */
export const percentOf = (value: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;
