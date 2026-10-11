import type {
  CreditRule,
  CustomField,
  PayMode,
  ProductionRole,
  ProductionStatus
} from "@/contracts/production-catalog";
import type {
  JobSummary,
  ProductionTask,
  TaskLog,
  TaskTransitionOption
} from "@/contracts/production-jobs";

import type { QueryValue } from "@/lib/api/client";

import { formatCustomValue, type CustomValue } from "./custom-fields";
import { formatNumber } from "./format";
import {
  activeListFilterCount,
  emptyListFilters,
  listFiltersFromSearch,
  listFiltersToQuery,
  listFiltersToSearch,
  type ListFilters
} from "./list-filters";

/**
 * Pure helpers for production jobs and tasks (SPEC Phase 2, PD-014). The API decides what is allowed
 * (task.capabilities / job.capabilities); these only shape data for display and give instant form
 * feedback. Unit tested in jobs-model.test.ts.
 */

// Time in the organization timezone ------------------------------------------------------------------

const partsIn = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second")
  };
};

/** Offset (minutes east of UTC) of `timeZone` at `date`. */
const offsetMinutes = (date: Date, timeZone: string) => {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
};

/** "2026-10-09" + "17:30" in `timeZone` → ISO instant (UTC). Null when the inputs are malformed. */
export const zonedToIso = (day: string, time: string, timeZone: string) => {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dayMatch || !timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return null;
  const guess = Date.UTC(
    Number(dayMatch[1]),
    Number(dayMatch[2]) - 1,
    Number(dayMatch[3]),
    hour,
    minute
  );
  // Two passes settle DST transitions in zones that have them.
  let instant = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  instant = guess - offsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant).toISOString();
};

/** ISO instant → { day: "YYYY-MM-DD", time: "HH:mm" } in `timeZone`. */
export const isoToZoned = (iso: string, timeZone: string) => {
  const p = partsIn(new Date(iso), timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    day: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`
  };
};

/**
 * "17:30 · 09/10" (short) or "17:30, 09/10/2026" (long) in the organization timezone. The short
 * form adds the year when it is not the current one ("17:30 · 09/10/2025", BUG-PR-26).
 */
export const formatDateTime = (
  iso: string | null | undefined,
  timeZone: string,
  long = false,
  now: Date = new Date()
) => {
  if (!iso) return "—";
  const p = partsIn(new Date(iso), timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(p.hour)}:${pad(p.minute)}`;
  if (long) return `${time}, ${pad(p.day)}/${pad(p.month)}/${p.year}`;
  const year = p.year === partsIn(now, timeZone).year ? "" : `/${p.year}`;
  return `${time} · ${pad(p.day)}/${pad(p.month)}${year}`;
};

/** Relative wording for deadlines: "còn 3 giờ", "trễ 2 ngày". */
export const relativeDeadline = (iso: string, now: Date = new Date()) => {
  const diff = new Date(iso).getTime() - now.getTime();
  const late = diff < 0;
  const minutes = Math.round(Math.abs(diff) / 60_000);
  const label =
    minutes < 60
      ? `${Math.max(1, minutes)} phút`
      : minutes < 48 * 60
        ? `${Math.round(minutes / 60)} giờ`
        : `${Math.round(minutes / (24 * 60))} ngày`;
  return { late, label: late ? `trễ ${label}` : `còn ${label}` };
};

type FinishMeta = Pick<ProductionStatus, "id" | "code" | "sortOrder" | "isTerminal">;

/**
 * Statuses past production (BE finishedStatusIds): Complete and every later status, or terminal.
 * Without the workflow the default codes are used.
 */
export const isFinishedStatus = (
  status: Pick<ProductionStatus, "id" | "code"> | null,
  statuses: readonly FinishMeta[]
) => {
  if (!status) return false;
  const complete = statuses.find((item) => item.code === "COMPLETE");
  const current = statuses.find((item) => item.id === status.id);
  if (!complete || !current) return ["COMPLETE", "DELIVERING", "DELIVERED"].includes(status.code);
  return current.isTerminal || current.sortOrder >= complete.sortOrder;
};

/**
 * The job deadline's countdown ("còn 3 giờ", "trễ 2 ngày"), or null once the job is complete or
 * delivered with no client feedback open — a countdown means nothing then (BUG-PR-26).
 */
export const jobDeadlineCountdown = (
  job: Pick<JobSummary, "deadline" | "status" | "openFeedbackCount">,
  statuses: readonly FinishMeta[],
  now: Date = new Date()
) =>
  job.openFeedbackCount === 0 && isFinishedStatus(job.status, statuses)
    ? null
    : relativeDeadline(job.deadline, now);

/** SPEC Phase 2 §2: a task's default deadline is the job deadline minus the project's QC buffer. */
export const defaultTaskDeadline = (jobDeadline: string, qcBufferHours: number) =>
  new Date(new Date(jobDeadline).getTime() - Math.max(0, qcBufferHours) * 3_600_000).toISOString();

// Progress & allocation -----------------------------------------------------------------------------------

const percent = (value: number, total: number) =>
  total <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / total) * 100)));

