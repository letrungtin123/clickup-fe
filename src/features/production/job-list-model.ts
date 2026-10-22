import type { JobPermissionScope, ProductionRole } from "@/contracts/production-catalog";
import type { JobDetail, JobFacets, JobSummary, ProductionTask } from "@/contracts/production-jobs";
import type { ColorToken } from "@/contracts/work";

import { formatInteger } from "./format";
import { isoToZoned } from "./jobs-model";

/**
 * PD-067 — the job List view (like ClickUp's List): jobs grouped by the month of their "Ngày nhận", newest month first,
 * each job row unfolding into its tasks (subtasks nested under their task). Pure helpers, unit tested.
 */

// Months --------------------------------------------------------------------------------------------------------------

/** "2026-10": the month of an instant in the organization timezone (same rule as the API's month facet). */
export const monthOf = (iso: string, timeZone: string) => isoToZoned(iso, timeZone).day.slice(0, 7);

/** "Tháng 10 · 2026" (the group pill shows it in capitals). */
export const monthLabel = (month: string) =>
  `Tháng ${Number(month.slice(5, 7))} · ${month.slice(0, 4)}`;

/** One tone per calendar month, so neighbouring groups never share a colour (readable in light and dark mode). */
const monthTones: readonly ColorToken[] = [
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
  "teal",
  "indigo",
  "orange",
  "cyan",
  "fuchsia",
  "lime",
  "blue"
];
export const monthTone = (month: string): ColorToken =>
  monthTones[(Number(month.slice(5, 7)) + 11) % 12] ?? "sky";

/**
 * A new job created from a month group ("+ Tạo job"): its Ngày nhận. The current month: today; another month: its
 * first day. Ngày giao starts on the same day (never before Ngày nhận).
 */
export const monthDefaultDays = (month: string, today: string) => {
  const day = today.startsWith(`${month}-`) ? today : `${month}-01`;
  return { received: day, due: day };
};

export type MonthGroup<T> = { month: string; jobs: T[] };

