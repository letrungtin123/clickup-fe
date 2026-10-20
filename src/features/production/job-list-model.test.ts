// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JobDetail, JobSummary, ProductionTask } from "@/contracts/production-jobs";

import {
  allProjectsCount,
  buildListRows,
  filterProjects,
  groupJobsByMonth,
  jobPointsCell,
  jobStatusEditable,
  monthDefaultDays,
  monthLabel,
  monthOf,
  readCollapsedMonths,
  readExpandedJobs,
  pointsTitles,
  readSidebarHidden,
  taskPointsCell,
  taskProgress,
  taskTree,
  writeCollapsedMonths,
  writeExpandedJobs,
  writeSidebarHidden,
  type DetailState,
  type ListRow
} from "./job-list-model";

// PD-067 — the job List view model. Obviously fake ids and names (public repository).
const TZ = "Asia/Ho_Chi_Minh";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = id(1);

const job = (n: number, receivedAt: string, extra: Partial<JobSummary> = {}): JobSummary => ({
  id: id(100 + n),
  number: n,
  code: `JOB-${n}`,
  name: null,
  project: { id: id(2), code: "P", name: "Dự án", clientName: null },
  leader: null,
  receivedAt,
  deadline: "2099-10-12T10:00:00.000Z",
  totalImages: 0,
  totalImagesManual: false,
  driveLink: null,
  channelId: null,
  jobStatus: {
    id: id(90),
    name: "Mới nhận",
    color: "slate",
    isClosed: false,
    requiresAllChecked: false
  },
  status: null,
  uncheckedTaskCount: 0,
  processTotals: [],
  qtyAssigned: 0,
  qtyDone: 0,
  qtyChecked: 0,
  taskCount: 2,
  tasksWithoutQty: 0,
  lateTaskCount: 0,
  openFeedbackCount: 0,
  people: { workers: [], qc: [] },
  personShare: null,
  pointsOfficial: null,
  customValues: {},
  tagIds: [],
  createdBy: null,
  createdAt: "2026-10-01T01:00:00.000Z",
  archived: false,
  ...extra
});

const task = (n: number, extra: Partial<ProductionTask> = {}): ProductionTask => ({
  id: id(500 + n),
  number: n,
  code: String(n),
  jobId: id(101),
  jobCode: "JOB-1",
  project: { id: id(2), code: "P", name: "Dự án" },
  assignee: { id: ME, displayName: "Người A", email: null, avatarUrl: null },
  qc: null,
  process: { id: id(20), name: "Retouch", isQc: false },
  shift: { id: id(30), name: "Chính thức", payMode: "POINTS", requiresOtHours: false },
  qtyAssigned: 10,
  qtyDone: null,
  errorQty: null,
  otHours: null,
  assignedAt: "2026-10-01T00:00:00+07:00",
  deadline: "2099-10-05T23:59:00+07:00",
  doneAt: null,
  checkedAt: null,
  status: { id: id(80), code: "IN_PROGRESS", name: "Đang làm", color: "blue" },
  kind: "NORMAL",
  parentTaskId: null,
  isSubtask: false,
  splitReason: null,
  subtasks: [],
  allocatedQty: 10,
  pendingQtyRequest: null,
  feedbackId: null,
  note: null,
  workLink: null,
  isLate: false,
  jobArchived: false,
  qcFailCount: 0,
  customValues: {},
  tagIds: [],
  myCredits: [],
  points: null,
  lastQcFail: null,
  createdAt: "2026-10-01T08:00:00+07:00",
  updatedAt: "2026-10-01T08:00:00+07:00",
  capabilities: {
    transitions: [],
    canEdit: false,
    canAssign: false,
    canChangeAssignee: false,
    canEditQty: false,
    canEditQtyAssigned: false,
    canRequestQty: false,
    canDecideQtyRequest: false,
    canCreateSubtask: false,
    canDelete: false
  },
  ...extra
});

const detailOf = (
  summary: JobSummary,
  tasks: ProductionTask[],
  caps: Partial<JobDetail["capabilities"]> = {}
): JobDetail => ({
  ...summary,
  tasks,
  feedbacks: [],
  capabilities: {
    canEdit: false,
    canChangeLeader: false,
    canSplit: false,
    splitOwnOnly: false,
    canDelete: false,
    canFeedback: false,
    canCloseFeedback: false,
    canArchive: false,
    canChangeStatus: false,
    bulkActions: [],
    ...caps
  }
});