/** Progress of a job against its total images (assigned may exceed 100% when over-allocated). */
export const jobProgress = (
  job: Pick<JobSummary, "totalImages" | "qtyAssigned" | "qtyDone" | "qtyChecked">
) => ({
  assigned: percent(job.qtyAssigned, job.totalImages),
  done: percent(job.qtyDone, job.totalImages),
  checked: percent(job.qtyChecked, job.totalImages),
  overAllocated: job.qtyAssigned > job.totalImages
});

/** Live totals of the "Chia task" form: what is already assigned plus the new lines. */
export const allocation = (
  totalImages: number,
  alreadyAssigned: number,
  quantities: readonly number[]
) => {
  const adding = quantities.reduce(
    (sum, qty) => sum + (Number.isFinite(qty) && qty > 0 ? qty : 0),
    0
  );
  const total = alreadyAssigned + adding;
  return { adding, total, remaining: totalImages - total, over: total > totalImages };
};

/** Images already given out in normal (non-feedback) tasks — what over-allocation is measured against. */
export const assignedNormalQty = (tasks: readonly Pick<ProductionTask, "kind" | "qtyAssigned">[]) =>
  tasks.reduce((sum, task) => sum + (task.kind === "NORMAL" ? task.qtyAssigned : 0), 0);

/**
 * Expected credit/money of a task line from the credit rule effective today (PLAN §5: money only for
 * "Khoán" shifts and only when the process has a price; the matrix hides money from people who may
 * not see it).
 */
export const expectedEarnings = (
  rule: Pick<CreditRule, "creditPerImage" | "moneyPerImage"> | null,
  qty: number,
  payMode: PayMode | null
) => {
  if (!rule || !Number.isFinite(qty) || qty <= 0) return { credit: null, money: null };
  const credit = Math.round(rule.creditPerImage * qty * 100) / 100;
  const money =
    payMode === "MONEY_IF_KPI" && rule.moneyPerImage !== null ? rule.moneyPerImage * qty : null;
  return { credit, money };
};

/**
 * "Điểm của tôi" on a task (PLAN §7): the caller's ledger rows (adjustments included) summed. `khoan`
 * when every row is a Khoán (MONEY_IF_KPI) row — they count as Khoán points, not official points.
 * `detail` names each role ("Người làm 12,5 điểm · 10 tấm"). Null when nothing was recorded for the
 * caller yet.
 */
export const myCreditSummary = (task: Pick<ProductionTask, "myCredits">) => {
  if (task.myCredits.length === 0) return null;
  const credits = Math.round(task.myCredits.reduce((sum, row) => sum + row.credits, 0) * 100) / 100;
  const khoan = task.myCredits.every((row) => row.payMode === "MONEY_IF_KPI");
  const roleLabel = { WORKER: "Người làm", QC: "QC" } as const;
  const detail = task.myCredits
    .map(
      (row) =>
        `${roleLabel[row.role]} ${formatNumber(row.credits, 2)} điểm${row.payMode === "MONEY_IF_KPI" ? " Khoán" : ""} · ${formatNumber(row.qty, 0)} tấm`
    )
    .join("; ");
  return { credits, khoan, detail };
};