/** Jobs by month of Ngày nhận, newest month first; the jobs keep their order (the API's: newest Ngày nhận first). */
export const groupJobsByMonth = <T extends Pick<JobSummary, "receivedAt">>(
  jobs: readonly T[],
  timeZone: string
): MonthGroup<T>[] => {
  const groups = new Map<string, T[]>();
  for (const job of jobs) {
    const month = monthOf(job.receivedAt, timeZone);
    const list = groups.get(month);
    if (list) list.push(job);
    else groups.set(month, [job]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([month, items]) => ({ month, jobs: items }));
};

/** Facet months as a lookup (group header counts: every matching job of the month, loaded or not). */
export const monthCounts = (facets: Pick<JobFacets, "months"> | undefined) =>
  new Map((facets?.months ?? []).map((item) => [item.month, item.count]));

// Labels ------------------------------------------------------------------------------------------------------------------

/** "ABC · Tên dự án" — the code alone when the name repeats it. */
export const projectLabel = (project: Pick<JobSummary["project"], "code" | "name">) =>
  project.name && project.name !== project.code
    ? `${project.code} · ${project.name}`
    : project.code;

export const projectTitle = (project: JobSummary["project"]) =>
  [projectLabel(project), project.clientName ? `Khách hàng: ${project.clientName}` : null]
    .filter(Boolean)
    .join(" — ");

/** "Đã giao 80 · Đã xong 40 · Đã kiểm 20 / 100 tấm" (progress tooltip). */
export const progressLabel = (parts: {
  assigned?: number;
  done: number;
  checked: number;
  total: number;
}) =>
  [
    parts.assigned !== undefined ? `Đã giao ${formatInteger(parts.assigned)}` : null,
    `Đã xong ${formatInteger(parts.done)}`,
    `Đã kiểm ${formatInteger(parts.checked)}`
  ]
    .filter(Boolean)
    .join(" · ") + ` / ${formatInteger(parts.total)} tấm`;

// Points ("Điểm", PD-070) -------------------------------------------------------------------------------------------------

/**
 * What the "Điểm" column shows: a number (recorded, or `expected` — an estimate from "Bảng đơn giá", shown muted), or
 * "—" with why in the tooltip (null: nothing to explain). Never money.
 */
export type PointsCell =
  | { kind: "value"; credits: number; expected: boolean; title: string }
  | { kind: "none"; title: string | null };

export const pointsTitles = {
  recorded: "Điểm đã ghi nhận",
  expected: "Điểm dự kiến theo Bảng đơn giá — ghi nhận khi task Done",
  noQty: "Chưa có số lượng",
  noRule: "Chưa có đơn giá cho công đoạn này",
  khoan: "Ca khoán — không tính điểm",
  hidden: "Bạn không có quyền xem điểm của người khác",
  jobRecorded: "Tổng điểm ca chính thức đã ghi nhận",
  jobExpected: "Tổng điểm ca chính thức — gồm điểm dự kiến của task chưa Done",
  jobNone: "Chưa có điểm ca chính thức"
} as const;

/**
 * A task / subtask row (PD-070): its points on an official shift — recorded, or expected (muted); "—" on a Khoán shift
 * (nothing, never money), without a quantity, without a price, or when someone else's points are not for the viewer.
 */
export const taskPointsCell = (task: Pick<ProductionTask, "points" | "shift">): PointsCell => {
  const points = task.points;
  if (!points) {
    return {
      kind: "none",
      title: task.shift.payMode === "POINTS" ? pointsTitles.hidden : pointsTitles.khoan
    };
  }
  if (points.credits === null) {
    return {
      kind: "none",
      title: points.missing === "QTY" ? pointsTitles.noQty : pointsTitles.noRule
    };
  }
  return {
    kind: "value",
    credits: points.credits,
    expected: points.expected,
    title: points.expected ? pointsTitles.expected : pointsTitles.recorded
  };
};

/** A job row: the total of its official-shift rows (muted when part of it is expected); "—" without any. */
export const jobPointsCell = (points: JobSummary["pointsOfficial"]): PointsCell =>
  points
    ? {
        kind: "value",
        credits: points.credits,
        expected: points.expected,
        title: points.expected ? pointsTitles.jobExpected : pointsTitles.jobRecorded
      }
    : { kind: "none", title: pointsTitles.jobNone };

// Tasks of a job --------------------------------------------------------------------------------------------------------

export type TaskNode = { task: ProductionTask; subtasks: ProductionTask[] };

/**
 * A job's lines in the API's order, each with its subtasks (the full subtask rows of the job detail, PD-044) nested under
 * it. A subtask whose line is missing stays a line of its own, so nothing silently disappears.
 */
export const taskTree = (tasks: readonly ProductionTask[]): TaskNode[] => {
  const ids = new Set(tasks.map((task) => task.id));
  const children = new Map<string, ProductionTask[]>();
  for (const task of tasks) {
    if (task.isSubtask && task.parentTaskId && ids.has(task.parentTaskId)) {
      children.set(task.parentTaskId, [...(children.get(task.parentTaskId) ?? []), task]);
    }
  }
  return tasks
    .filter((task) => !(task.isSubtask && task.parentTaskId && ids.has(task.parentTaskId)))
    .map((task) => ({ task, subtasks: children.get(task.id) ?? [] }));
};

/**
 * "Tiến độ" of a task: its Done quantity out of the given one once Done (else 0), counted as checked once QC checked it
 * (a Checking task: once Done).
 */
export const taskProgress = (
  task: Pick<ProductionTask, "qtyAssigned" | "qtyDone" | "doneAt" | "checkedAt"> & {
    process: Pick<ProductionTask["process"], "isQc">;
  }
) => {
  const total = task.qtyAssigned ?? 0;
  const done = task.doneAt ? (task.qtyDone ?? total) : 0;
  const checked = task.checkedAt || (task.process.isQc && task.doneAt) ? done : 0;
  return { done, checked, total };
};

// Rows of the virtualized table ----------------------------------------------------------------------------------------

export type DetailState =
  | { status: "pending" }
  | { status: "error"; error: unknown }
  | { status: "success"; job: JobDetail };

export type ListRow =
  | { kind: "group"; key: string; month: string; count: number; collapsed: boolean }
  | { kind: "job"; key: string; job: JobSummary; month: string; expanded: boolean }
  | {
      kind: "task";
      key: string;
      job: JobSummary;
      detail: JobDetail;
      task: ProductionTask;
      /** A subtask's line (its status follows it; opening it opens the line). */
      line: ProductionTask | null;
    }
  | { kind: "tasks-loading"; key: string; jobId: string }
  | { kind: "tasks-error"; key: string; jobId: string; error: unknown }
  | { kind: "tasks-empty"; key: string; detail: JobDetail }
  | { kind: "job-footer"; key: string; detail: JobDetail }
  | { kind: "group-footer"; key: string; month: string }
  /** More pages: loads on its own while the last group is open, else "Tải thêm job". */
  | { kind: "more"; key: string; lastCollapsed: boolean };

/** Fixed row heights (px) of the desktop table: rows never measure themselves, so scrolling stays smooth. */
export const rowHeights: Record<ListRow["kind"], number> = {
  group: 48,
  job: 44,
  task: 40,
  "tasks-loading": 40,
  "tasks-error": 44,
  "tasks-empty": 40,
  "job-footer": 36,
  "group-footer": 40,
  more: 48
};
/** A subtask row is a little lower than its line. */
export const subtaskRowHeight = 36;
export const rowHeight = (row: ListRow) =>
  row.kind === "task" && row.line ? subtaskRowHeight : rowHeights[row.kind];

/** Whether the expanded job's footer offers "+ Chia task" / "+ Nhập Task" (same rule as the job page). */
export const canAddTasks = (detail: Pick<JobDetail, "archived" | "capabilities">) =>
  detail.capabilities.canSplit && !detail.archived;

/**
 * The flat rows of the List view: per month group a header (count from the facets, else the loaded jobs), then — unless
 * collapsed — its jobs, each expanded job followed by its tasks (subtasks nested; skeleton rows while the detail loads,
 * an error row, or "Chưa có task") and a footer to add tasks when allowed, and the group's "+ Tạo job" footer. The last
 * group's footer waits while more pages may still add jobs to it.
 */
export const buildListRows = ({
  jobs,
  timeZone,
  collapsed,
  expanded,
  details,
  counts,
  canCreateJob,
  hasMore
}: {
  jobs: readonly JobSummary[];
  timeZone: string;
  collapsed: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  details: ReadonlyMap<string, DetailState>;
  counts: ReadonlyMap<string, number>;
  canCreateJob: boolean;
  hasMore: boolean;
}): ListRow[] => {
  const rows: ListRow[] = [];
  const groups = groupJobsByMonth(jobs, timeZone);
  groups.forEach((group, index) => {
    const isCollapsed = collapsed.has(group.month);
    rows.push({
      kind: "group",
      key: `group:${group.month}`,
      month: group.month,
      count: Math.max(counts.get(group.month) ?? 0, group.jobs.length),
      collapsed: isCollapsed
    });
    if (isCollapsed) return;
    for (const job of group.jobs) {
      const open = expanded.has(job.id);
      rows.push({ kind: "job", key: `job:${job.id}`, job, month: group.month, expanded: open });
      if (!open) continue;
      const state = details.get(job.id) ?? { status: "pending" };
      if (state.status === "pending") {
        const skeletons = Math.min(Math.max(job.taskCount, 1), 3);
        for (let item = 0; item < skeletons; item += 1) {
          rows.push({ kind: "tasks-loading", key: `loading:${job.id}:${item}`, jobId: job.id });
        }
        continue;
      }
      if (state.status === "error") {
        rows.push({
          kind: "tasks-error",
          key: `error:${job.id}`,
          jobId: job.id,
          error: state.error
        });
        continue;
      }
      const detail = state.job;
      const tree = taskTree(detail.tasks);
      if (tree.length === 0) {
        rows.push({ kind: "tasks-empty", key: `empty:${job.id}`, detail });
      }
      for (const node of tree) {
        rows.push({
          kind: "task",
          key: `task:${node.task.id}`,
          job,
          detail,
          task: node.task,
          line: null
        });
        for (const subtask of node.subtasks) {
          rows.push({
            kind: "task",
            key: `task:${subtask.id}`,
            job,
            detail,
            task: subtask,
            line: node.task
          });
        }
      }
      if (canAddTasks(detail)) rows.push({ kind: "job-footer", key: `footer:${job.id}`, detail });
    }
    const last = index === groups.length - 1;
    if (canCreateJob && !(last && hasMore)) {
      rows.push({ kind: "group-footer", key: `group-footer:${group.month}`, month: group.month });
    }
  });
  if (hasMore) {
    const lastGroup = groups[groups.length - 1];
    rows.push({
      kind: "more",
      key: "more",
      lastCollapsed: lastGroup ? collapsed.has(lastGroup.month) : false
    });
  }
  return rows;
};

// Job status from the list ----------------------------------------------------------------------------------------------

/**
 * Whether the job row's status chip opens the status menu (PD-038, same rule as the job page's `canChangeStatus`): not
 * archived, and "update: all" (ADMIN always), or "own" when I work on a live line of the job or lead it (as Leader /
 * Admin). The loaded job detail's own capability wins; the API checks again on save.
 */
export const jobStatusEditable = (
  job: Pick<JobSummary, "archived" | "leader" | "people">,
  viewer: { id: string; updateScope: JobPermissionScope; roles: readonly ProductionRole[] },
  detail?: Pick<JobDetail, "capabilities" | "archived"> | null
) => {
  if (detail) return detail.capabilities.canChangeStatus && !detail.archived;
  if (job.archived) return false;
  if (viewer.updateScope === "all") return true;
  if (viewer.updateScope !== "own") return false;
  const works = job.people.workers.some((worker) => worker.user.id === viewer.id);
  const leads =
    job.leader?.id === viewer.id &&
    (viewer.roles.includes("LEADER") || viewer.roles.includes("ADMIN"));
  return works || leads;
};

// Remembered view state -------------------------------------------------------------------------------------------------

const collapsedKey = (userId: string) => `nesso.production.jobs.collapsedMonths.v1:${userId}`;
const expandedKey = (userId: string) => `nesso.production.jobs.expanded.v1:${userId}`;
const sidebarKey = (userId: string) => `nesso.production.jobs.sidebar.v1:${userId}`;
/** At most this many expanded jobs are remembered (each one loads its detail when the list opens again). */
export const EXPANDED_MEMORY = 30;

const storage = (kind: "local" | "session"): Storage | null => {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

const readList = (kind: "local" | "session", key: string, pattern: RegExp) => {
  try {
    const raw = storage(kind)?.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && pattern.test(item))
      : [];
  } catch {
    return [];
  }
};

const writeList = (kind: "local" | "session", key: string, values: readonly string[]) => {
  try {
    const target = storage(kind);
    if (!target) return;
    if (values.length === 0) target.removeItem(key);
    else target.setItem(key, JSON.stringify(values));
  } catch {
    // Private mode / quota: the view simply forgets.
  }
};

const monthPattern = /^\d{4}-\d{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Collapsed month groups, per user on this device (localStorage). */
export const readCollapsedMonths = (userId: string) =>
  new Set(readList("local", collapsedKey(userId), monthPattern));
export const writeCollapsedMonths = (userId: string, months: ReadonlySet<string>) =>
  writeList("local", collapsedKey(userId), [...months].sort().reverse().slice(0, 120));

/** Expanded jobs, per user in this tab (sessionStorage): back from a job page, the list unfolds as it was. */
export const readExpandedJobs = (userId: string) =>
  new Set(readList("session", expandedKey(userId), uuidPattern).slice(-EXPANDED_MEMORY));
export const writeExpandedJobs = (userId: string, jobIds: ReadonlySet<string>) =>
  writeList("session", expandedKey(userId), [...jobIds].slice(-EXPANDED_MEMORY));

/**
 * The project sidebar folded away or shown (tablet / desktop), per user on this device; null = no choice yet (the page
 * decides by screen size: shown on desktop, folded on tablets).
 */
export const readSidebarHidden = (userId: string): boolean | null => {
  try {
    const value = storage("local")?.getItem(sidebarKey(userId));
    return value === "hidden" ? true : value === "shown" ? false : null;
  } catch {
    return null;
  }
};
export const writeSidebarHidden = (userId: string, hidden: boolean) => {
  try {
    storage("local")?.setItem(sidebarKey(userId), hidden ? "hidden" : "shown");
  } catch {
    // Ignored, as above.
  }
};

/** Adds or removes one value (a new Set, for React state). */
export const toggled = <T>(set: ReadonlySet<T>, value: T) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

// Project sidebar -------------------------------------------------------------------------------------------------------

export type ProjectFacet = JobFacets["projects"][number];

const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Projects matching the sidebar search (code or name, accents and case ignored); the selected one always stays. */
export const filterProjects = (
  projects: readonly ProjectFacet[],
  term: string,
  selectedId: string | null
) => {
  const needle = fold(term.trim());
  if (!needle) return [...projects];
  return projects.filter(
    (project) =>
      project.projectId === selectedId ||
      fold(project.code).includes(needle) ||
      fold(project.name).includes(needle)
  );
};

/**
 * PD-078 — the sidebar's order: by code, Vietnamese collation (case / accents ignored, "Đ" after "D"), numbers in numeric
 * order ("B2" before "B10") — the API's order, applied again so the list never depends on it.
 */
const projectCodeCollator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });
export const compareProjectCodes = (
  a: Pick<ProjectFacet, "code" | "projectId">,
  b: Pick<ProjectFacet, "code" | "projectId">
) =>
  projectCodeCollator.compare(a.code, b.code) ||
  (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
  (a.projectId < b.projectId ? -1 : 1);

/**
 * PD-078 — every project in the sidebar (both tabs, with or without jobs), sorted: the active ones, then — folded under
 * "Ngừng hoạt động" — the inactive ones.
 */
export const splitProjectFacets = <T extends Pick<ProjectFacet, "code" | "projectId" | "active">>(
  projects: readonly T[]
) => {
  const sorted = [...projects].sort(compareProjectCodes);
  return {
    active: sorted.filter((project) => project.active),
    inactive: sorted.filter((project) => !project.active)
  };
};

/** "Tất cả": every matching job whatever its project (each job has exactly one project). */
export const allProjectsCount = (projects: readonly Pick<ProjectFacet, "count">[]) =>
  projects.reduce((sum, project) => sum + project.count, 0);