const kinds = (rows: ListRow[]) =>
  rows.map((row) =>
    row.kind === "task" ? `${row.line ? "sub" : "task"}:${row.task.code}` : row.kind
  );

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("months (business timezone)", () => {
  it("takes the month of Ngày nhận in the organization timezone, not UTC", () => {
    // 2026-09-30 17:30 UTC is 1 October 00:30 in Ho Chi Minh City.
    expect(monthOf("2026-09-30T17:30:00.000Z", TZ)).toBe("2026-10");
    expect(monthOf("2026-09-30T16:59:00.000Z", TZ)).toBe("2026-09");
    expect(monthLabel("2026-10")).toBe("Tháng 10 · 2026");
    expect(monthLabel("2027-01")).toBe("Tháng 1 · 2027");
  });

  it("groups jobs by month, newest month first, keeping the jobs' order", () => {
    const groups = groupJobsByMonth(
      [
        job(1, "2026-10-15T00:00:00+07:00"),
        job(2, "2026-09-20T00:00:00+07:00"),
        job(3, "2026-10-01T00:00:00+07:00"),
        job(4, "2026-09-30T17:30:00.000Z")
      ],
      TZ
    );
    expect(groups.map((group) => [group.month, group.jobs.map((item) => item.code)])).toEqual([
      ["2026-10", ["JOB-1", "JOB-3", "JOB-4"]],
      ["2026-09", ["JOB-2"]]
    ]);
  });

  it("a new job from a month group starts today in the current month, else on the month's first day", () => {
    expect(monthDefaultDays("2026-10", "2026-10-19")).toEqual({
      received: "2026-10-19",
      due: "2026-10-19"
    });
    expect(monthDefaultDays("2026-08", "2026-10-19")).toEqual({
      received: "2026-08-01",
      due: "2026-08-01"
    });
  });
});

describe("rows of the List view", () => {
  const october = job(1, "2026-10-15T00:00:00+07:00");
  const september = job(2, "2026-09-20T00:00:00+07:00");
  const base = {
    jobs: [october, september],
    timeZone: TZ,
    collapsed: new Set<string>(),
    expanded: new Set<string>(),
    details: new Map<string, DetailState>(),
    counts: new Map([
      ["2026-10", 12],
      ["2026-09", 30]
    ]),
    canCreateJob: true,
    hasMore: false
  };

  it("a header per month (count of every matching job), its jobs, then “+ Tạo job”", () => {
    const rows = buildListRows(base);
    expect(kinds(rows)).toEqual(["group", "job", "group-footer", "group", "job", "group-footer"]);
    expect(rows[0]).toMatchObject({ kind: "group", month: "2026-10", count: 12 });
    // Without facets yet: the loaded jobs.
    expect(buildListRows({ ...base, counts: new Map() })[0]).toMatchObject({ count: 1 });
  });

  it("a folded month keeps only its header; no “+ Tạo job” without the right to create", () => {
    const rows = buildListRows({ ...base, collapsed: new Set(["2026-10"]), canCreateJob: false });
    expect(kinds(rows)).toEqual(["group", "group", "job"]);
    expect(rows[0]).toMatchObject({ collapsed: true });
  });

  it("the last month's footer waits while more pages may add to it, and a “more” row closes the list", () => {
    const rows = buildListRows({ ...base, hasMore: true, collapsed: new Set(["2026-09"]) });
    expect(kinds(rows)).toEqual(["group", "job", "group-footer", "group", "more"]);
    expect(rows[rows.length - 1]).toMatchObject({ kind: "more", lastCollapsed: true });
  });

  it("an expanded job shows skeletons while its detail loads, then its tasks with subtasks nested, then the add footer", () => {
    const expanded = new Set([october.id]);
    expect(kinds(buildListRows({ ...base, expanded })).slice(0, 5)).toEqual([
      "group",
      "job",
      "tasks-loading",
      "tasks-loading",
      "group-footer"
    ]);

    const line = task(12, { subtasks: [] });
    const sub = task(13, { code: "12a", isSubtask: true, parentTaskId: line.id });
    const other = task(14);
    const details = new Map<string, DetailState>([
      [
        october.id,
        { status: "success", job: detailOf(october, [line, sub, other], { canSplit: true }) }
      ]
    ]);
    const rows = buildListRows({ ...base, expanded, details });
    expect(kinds(rows).slice(0, 7)).toEqual([
      "group",
      "job",
      "task:12",
      "sub:12a",
      "task:14",
      "job-footer",
      "group-footer"
    ]);
    const subRow = rows[3] as Extract<ListRow, { kind: "task" }>;
    expect(subRow.line?.id).toBe(line.id);

    // Archived, or no right to split: no footer.
    const archived = new Map<string, DetailState>([
      [
        october.id,
        {
          status: "success",
          job: { ...detailOf(october, [line], { canSplit: true }), archived: true }
        }
      ]
    ]);
    expect(kinds(buildListRows({ ...base, expanded, details: archived }))).not.toContain(
      "job-footer"
    );
  });

  it("an expanded job without tasks says so; a failed detail gets an error row", () => {
    const expanded = new Set([october.id]);
    const empty = new Map<string, DetailState>([
      [october.id, { status: "success", job: detailOf(october, []) }]
    ]);
    expect(kinds(buildListRows({ ...base, expanded, details: empty }))).toContain("tasks-empty");
    const failed = new Map<string, DetailState>([
      [october.id, { status: "error", error: new Error("x") }]
    ]);
    expect(kinds(buildListRows({ ...base, expanded, details: failed }))).toContain("tasks-error");
  });

  it("taskTree keeps a subtask whose line is missing as a line of its own", () => {
    const orphan = task(20, { code: "9a", isSubtask: true, parentTaskId: id(999) });
    expect(taskTree([orphan]).map((node) => node.task.code)).toEqual(["9a"]);
  });
});