// Task lines (mirrors the API's checks for instant feedback) ----------------------------------------------

export type TaskLineDraft = {
  assigneeId: string | null;
  qcId: string | null;
  processId: string | null;
  shiftId: string | null;
  qty: string;
};

export type LineContext = {
  callerId: string;
  roles: ReadonlyMap<string, readonly ProductionRole[]>;
  qcProcessIds: ReadonlySet<string>;
};

/** Problems of one "Chia task" line, keyed by field (empty object = valid). */
export const taskLineProblems = (line: TaskLineDraft, context: LineContext) => {
  const problems: Partial<Record<"assignee" | "qc" | "process" | "shift" | "qty", string>> = {};
  if (!line.assigneeId) {
    problems.assignee = "Chọn người làm.";
  } else {
    const roles = context.roles.get(line.assigneeId) ?? [];
    if (!roles.includes("STAFF") && !roles.includes("LEADER"))
      problems.assignee = "Cần vai trò Nhân viên hoặc Leader.";
  }
  if (line.qcId) {
    if (!(context.roles.get(line.qcId) ?? []).includes("QC"))
      problems.qc = "Người QC cần vai trò QC.";
    else if (line.qcId === line.assigneeId) problems.qc = "QC phải khác người làm.";
  } else if (line.assigneeId && line.assigneeId === context.callerId) {
    problems.qc = "Tự giao cho mình thì cần QC là người khác.";
  }
  if (!line.processId) problems.process = "Chọn quy trình.";
  else if (context.qcProcessIds.has(line.processId))
    problems.process = "Quy trình QC không giao như task.";
  if (!line.shiftId) problems.shift = "Chọn ca.";
  const qty = Number(line.qty);
  if (!/^\d+$/.test(line.qty.trim()) || qty < 1 || qty > 1_000_000)
    problems.qty = "Số tấm nguyên ≥ 1.";
  return problems;
};

// Transitions ---------------------------------------------------------------------------------------------

/** The moves the API offers, split into the normal flow and ADMIN overrides (reason required). */
export const splitTransitions = (options: readonly TaskTransitionOption[]) => ({
  normal: options.filter((option) => !option.override),
  overrides: options.filter((option) => option.override)
});

/**
 * SEC2-03 (BE workflow.ts maxDeclaredDoneQty): the first Done declares at most
 * max(2 × assigned, assigned + 10) images; above that the API answers 400 QTY_DONE_TOO_HIGH.
 */
export const maxDeclaredDoneQty = (qtyAssigned: number) =>
  Math.max(qtyAssigned * 2, qtyAssigned + 10);

/** True when a move needs the transition dialog (note, Done quantity, OT hours or override reason). */
/**
 * What a move must ask for. The API flags every move into a done status with asksQty/asksOtHours,
 * but both lock at the first Done (a re-Done after QC fail sending another qty answers QTY_LOCKED;
 * the Leader corrects it instead), so they are only asked while the task has never been done.
 */
export const transitionAsks = (
  task: Pick<ProductionTask, "doneAt">,
  option: TaskTransitionOption
) => {
  const firstDone = task.doneAt === null;
  return {
    qty: option.asksQty && firstDone,
    otHours: option.asksOtHours && firstDone,
    note: option.requiresNote || option.override
  };
};

export const needsInput = (task: Pick<ProductionTask, "doneAt">, option: TaskTransitionOption) => {
  const asks = transitionAsks(task, option);
  return asks.qty || asks.otHours || asks.note;
};

type StatusMeta = Pick<ProductionStatus, "id" | "sortOrder" | "countsChecked">;

/**
 * QC queue buttons: "Pass" is the move into a checked status; "Fail" a backward move that needs a
 * note (PLAN §4). Both come from the task's own capabilities — never invented here.
 */
export const qcActions = (
  task: Pick<ProductionTask, "status" | "capabilities">,
  statuses: readonly StatusMeta[]
) => {
  const byId = new Map(statuses.map((status) => [status.id, status]));
  const current = byId.get(task.status.id);
  const normal = task.capabilities.transitions.filter((option) => !option.override);
  const pass = normal.find((option) => byId.get(option.toStatusId)?.countsChecked) ?? null;
  const fail =
    normal.find((option) => {
      const target = byId.get(option.toStatusId);
      return (
        option.requiresNote &&
        target !== undefined &&
        current !== undefined &&
        target.sortOrder < current.sortOrder
      );
    }) ?? null;
  return { pass, fail };
};

// Overview agenda -----------------------------------------------------------------------------------------

/**
 * "Việc cần làm" on the production overview: open tasks, the not-yet-done ones that are late or
 * due today (organization day), and the next few to work on — late first, then by deadline; tasks
 * already done (waiting for QC / the Leader) come last and carry no deadline countdown.
 */
export const taskAgenda = <T extends Pick<ProductionTask, "id" | "deadline" | "isLate" | "doneAt">>(
  tasks: readonly T[],
  timeZone: string,
  now: Date = new Date(),
  take = 5
) => {
  const today = isoToZoned(now.toISOString(), timeZone).day;
  const todo = tasks.filter((task) => task.doneAt === null);
  const late = new Set(
    todo.filter((task) => task.isLate || new Date(task.deadline) < now).map((task) => task.id)
  );
  const dueToday = todo.filter(
    (task) => !late.has(task.id) && isoToZoned(task.deadline, timeZone).day === today
  ).length;
  const rank = (task: T) => (late.has(task.id) ? 0 : task.doneAt === null ? 1 : 2);
  const next = [...tasks]
    .sort(
      (a, b) => rank(a) - rank(b) || new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    )
    .slice(0, take);
  return { open: tasks.length, todo: todo.length, late: late.size, dueToday, next };
};

// Paging --------------------------------------------------------------------------------------------------

/**
 * Rows of an infinite (cursor) list in page order without duplicates: a row whose sort key changed
 * between two page fetches can show up on both pages.
 */
export const flattenPages = <T extends { id: string }>(
  pages: readonly { items: readonly T[] }[] | undefined
): T[] => {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      rows.push(item);
    }
  }
  return rows;
};

/** "200 task đầu theo deadline" while more pages exist, otherwise "Tất cả 37 task". */
export const pagedCountLabel = (count: number, hasMore: boolean, noun = "task") =>
  hasMore
    ? `Đang hiện ${formatNumber(count)} ${noun} đầu (theo deadline)`
    : `Tất cả ${formatNumber(count)} ${noun}`;

// Kanban --------------------------------------------------------------------------------------------------

export type BoardColumn<T> = {
  status: Pick<ProductionStatus, "id" | "name" | "color" | "code" | "sortOrder" | "active">;
  tasks: T[];
};

/**
 * Columns in workflow order. Columns without tasks are kept for the active flow (so drops have a
 * target) and dropped for archived statuses.
 */
export const boardColumns = <T extends { status: { id: string } }>(
  tasks: readonly T[],
  statuses: readonly Pick<
    ProductionStatus,
    "id" | "name" | "color" | "code" | "sortOrder" | "active"
  >[]
): BoardColumn<T>[] => {
  const byStatus = new Map<string, T[]>();
  for (const task of tasks) {
    const list = byStatus.get(task.status.id) ?? [];
    list.push(task);
    byStatus.set(task.status.id, list);
  }
  return [...statuses]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((status) => status.active || byStatus.has(status.id))
    .map((status) => ({ status, tasks: byStatus.get(status.id) ?? [] }));
};

// Job list filters (URL state) ------------------------------------------------------------------------------

export type JobFilters = {
  q: string;
  projectId: string | null;
  statusId: string | null;
  leaderId: string | null;
  /** Tags (any of them, `tag` repeated in the URL) and JOB custom-field filters (`cf.<key>`). */
  custom: ListFilters;
  /** Calendar days (organization timezone), inclusive. */
  from: string | null;
  to: string | null;
  late: boolean;
  archived: boolean;
};