describe("task progress", () => {
  it("counts the Done quantity once Done, checked once QC checked (a Checking task once Done)", () => {
    expect(taskProgress(task(1))).toEqual({ done: 0, checked: 0, total: 10 });
    expect(taskProgress(task(1, { doneAt: "2026-10-02T00:00:00Z", qtyDone: 8 }))).toEqual({
      done: 8,
      checked: 0,
      total: 10
    });
    expect(
      taskProgress(
        task(1, { doneAt: "2026-10-02T00:00:00Z", checkedAt: "2026-10-03T00:00:00Z", qtyDone: 8 })
      )
    ).toEqual({ done: 8, checked: 8, total: 10 });
    expect(
      taskProgress(
        task(1, {
          doneAt: "2026-10-02T00:00:00Z",
          qtyDone: 10,
          process: { id: id(21), name: "Checking", isQc: true }
        })
      )
    ).toEqual({ done: 10, checked: 10, total: 10 });
  });
});

describe("Điểm (PD-070)", () => {
  const khoan = {
    id: id(31),
    name: "Ca khoán",
    payMode: "MONEY_IF_KPI" as const,
    requiresOtHours: false
  };

  it("a task row: recorded / expected values, else “—” with the reason (Khoán, hidden, no quantity, no price)", () => {
    expect(
      taskPointsCell(task(1, { points: { credits: 12.5, expected: false, missing: null } }))
    ).toEqual({
      kind: "value",
      credits: 12.5,
      expected: false,
      title: pointsTitles.recorded
    });
    expect(
      taskPointsCell(task(1, { points: { credits: 3, expected: true, missing: null } }))
    ).toMatchObject({
      kind: "value",
      expected: true,
      title: pointsTitles.expected
    });
    expect(taskPointsCell(task(1, { shift: khoan, points: null }))).toEqual({
      kind: "none",
      title: pointsTitles.khoan
    });
    expect(taskPointsCell(task(1, { points: null }))).toEqual({
      kind: "none",
      title: pointsTitles.hidden
    });
    expect(
      taskPointsCell(task(1, { points: { credits: null, expected: true, missing: "QTY" } }))
    ).toEqual({
      kind: "none",
      title: pointsTitles.noQty
    });
    expect(
      taskPointsCell(task(1, { points: { credits: null, expected: true, missing: "RULE" } }))
    ).toEqual({
      kind: "none",
      title: pointsTitles.noRule
    });
  });

  it("a job row: its total, muted while part of it is expected; “—” without one", () => {
    expect(jobPointsCell({ credits: 20, expected: false })).toEqual({
      kind: "value",
      credits: 20,
      expected: false,
      title: pointsTitles.jobRecorded
    });
    expect(jobPointsCell({ credits: 20, expected: true })).toMatchObject({
      expected: true,
      title: pointsTitles.jobExpected
    });
    expect(jobPointsCell(null)).toEqual({ kind: "none", title: pointsTitles.jobNone });
  });
});