export const emptyJobFilters: JobFilters = {
  q: "",
  projectId: null,
  statusId: null,
  leaderId: null,
  custom: emptyListFilters,
  from: null,
  to: null,
  late: false,
  archived: false
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export const jobFiltersFromSearch = (params: URLSearchParams): JobFilters => {
  const id = (key: string) => {
    const value = params.get(key);
    return value && uuid.test(value) ? value : null;
  };
  const day = (key: string) => {
    const value = params.get(key);
    return value && dayPattern.test(value) ? value : null;
  };
  return {
    q: (params.get("q") ?? "").slice(0, 120),
    projectId: id("project"),
    statusId: id("status"),
    leaderId: id("leader"),
    custom: listFiltersFromSearch(params, "tag"),
    from: day("from"),
    to: day("to"),
    late: params.get("late") === "1",
    archived: params.get("archived") === "1"
  };
};

export const jobFiltersToSearch = (filters: JobFilters) => {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.projectId) params.set("project", filters.projectId);
  if (filters.statusId) params.set("status", filters.statusId);
  if (filters.leaderId) params.set("leader", filters.leaderId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.late) params.set("late", "1");
  if (filters.archived) params.set("archived", "1");
  return listFiltersToSearch(filters.custom, params, "tag");
};

export const activeFilterCount = (filters: JobFilters) =>
  [filters.projectId, filters.statusId, filters.leaderId, filters.from, filters.to].filter(Boolean)
    .length +
  (filters.late ? 1 : 0) +
  (filters.archived ? 1 : 0) +
  activeListFilterCount(filters.custom);

const addDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return next.toISOString().slice(0, 10);
};

/**
 * API query for GET /production/jobs (and its Excel export): the day range becomes [from 00:00,
 * to + 1 day 00:00) in the org timezone; tags / custom fields as `tagId` and `cf.<key>` (sanitize
 * them against the active JOB fields first, list-filters.ts).
 */
export const jobQueryFromFilters = (
  filters: JobFilters,
  timeZone: string
): Record<string, QueryValue> => ({
  ...listFiltersToQuery(filters.custom),
  q: filters.q.trim() || undefined,
  projectId: filters.projectId ?? undefined,
  statusId: filters.statusId ?? undefined,
  leaderId: filters.leaderId ?? undefined,
  deadlineFrom: filters.from
    ? (zonedToIso(filters.from, "00:00", timeZone) ?? undefined)
    : undefined,
  deadlineTo: filters.to
    ? (zonedToIso(addDay(filters.to), "00:00", timeZone) ?? undefined)
    : undefined,
  late: filters.late ? "true" : undefined,
  includeArchived: filters.archived ? "true" : undefined
});

// Timeline sentences ------------------------------------------------------------------------------------------

export type Segment = { text: string; strong?: boolean; tone?: "danger" | "success" | "warning" };

type Names = {
  user: (id: string) => string | undefined;
  process: (id: string) => string | undefined;
  shift: (id: string) => string | undefined;
  timeZone: string;
  /** Tag names for tag changes (FIELD / JOB rows). */
  tag?: ((id: string) => string | undefined) | undefined;
  /** Custom-field definitions of the job / task entity, for "Mã đơn hàng A → B". */
  field?: ((entity: "JOB" | "TASK", key: string) => CustomField | undefined) | undefined;
};

/** "12/10 17:00" (year added when not the current one) — compact for "from → to" sentences. */
export const formatShortDateTime = (iso: string, timeZone: string, now: Date = new Date()) => {
  const { day, time } = isoToZoned(iso, timeZone);
  const [year, month, date] = day.split("-");
  const thisYear = isoToZoned(now.toISOString(), timeZone).day.slice(0, 4);
  return `${date}/${month}${year === thisYear ? "" : `/${year}`} ${time}`;
};

const quoted = (value: unknown) => (str(value) ? `“${str(value)}”` : "—");

/** "Mã đơn hàng ĐH1 → ĐH2" for each custom value that changed (keys sorted by the field order). */
const customValueChanges = (
  entity: "JOB" | "TASK",
  before: unknown,
  after: unknown,
  names: Names
) => {
  const from = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const to = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])].filter(
    (key) => JSON.stringify(from[key] ?? null) !== JSON.stringify(to[key] ?? null)
  );
  return keys.map((key) => {
    const field = names.field?.(entity, key);
    const show = (value: unknown) => {
      if (value === null || value === undefined || value === "") return "—";
      if (!field) {
        if (Array.isArray(value))
          return value
            .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
            .join(", ");
        return typeof value === "string" || typeof value === "number"
          ? String(value)
          : JSON.stringify(value);
      }
      return formatCustomValue(field, value as CustomValue) || "—";
    };
    return `${field?.label ?? key} ${show(from[key])} → ${show(to[key])}`;
  });
};

/** "thêm tag Gấp; bỏ tag VIP". */
const tagChanges = (before: unknown, after: unknown, names: Names) => {
  const from = Array.isArray(before) ? (before as string[]) : [];
  const to = Array.isArray(after) ? (after as string[]) : [];
  const name = (id: string) => names.tag?.(id) ?? "tag đã xóa";
  const added = to.filter((id) => !from.includes(id)).map(name);
  const removed = from.filter((id) => !to.includes(id)).map(name);
  return [
    ...(added.length > 0 ? [`thêm tag ${added.join(", ")}`] : []),
    ...(removed.length > 0 ? [`bỏ tag ${removed.join(", ")}`] : [])
  ];
};

/**
 * A job-level history row (action JOB): "đã sửa job" + one line per changed field ("deadline
 * 12/10 17:00 → 13/10 12:00", "Leader A → B", "Mã đơn hàng X → Y"…); archiving / restoring alone
 * reads "đã lưu trữ job" / "đã khôi phục job". The timeline shows the changes as a short list.
 */
export const describeJobEdit = (
  log: Pick<TaskLog, "fromValue" | "toValue">,
  names: Names
): { verb: string; changes: string[] } => {
  const from = log.fromValue ?? {};
  const to = log.toValue ?? {};
  const archived =
    to.archived === true ? "lưu trữ job" : to.archived === false ? "khôi phục job" : null;
  const changes = jobChanges(from, to, names);
  if (changes.length === 0) return { verb: archived ? `đã ${archived}` : "đã sửa job", changes };
  return { verb: archived ? `đã sửa và ${archived}` : "đã sửa job", changes };
};

/** One job edit (action JOB, PLAN §8): only the fields that changed. */
const jobChanges = (from: Record<string, unknown>, to: Record<string, unknown>, names: Names) => {
  const parts: string[] = [];
  for (const key of Object.keys(to)) {
    switch (key) {
      case "code":
        parts.push(`mã job ${str(from.code) ?? "—"} → ${str(to.code) ?? "—"}`);
        break;
      case "name":
        parts.push(`tên job ${quoted(from.name)} → ${quoted(to.name)}`);
        break;
      case "projectId":
        parts.push(`dự án ${str(from.projectCode) ?? "khác"} → ${str(to.projectCode) ?? "khác"}`);
        break;
      case "deadline":
        parts.push(
          `deadline ${str(from.deadline) ? formatShortDateTime(str(from.deadline)!, names.timeZone) : "—"} → ${
            str(to.deadline) ? formatShortDateTime(str(to.deadline)!, names.timeZone) : "—"
          }`
        );
        break;
      case "leaderId": {
        const who = (name: unknown, id: unknown) =>
          str(name) ?? (str(id) ? (names.user(str(id)!) ?? "người khác") : "—");
        parts.push(
          `Leader ${who(from.leaderName, from.leaderId)} → ${who(to.leaderName, to.leaderId)}`
        );
        break;
      }
      case "totalImages":
        parts.push(
          `tổng tấm ${num(from.totalImages) !== null ? formatNumber(num(from.totalImages)) : "—"} → ${
            num(to.totalImages) !== null ? formatNumber(num(to.totalImages)) : "—"
          }`
        );
        break;
      case "driveLink":
        parts.push(
          !str(from.driveLink)
            ? "thêm link ảnh"
            : !str(to.driveLink)
              ? "xóa link ảnh"
              : "đổi link ảnh"
        );
        break;
      case "customValues":
        parts.push(...customValueChanges("JOB", from.customValues, to.customValues, names));
        break;
      case "tagIds":
        parts.push(...tagChanges(from.tagIds, to.tagIds, names));
        break;
      default:
        break;
    }
  }
  return parts;
};