describe("job status from the list (PD-038 rule)", () => {
  const viewer = (
    updateScope: "none" | "own" | "all",
    roles: ("STAFF" | "LEADER")[] = ["STAFF"]
  ) => ({
    id: ME,
    updateScope,
    roles
  });
  const worker = {
    user: { id: ME, displayName: "Người A", email: null, avatarUrl: null },
    qty: 5,
    taskCount: 1
  };

  it("update all: yes; own: when I work on it or lead it; never on an archived job", () => {
    const plain = job(1, "2026-10-15T00:00:00+07:00");
    expect(jobStatusEditable(plain, viewer("all"))).toBe(true);
    expect(jobStatusEditable(plain, viewer("own"))).toBe(false);
    expect(
      jobStatusEditable({ ...plain, people: { workers: [worker], qc: [] } }, viewer("own"))
    ).toBe(true);
    const led = {
      ...plain,
      leader: { id: ME, displayName: "Người A", email: null, avatarUrl: null }
    };
    expect(jobStatusEditable(led, viewer("own", ["LEADER"]))).toBe(true);
    expect(jobStatusEditable(led, viewer("own", ["STAFF"]))).toBe(false);
    expect(jobStatusEditable({ ...plain, archived: true }, viewer("all"))).toBe(false);
    expect(jobStatusEditable(plain, viewer("none"))).toBe(false);
  });

  it("the loaded job detail's own capability wins", () => {
    const plain = job(1, "2026-10-15T00:00:00+07:00");
    expect(
      jobStatusEditable(plain, viewer("all"), detailOf(plain, [], { canChangeStatus: false }))
    ).toBe(false);
    expect(
      jobStatusEditable(plain, viewer("none"), detailOf(plain, [], { canChangeStatus: true }))
    ).toBe(true);
  });
});

describe("project sidebar", () => {
  const projects = [
    { projectId: id(2), code: "AXP", name: "Axon Đẹp", active: true, count: 4 },
    { projectId: id(3), code: "BRX", name: "Brix", active: false, count: 7 }
  ];

  it("searches code and name, accents and case ignored, keeping the selected project", () => {
    expect(filterProjects(projects, "dep", null).map((project) => project.code)).toEqual(["AXP"]);
    expect(filterProjects(projects, "brx", null).map((project) => project.code)).toEqual(["BRX"]);
    expect(filterProjects(projects, "brx", id(2)).map((project) => project.code)).toEqual([
      "AXP",
      "BRX"
    ]);
    expect(filterProjects(projects, "  ", null)).toHaveLength(2);
  });

  it("“Tất cả” counts every project's jobs", () => {
    expect(allProjectsCount(projects)).toBe(11);
  });
});

describe("remembered view state", () => {
  it("collapsed months per user (localStorage), expanded jobs per tab (sessionStorage); junk is ignored", () => {
    writeCollapsedMonths(ME, new Set(["2026-09", "2026-08"]));
    expect([...readCollapsedMonths(ME)].sort()).toEqual(["2026-08", "2026-09"]);
    expect(readCollapsedMonths(id(9)).size).toBe(0);
    writeExpandedJobs(ME, new Set([id(101)]));
    expect([...readExpandedJobs(ME)]).toEqual([id(101)]);
    window.sessionStorage.setItem(
      `nesso.production.jobs.expanded.v1:${ME}`,
      JSON.stringify(["x", 3, id(102)])
    );
    expect([...readExpandedJobs(ME)]).toEqual([id(102)]);
    window.localStorage.setItem(`nesso.production.jobs.collapsedMonths.v1:${ME}`, "{oops");
    expect(readCollapsedMonths(ME).size).toBe(0);
  });

  it("the project sidebar: no choice yet (null, the page decides), then the user's choice", () => {
    expect(readSidebarHidden(ME)).toBeNull();
    writeSidebarHidden(ME, true);
    expect(readSidebarHidden(ME)).toBe(true);
    writeSidebarHidden(ME, false);
    expect(readSidebarHidden(ME)).toBe(false);
  });
});