const str = (value: unknown) => (typeof value === "string" && value ? value : null);
const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const person = (id: unknown, names: Names, fallback = "người khác"): Segment => {
  const value = str(id);
  return { text: value ? (names.user(value) ?? fallback) : "không ai", strong: Boolean(value) };
};

const fieldLabels: Record<string, string> = {
  qtyAssigned: "số tấm giao",
  processId: "quy trình",
  shiftId: "ca làm",
  deadline: "deadline",
  customValues: "trường tùy chỉnh"
};

const fieldValue = (key: string, value: unknown, names: Names) => {
  if (key === "processId")
    return str(value) ? (names.process(str(value)!) ?? "quy trình khác") : "—";
  if (key === "shiftId") return str(value) ? (names.shift(str(value)!) ?? "ca khác") : "—";
  if (key === "deadline")
    return str(value) ? formatDateTime(str(value), names.timeZone, true) : "—";
  if (key === "qtyAssigned") return num(value) !== null ? `${num(value)} tấm` : "—";
  return null;
};

/**
 * One history row as a Vietnamese sentence (actor prepended by the caller): status from → to with
 * the Done quantity / OT hours / QC fail / override, quantity corrections, (re)assignment, field
 * edits and creation (with the over-allocation warning stored in the log).
 */
export const describeTaskLog = (
  log: Pick<TaskLog, "action" | "fromValue" | "toValue" | "taskNumber">,
  names: Names
): Segment[] => {
  const from = log.fromValue ?? {};
  const to = log.toValue ?? {};
  const task: Segment = { text: `#${log.taskNumber ?? "?"}`, strong: true };
  switch (log.action) {
    case "JOB": {
      const edit = describeJobEdit(log, names);
      return edit.changes.length > 0
        ? [{ text: `${edit.verb}: ` }, { text: edit.changes.join("; "), strong: true }]
        : [{ text: edit.verb }];
    }
    case "CREATE": {
      const kind = str(to.kind);
      const segments: Segment[] = [
        {
          text:
            kind === "FB_WRONG"
              ? "giao lại (feedback sai) task "
              : kind === "FB_EXTRA"
                ? "giao thêm (feedback) task "
                : "đã tạo task "
        },
        task,
        { text: " cho " },
        person(to.assigneeId, names)
      ];
      if (num(to.qtyAssigned) !== null) segments.push({ text: ` · ${num(to.qtyAssigned)} tấm` });
      if (str(to.qcId)) segments.push({ text: " · QC " }, person(to.qcId, names));
      if (str(to.warning)) segments.push({ text: ` — ${str(to.warning)}`, tone: "warning" });
      return segments;
    }
    case "STATUS": {
      const segments: Segment[] = [
        { text: "chuyển " },
        task,
        { text: " từ " },
        { text: str(from.name) ?? "?", strong: true },
        { text: " sang " },
        { text: str(to.name) ?? "?", strong: true }
      ];
      if (num(to.qtyDone) !== null)
        segments.push({ text: ` · ${formatNumber(num(to.qtyDone))} tấm` });
      if (num(to.otHours) !== null)
        segments.push({ text: ` · ${formatNumber(num(to.otHours))} giờ OT` });
      if (to.qcFail === true) segments.push({ text: " · QC trả lại", tone: "danger" });
      if (to.override === true) segments.push({ text: " · chuyển ngoài luồng", tone: "warning" });
      return segments;
    }
    case "QTY":
      return [
        { text: "sửa số tấm hoàn thành của " },
        task,
        { text: ": " },
        { text: `${num(from.qtyDone) ?? "?"} → ${num(to.qtyDone) ?? "?"} tấm`, strong: true }
      ];
    case "ASSIGN": {
      const segments: Segment[] = [{ text: "giao lại " }, task];
      if (str(from.assigneeId) !== str(to.assigneeId)) {
        segments.push(
          { text: ": người làm " },
          person(from.assigneeId, names),
          { text: " → " },
          person(to.assigneeId, names)
        );
      }
      if (str(from.qcId) !== str(to.qcId)) {
        segments.push(
          { text: segments.length > 2 ? "; QC " : ": QC " },
          person(from.qcId, names),
          { text: " → " },
          person(to.qcId, names)
        );
      }
      return segments;
    }
    case "NOTE":
      return str(to.note)
        ? [{ text: "cập nhật ghi chú của " }, task]
        : [{ text: "xóa ghi chú của " }, task];
    case "FIELD": {
      const keys = Object.keys(to);
      const parts = keys.flatMap((key) => {
        if (key === "tagIds") return tagChanges(from.tagIds, to.tagIds, names);
        if (key === "customValues" && names.field) {
          const changes = customValueChanges("TASK", from.customValues, to.customValues, names);
          return changes.length > 0 ? changes : [fieldLabels.customValues ?? key];
        }
        const label = fieldLabels[key] ?? key;
        const before = fieldValue(key, from[key], names);
        const after = fieldValue(key, to[key], names);
        return [before !== null && after !== null ? `${label} ${before} → ${after}` : label];
      });
      return [{ text: "sửa " }, task, { text: `: ${parts.join("; ")}` }];
    }
    default:
      return [{ text: "cập nhật " }, task];
  }
};

// Mentions ------------------------------------------------------------------------------------------------------

const seesEverything = (roles: readonly ProductionRole[] | undefined) =>
  (roles ?? []).some((role) => role === "ACCOUNT" || role === "LEADER" || role === "ADMIN");

/**
 * Who may read a task's comments (BE canViewTask): its worker, its QC, the job's Leader and anyone
 * with Account / Leader / Admin. Mentions are limited to them; `roles` is unknown for people the
 * caller cannot list, who then only qualify through the task itself.
 */
export const canSeeTask = (
  personId: string,
  roles: readonly ProductionRole[] | undefined,
  task: { assignee: { id: string }; qc: { id: string } | null },
  jobLeaderId: string | null = null
) =>
  personId === task.assignee.id ||
  personId === task.qc?.id ||
  personId === jobLeaderId ||
  seesEverything(roles);

/** Who may read a job's timeline: Account / Leader / Admin, its Leader, its workers and QCs. */
export const canSeeJob = (
  personId: string,
  roles: readonly ProductionRole[] | undefined,
  job: {
    leader: { id: string };
    tasks: readonly { assignee: { id: string }; qc: { id: string } | null }[];
  }
) =>
  personId === job.leader.id ||
  seesEverything(roles) ||
  job.tasks.some((task) => task.assignee.id === personId || task.qc?.id === personId);

/** "@abc" right before the caret (start of text or after whitespace) → { query: "abc", start }. */
export const mentionAt = (text: string, caret: number) => {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([\p{L}\p{N}_.-]{0,30})$/u.exec(before);
  if (!match) return null;
  return { query: match[2] ?? "", start: before.length - (match[2]?.length ?? 0) - 1 };
};

/** Replaces the "@query" at `start` with "@Name " and returns the new text and caret. */
export const insertMention = (text: string, start: number, caret: number, name: string) => {
  const inserted = `@${name} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(caret),
    caret: start + inserted.length
  };
};

/** Ids of the people still mentioned in the final text (a mention removed by editing is dropped). */
export const mentionedIds = (text: string, picked: ReadonlyMap<string, string>) =>
  [...picked].filter(([, name]) => text.includes(`@${name}`)).map(([id]) => id);
