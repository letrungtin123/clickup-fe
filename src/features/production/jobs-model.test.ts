import { describe, expect, it } from "vitest";

import type {
  ProductionSubtask,
  ProductionTimelinePage,
  TaskLog,
  TaskTransitionOption
} from "@/contracts/production-jobs";

import {
  activeFilterCount,
  allocation,
  assignedNormalQty,
  boardColumns,
  defaultTaskDeadline,
  describeTaskLog,
  jobLines,
  jobLogRows,
  lacksQc,
  logStatusChange,
  logTimeLabel,
  logTone,
  myBoardColumns,
  statusLogDetails,
  subtaskLineIds,
  emptyJobFilters,
  expectedEarnings,
  dueDayToIso,
  formatDateTime,
  formatWorkDay,
  isoToDay,
  lineOptionalNumbers,
  receivedDayToIso,
  insertMention,
  isoToZoned,
  jobFiltersFromSearch,
  jobFiltersToSearch,
  jobPeopleStack,
  jobProgress,
  jobStatusBlockedReason,
  jobStatusFilterGroups,
  listPersonOf,
  LOG_VALUE_MAX,
  logTaskLabel,
  logValue,
  NEW_JOB_READINESS,
  taskTag,
  sameIdSet,
  sanitizeJobStatusIds,
  shortName,
  jobQueryFromFilters,
  toggleJobStatusId,
  mentionAt,
  maxDeclaredDoneQty,
  missingQtyLabel,
  qtyText,
  qtyTotalText,
  mentionedIds,
  myCreditSummary,
  needsInput,
  qcActions,
  relativeDeadline,
  splitTransitions,
  taskLineProblems,
  isWebLink,
  optionalDetailsSummary,
  processTotalChips,
  processTotalsText,
  unitPriceLabel,
  WORK_LINK_MAX,
  workLinkProblem,
  workLinkValue,
  zonedToIso,
  type Segment
} from "./jobs-model";

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VN = "Asia/Ho_Chi_Minh";
const text = (segments: Segment[]) => segments.map((segment) => segment.text).join("");
/** Every non-move capability off (PD-044 adds the quantity request / subtask ones). */
const noCapabilities = {
  canEdit: false,
  canAssign: false,
  canChangeAssignee: false,
  canEditQty: false,
  canEditQtyAssigned: false,
  canRequestQty: false,
  canDecideQtyRequest: false,
  canCreateSubtask: false,
  canDelete: false
};

describe("organization time", () => {
  it("converts a local day + time to UTC and back", () => {
    expect(zonedToIso("2026-10-09", "17:30", VN)).toBe("2026-10-09T10:30:00.000Z");
    expect(zonedToIso("2026-10-10", "00:00", VN)).toBe("2026-10-09T17:00:00.000Z");
    expect(zonedToIso("2026-10-09", "17:30", "UTC")).toBe("2026-10-09T17:30:00.000Z");
    expect(isoToZoned("2026-10-09T17:00:00.000Z", VN)).toEqual({
      day: "2026-10-10",
      time: "00:00"
    });
  });

  it("handles DST zones and rejects malformed input", () => {
    // 2026-03-29 02:30 does not exist in Paris; 12:00 is CEST (UTC+2).
    expect(zonedToIso("2026-03-29", "12:00", "Europe/Paris")).toBe("2026-03-29T10:00:00.000Z");
    expect(zonedToIso("2026-1-9", "17:30", VN)).toBeNull();
    expect(zonedToIso("2026-10-09", "25:00", VN)).toBeNull();
  });

  it("formats deadlines in the organization timezone", () => {
    const now = new Date("2026-10-10T03:00:00.000Z");
    expect(formatDateTime("2026-10-09T10:30:00.000Z", VN, false, now)).toBe("17:30 · 09/10");
    // Another year: the short form names it (BUG-PR-26).
    expect(formatDateTime("2025-12-31T10:30:00.000Z", VN, false, now)).toBe("17:30 · 31/12/2025");
    expect(formatDateTime("2027-01-02T10:30:00.000Z", VN, false, now)).toBe("17:30 · 02/01/2027");
    expect(formatDateTime("2026-10-09T10:30:00.000Z", VN, true)).toBe("17:30, 09/10/2026");
    expect(formatDateTime(null, VN)).toBe("—");
  });

  it("describes time left or overdue", () => {
    const now = new Date("2026-10-09T10:00:00.000Z");
    expect(relativeDeadline("2026-10-09T13:00:00.000Z", now)).toEqual({
      late: false,
      label: "còn 3 giờ"
    });
    expect(relativeDeadline("2026-10-07T10:00:00.000Z", now)).toEqual({
      late: true,
      label: "trễ 2 ngày"
    });
    expect(relativeDeadline("2026-10-09T10:20:00.000Z", now)).toEqual({
      late: false,
      label: "còn 20 phút"
    });
  });

  it("subtracts the QC buffer for the default task deadline", () => {
    expect(defaultTaskDeadline("2026-10-09T10:00:00.000Z", 4)).toBe("2026-10-09T06:00:00.000Z");
    expect(defaultTaskDeadline("2026-10-09T10:00:00.000Z", 0)).toBe("2026-10-09T10:00:00.000Z");
  });
});

describe("progress and allocation", () => {
  it("computes clamped percentages and over-allocation", () => {
    expect(jobProgress({ totalImages: 10, qtyAssigned: 12, qtyDone: 5, qtyChecked: 2 })).toEqual({
      assigned: 100,
      done: 50,
      checked: 20,
      overAllocated: true
    });
    expect(jobProgress({ totalImages: 0, qtyAssigned: 0, qtyDone: 0, qtyChecked: 0 }).done).toBe(0);
  });

  it("totals new lines against what is already assigned", () => {
    expect(allocation(10, 4, [3, 2])).toEqual({ adding: 5, total: 9, remaining: 1, over: false });
    expect(allocation(10, 8, [3, Number.NaN, -1])).toEqual({
      adding: 3,
      total: 11,
      remaining: -1,
      over: true
    });
    expect(
      assignedNormalQty([
        { kind: "NORMAL", qtyAssigned: 5 },
        { kind: "FB_WRONG", qtyAssigned: 2 }
      ])
    ).toBe(5);
    // PD-058: a task without a quantity counts for nothing.
    expect(
      assignedNormalQty([
        { kind: "NORMAL", qtyAssigned: 5 },
        { kind: "NORMAL", qtyAssigned: null }
      ])
    ).toBe(5);
  });

  it("words totals that leave out tasks without a quantity (PD-058)", () => {
    expect(qtyTotalText(120, 2)).toBe("120 tấm · 2 task chưa có số lượng");
    expect(qtyTotalText(1200, 0)).toBe("1.200 tấm");
    expect(missingQtyLabel(0)).toBeNull();
    expect(missingQtyLabel(3)).toBe("3 task chưa có số lượng");
    expect(qtyText(null)).toBe("chưa có số lượng");
    expect(qtyText(12)).toBe("12 tấm");
  });

  it("estimates credit, and money only for Khoán shifts with a price", () => {
    const rule = { creditPerImage: 1.5, moneyPerImage: 7000 };
    expect(expectedEarnings(rule, 4, "MONEY_IF_KPI")).toEqual({ credit: 6, money: 28000 });
    expect(expectedEarnings(rule, 4, "POINTS")).toEqual({ credit: 6, money: null });
    expect(
      expectedEarnings({ creditPerImage: 0.1, moneyPerImage: null }, 3, "MONEY_IF_KPI")
    ).toEqual({
      credit: 0.3,
      money: null
    });
    expect(expectedEarnings(null, 4, "POINTS")).toEqual({ credit: null, money: null });
  });
});

describe("task lines", () => {
  const context = {
    roles: new Map([
      [id(1), ["LEADER", "QC"] as const],
      [id(2), ["STAFF"] as const],
      [id(3), ["QC"] as const],
      [id(4), ["ACCOUNT"] as const]
    ]),
    qcProcessIds: new Set([id(90)])
  };
  const line = { assigneeId: id(2), qcId: id(3), processId: id(80), shiftId: id(70), qty: "5" };

  it("accepts a valid line", () => {
    expect(taskLineProblems(line, context)).toEqual({});
  });

  it("mirrors the API's people and catalog rules; every work task names its QC (PD-047)", () => {
    expect(taskLineProblems({ ...line, assigneeId: id(4) }, context).assignee).toBe(
      "Cần vai trò Nhân viên hoặc Leader."
    );
    expect(taskLineProblems({ ...line, qcId: id(2) }, context).qc).toBe("Người QC cần vai trò QC.");
    expect(taskLineProblems({ ...line, assigneeId: id(1), qcId: id(1) }, context).qc).toBe(
      "QC phải khác người làm."
    );
    // PD-047: a work task without a QC is refused ("Chọn QC."), whoever it is for.
    expect(taskLineProblems({ ...line, assigneeId: id(1), qcId: null }, context)).toEqual({
      qc: "Chọn QC."
    });
    // A person the caller cannot list (not in the roles map) is left to the API.
    expect(taskLineProblems({ ...line, assigneeId: id(9) }, context)).toEqual({});
    expect(taskLineProblems({ ...line, qty: "0" }, context).qty).toBe("Số lượng nguyên ≥ 1.");
    expect(taskLineProblems({ ...line, qty: "2.5" }, context).qty).toBe("Số lượng nguyên ≥ 1.");
    expect(taskLineProblems({ ...line, qty: "1000001" }, context).qty).toBe("Số lượng nguyên ≥ 1.");
    // PD-058: the quantity is optional ("chưa có số lượng" until the worker fills it in).
    expect(taskLineProblems({ ...line, qty: "" }, context)).toEqual({});
    expect(taskLineProblems({ ...line, qty: "  " }, context)).toEqual({});
    expect(
      Object.keys(
        taskLineProblems(
          { assigneeId: null, qcId: null, processId: null, shiftId: null, qty: "" },
          context
        )
      )
    ).toEqual(["assignee", "qc", "process", "shift"]);
  });

  it("a Checking line (PD-037) is done by a QC person (or Leader) and has no QC of its own", () => {
    const checking = { ...line, processId: id(90), assigneeId: id(3), qcId: null };
    expect(taskLineProblems(checking, context)).toEqual({});
    expect(taskLineProblems({ ...checking, assigneeId: id(1) }, context)).toEqual({});
    expect(taskLineProblems({ ...checking, assigneeId: id(2) }, context).assignee).toBe(
      "Task Checking cần người có vai trò QC (hoặc Leader)."
    );
    expect(taskLineProblems({ ...checking, qcId: id(1) }, context).qc).toBe(
      "Task Checking không có QC riêng."
    );
  });

  it("checks the work-log days and the optional numbers", () => {
    const dated = {
      ...line,
      receivedDay: "2026-10-12",
      dueDay: "2026-10-14",
      errorQty: "",
      otHours: ""
    };
    expect(taskLineProblems(dated, context)).toEqual({});
    expect(taskLineProblems({ ...dated, receivedDay: null }, context).received).toBe(
      "Chọn ngày nhận."
    );
    expect(taskLineProblems({ ...dated, dueDay: "2026-10-11" }, context).due).toBe(
      "Ngày giao phải từ ngày nhận trở đi."
    );
    expect(taskLineProblems({ ...dated, errorQty: "-1" }, context).errorQty).toBe("Số nguyên ≥ 0.");
    expect(taskLineProblems({ ...dated, otHours: "1,5" }, context)).toEqual({});
    expect(taskLineProblems({ ...dated, otHours: "1,25" }, context).otHours).toBe(
      "Từ 0,1 đến 24 giờ."
    );
    expect(taskLineProblems({ ...dated, otHours: "25" }, context).otHours).toBe(
      "Từ 0,1 đến 24 giờ."
    );
    expect(lineOptionalNumbers({ errorQty: "3", otHours: "1,5" })).toEqual({
      errorQty: 3,
      otHours: 1.5
    });
    expect(lineOptionalNumbers({ errorQty: " ", otHours: "" })).toEqual({
      errorQty: null,
      otHours: null
    });
  });

  it("Link chia việc (PD-040): any single-line text up to 2,000 characters; web links are told apart", () => {
    for (const value of [
      "",
      "Y:\\Client\\2026\\Batch 1",
      "\\\\server\\share\\Lô 7",
      "https://x.example/f"
    ]) {
      expect(taskLineProblems({ ...line, workLink: value }, context)).toEqual({});
    }
    expect(taskLineProblems({ ...line, workLink: "a\tb" }, context).workLink).toBe(
      "Không được chứa ký tự điều khiển (tab, xuống dòng)."
    );
    expect(workLinkProblem(`  ${"x".repeat(WORK_LINK_MAX)}  `)).toBeUndefined();
    expect(workLinkProblem("x".repeat(WORK_LINK_MAX + 1))).toBe("Tối đa 2.000 ký tự.");
    expect(workLinkValue("  Y:\\A  ")).toBe("Y:\\A");
    expect(workLinkValue("   ")).toBeNull();
    expect(isWebLink("https://drive.example.com/f/1")).toBe(true);
    expect(isWebLink(" HTTP://intranet/x")).toBe(true);
    expect(isWebLink("Y:\\Client\\Batch 1")).toBe(false);
    expect(isWebLink("\\\\server\\share")).toBe(false);
    expect(isWebLink("javascript:alert(1)")).toBe(false);
    expect(isWebLink("www.example.com")).toBe(false);
  });

  it("summarises the filled optional details of a collapsed line, in form order", () => {
    expect(optionalDetailsSummary({})).toBe("");
    expect(optionalDetailsSummary({ errorQty: " ", otHours: "", workLink: "  ", note: "" })).toBe(
      ""
    );
    expect(
      optionalDetailsSummary(
        { qcName: "QC C", errorQty: "3", otHours: "1,5", workLink: "Y:\\A", note: "x" },
        ["Độ khó: Khó", "2 tag"]
      )
    ).toBe("QC: QC C · 3 hình lỗi · OT 1,5 giờ · Link · Ghi chú · Độ khó: Khó · 2 tag");
    expect(optionalDetailsSummary({ qcName: "QC C", workLink: "https://x", note: "y" })).toBe(
      "QC: QC C · Link · Ghi chú"
    );
  });

  it("labels the unit price of a line; money only on a Khoán shift with a price", () => {
    const rule = { creditPerImage: 5.5, moneyPerImage: 2000 };
    expect(unitPriceLabel(null, "POINTS")).toBeNull();
    expect(unitPriceLabel(rule, "POINTS")).toBe("5,5 điểm/tấm");
    expect(unitPriceLabel({ creditPerImage: 2, moneyPerImage: null }, "MONEY_IF_KPI")).toBe(
      "2 điểm/tấm"
    );
    expect(unitPriceLabel(rule, "MONEY_IF_KPI")?.replace(/\s/g, " ")).toBe(
      "5,5 điểm/tấm · 2.000 ₫/tấm"
    );
  });
});

describe("work-log days (PD-035)", () => {
  it("Ngày nhận is the start of the day and Ngày giao its end, in the organization timezone", () => {
    expect(receivedDayToIso("2026-10-12", "Asia/Ho_Chi_Minh")).toBe("2026-10-11T17:00:00.000Z");
    expect(dueDayToIso("2026-10-12", "Asia/Ho_Chi_Minh")).toBe("2026-10-12T16:59:00.000Z");
    expect(isoToDay("2026-10-12T16:59:00.000Z", "Asia/Ho_Chi_Minh")).toBe("2026-10-12");
    expect(
      formatWorkDay(
        "2026-10-12T16:59:00.000Z",
        "Asia/Ho_Chi_Minh",
        new Date("2026-10-13T00:00:00Z")
      )
    ).toBe("12/10");
    expect(
      formatWorkDay(
        "2025-10-12T16:59:00.000Z",
        "Asia/Ho_Chi_Minh",
        new Date("2026-10-13T00:00:00Z")
      )
    ).toBe("12/10/2025");
    expect(formatWorkDay(null, "Asia/Ho_Chi_Minh")).toBe("—");
  });
});

describe("transitions", () => {
  const option = (to: number, extra: Partial<TaskTransitionOption> = {}): TaskTransitionOption => ({
    toStatusId: id(to),
    requiresNote: false,
    asksQty: false,
    asksOtHours: false,
    override: false,
    ...extra
  });

  it("separates ADMIN overrides and knows when input is needed", () => {
    const split = splitTransitions([option(1), option(2, { override: true, requiresNote: true })]);
    expect(split.normal.map((item) => item.toStatusId)).toEqual([id(1)]);
    expect(split.overrides.map((item) => item.toStatusId)).toEqual([id(2)]);
    const fresh = { doneAt: null };
    const doneBefore = { doneAt: "2026-10-09T03:00:00.000Z" };
    expect(needsInput(fresh, option(1))).toBe(false);
    // Owner 2026-10-15: Done asks nothing — the quantities already on the line / subtasks are used.
    expect(needsInput(fresh, option(1, { asksQty: true, asksOtHours: true }))).toBe(false);
    expect(needsInput(doneBefore, option(1, { asksQty: true }))).toBe(false);
    expect(needsInput(fresh, option(1, { requiresNote: true }))).toBe(true);
    expect(needsInput(fresh, option(2, { override: true, requiresNote: true }))).toBe(true);
  });

  it("finds Start, Pass and Fail among the task's own options (PD-044)", () => {
    // Cần sửa lại (2) · Chờ QC (5) · Đang check (6) · Đã check (7).
    const statuses = [
      { id: id(10), sortOrder: 2, countsChecked: false },
      { id: id(11), sortOrder: 5, countsChecked: false },
      { id: id(13), sortOrder: 6, countsChecked: false },
      { id: id(12), sortOrder: 7, countsChecked: true }
    ];
    const task = {
      status: { id: id(11), code: "WAITING_QC", name: "Chờ QC", color: "amber" as const },
      capabilities: {
        transitions: [
          option(13),
          option(12),
          option(10, { requiresNote: true }),
          option(12, { override: true })
        ],
        ...noCapabilities
      }
    };
    const actions = qcActions(task, statuses);
    expect(actions.start?.toStatusId).toBe(id(13));
    expect(actions.pass?.toStatusId).toBe(id(12));
    expect(actions.fail?.toStatusId).toBe(id(10));
    // Đang check: Đã check or Cần sửa lại, nothing to start.
    const checking = qcActions(
      {
        status: { id: id(13), code: "QC_CHECKING", name: "Đang check", color: "purple" },
        capabilities: {
          ...noCapabilities,
          transitions: [option(12), option(10, { requiresNote: true })]
        }
      },
      statuses
    );
    expect([checking.start, checking.pass?.toStatusId, checking.fail?.toStatusId]).toEqual([
      null,
      id(12),
      id(10)
    ]);
    expect(
      qcActions({ ...task, capabilities: { ...task.capabilities, transitions: [] } }, statuses)
    ).toEqual({
      pass: null,
      fail: null,
      start: null
    });
  });
});

describe("board columns", () => {
  it("keeps workflow order, empty active columns and archived ones only when used", () => {
    const statuses = [
      { id: id(2), name: "B", color: "sky" as const, code: "B", sortOrder: 2, active: true },
      { id: id(1), name: "A", color: "sky" as const, code: "A", sortOrder: 1, active: true },
      { id: id(3), name: "Old", color: "sky" as const, code: "OLD", sortOrder: 3, active: false },
      { id: id(4), name: "Gone", color: "sky" as const, code: "GONE", sortOrder: 4, active: false }
    ];
    const tasks = [{ status: { id: id(2) } }, { status: { id: id(3) } }, { status: { id: id(2) } }];
    expect(
      boardColumns(tasks, statuses).map((column) => [column.status.code, column.tasks.length])
    ).toEqual([
      ["A", 0],
      ["B", 2],
      ["OLD", 1]
    ]);
  });

  it("shows Cần sửa lại / Đang check (PD-044) and later statuses only when they hold or can receive a card", () => {
    const flow = [
      ["ASSIGNED", 1, false],
      ["REWORK", 2, false],
      ["PROCESSING", 3, false],
      ["DONE", 4, false],
      ["WAITING_QC", 5, false],
      ["QC_CHECKING", 6, false],
      ["CHECKED", 7, true],
      ["COMPLETE", 8, false]
    ] as const;
    const statuses = flow.map(([code, sortOrder, countsChecked]) => ({
      id: id(100 + sortOrder),
      name: code,
      color: "sky" as const,
      code,
      sortOrder,
      active: true,
      countsChecked
    }));
    const card = (statusOrder: number, moves: number[] = []) => ({
      status: { id: id(100 + statusOrder) },
      capabilities: {
        transitions: moves.map((order) => ({
          toStatusId: id(100 + order),
          requiresNote: false,
          asksQty: false,
          asksOtHours: false,
          override: false
        }))
      }
    });
    const codes = (tasks: ReturnType<typeof card>[]) =>
      myBoardColumns(tasks, statuses).map((column) => column.status.code);
    // A worker's card in progress: the main flow up to Đã check, no detour columns.
    expect(codes([card(3, [4])])).toEqual([
      "ASSIGNED",
      "PROCESSING",
      "DONE",
      "WAITING_QC",
      "CHECKED"
    ]);
    // A line sent back holds "Cần sửa lại"; a QC's waiting card can be moved to "Đang check" / back to rework.
    expect(codes([card(2, [3])])).toContain("REWORK");
    expect(codes([card(5, [6, 7, 2])])).toEqual([
      "ASSIGNED",
      "REWORK",
      "PROCESSING",
      "DONE",
      "WAITING_QC",
      "QC_CHECKING",
      "CHECKED"
    ]);
    // Complete shows only with a card in it.
    expect(codes([card(8)]).at(-1)).toBe("COMPLETE");
  });
});

describe("lines and subtasks (PD-044)", () => {
  const subtask = (n: number, extra: Partial<ProductionSubtask> = {}): ProductionSubtask => ({
    id: id(n),
    number: n,
    code: `${n}a`,
    process: { id: id(80), name: "Mannequin" },
    qtyAssigned: 3,
    qtyDone: null,
    reason: "Ảnh cần ghép nền",
    createdBy: null,
    createdAt: "2026-10-14T03:00:00.000Z",
    ...extra
  });
  const row = (
    n: number,
    extra: Partial<{
      isSubtask: boolean;
      parentTaskId: string | null;
      subtasks: ProductionSubtask[];
    }> = {}
  ) => ({ id: id(n), number: n, isSubtask: false, parentTaskId: null, subtasks: [], ...extra });

  it("nests subtasks under their line and never lists them as lines", () => {
    const line = row(1, { subtasks: [subtask(11), subtask(12)] });
    const tasks = [
      line,
      row(11, { isSubtask: true, parentTaskId: id(1) }),
      row(2),
      row(12, { isSubtask: true, parentTaskId: id(1) }),
      // Its line is not in the list: kept visible rather than lost.
      row(31, { isSubtask: true, parentTaskId: id(30) })
    ];
    expect(
      jobLines(tasks).map((entry) => [entry.line.number, entry.subtasks.map((s) => s.number)])
    ).toEqual([
      [1, [11, 12]],
      [2, []],
      [31, []]
    ]);
    expect(Object.fromEntries(subtaskLineIds(tasks))).toEqual({
      [id(11)]: id(1),
      [id(12)]: id(1),
      [id(31)]: id(30)
    });
  });

  it("flags a Done work line without QC", () => {
    const line = {
      isSubtask: false,
      qc: null,
      process: { id: id(80), name: "Retouch", isQc: false },
      status: { id: id(4), code: "DONE", name: "Done", color: "green" as const }
    };
    expect(lacksQc(line)).toBe(true);
    expect(
      lacksQc({ ...line, qc: { id: id(2), displayName: "QC", email: null, avatarUrl: null } })
    ).toBe(false);
    // A Checking line has no QC by design; a line still in progress is not blocking yet.
    expect(lacksQc({ ...line, process: { ...line.process, isQc: true } })).toBe(false);
    expect(lacksQc({ ...line, status: { ...line.status, code: "PROCESSING" } })).toBe(false);
  });

  it("names a line or a subtask by its code (PD-045)", () => {
    expect(taskTag({ code: "1216" })).toBe("#1216");
    expect(taskTag({ code: "1216a" })).toBe("#1216a");
  });
});

describe("job status readiness (PD-045)", () => {
  const done = { id: id(71), requiresAllChecked: true };
  const working = { id: id(72), requiresAllChecked: false };
  const job = (taskCount: number, uncheckedTaskCount: number) => ({
    taskCount,
    uncheckedTaskCount
  });

  it("blocks a status that needs every line checked until the job is ready", () => {
    expect(jobStatusBlockedReason(done, job(0, 0), id(72))).toBe("Chưa có task");
    expect(jobStatusBlockedReason(done, job(5, 3), id(72))).toBe("Còn 3 task chưa check");
    expect(jobStatusBlockedReason(done, job(1500, 1200))).toBe("Còn 1.200 task chưa check");
    expect(jobStatusBlockedReason(done, job(5, 0), id(72))).toBeNull();
    // A job being created has no line yet.
    expect(jobStatusBlockedReason(done, NEW_JOB_READINESS)).toBe("Chưa có task");
  });

  it("never blocks other statuses nor the job's current one", () => {
    expect(jobStatusBlockedReason(working, job(0, 0))).toBeNull();
    expect(jobStatusBlockedReason(done, job(5, 2), id(71))).toBeNull();
  });
});

describe("job filters", () => {
  it("round-trips through the URL and ignores junk", () => {
    const filters = {
      ...emptyJobFilters,
      q: " batch ",
      projectId: id(5),
      from: "2026-10-01",
      late: true
    };
    const params = jobFiltersToSearch(filters);
    expect(params.toString()).toBe(`q=batch&project=${id(5)}&from=2026-10-01&late=1`);
    expect(jobFiltersFromSearch(params)).toEqual({ ...filters, q: "batch" });
    expect(
      jobFiltersFromSearch(new URLSearchParams("project=nope&from=10/01/2026&late=yes"))
    ).toEqual(emptyJobFilters);
    expect(activeFilterCount(filters)).toBe(3);
  });

  it("keeps the staff member (assignee or QC) in the URL and sends it as personId", () => {
    const filters = { ...emptyJobFilters, leaderId: id(7), personId: id(8) };
    const params = jobFiltersToSearch(filters);
    expect(params.toString()).toBe(`leader=${id(7)}&person=${id(8)}`);
    expect(jobFiltersFromSearch(params)).toEqual(filters);
    expect(jobFiltersFromSearch(new URLSearchParams("person=nope")).personId).toBeNull();
    expect(activeFilterCount(filters)).toBe(2);
    expect(jobQueryFromFilters(filters, VN)).toMatchObject({ leaderId: id(7), personId: id(8) });
    expect(jobQueryFromFilters(emptyJobFilters, VN).personId).toBeUndefined();
  });

  it("per-person view: whose numbers the loaded page holds, and the short name", () => {
    const worker = (n: number, displayName: string) => ({
      user: { id: id(n), displayName, email: null, avatarUrl: null },
      qty: 10,
      taskCount: 1
    });
    const jobs = [{ people: { workers: [worker(8, "Row Name")], qc: [] } }];
    const totals = (n: number) => ({
      personTotals: {
        personId: id(n),
        jobCount: 1,
        taskCount: 1,
        qtyAssigned: 10,
        qtyDone: 10,
        qtyChecked: 0
      }
    });
    const members = (personId: string) => (personId === id(9) ? "Member Name" : undefined);
    expect(listPersonOf(totals(9), jobs, members)).toEqual({
      id: id(9),
      displayName: "Member Name"
    });
    // Not a current member (left the company): the name comes from the rows.
    expect(listPersonOf(totals(8), jobs, members)?.displayName).toBe("Row Name");
    expect(listPersonOf(totals(7), [], members)?.displayName).toBe("Nhân viên");
    expect(listPersonOf({ personTotals: null }, jobs, members)).toBeNull();
    expect(listPersonOf(undefined, jobs, members)).toBeNull();
    expect(shortName("Bùi Thị Hoa")).toBe("Hoa");
    expect(shortName("  Minh  ")).toBe("Minh");
  });

  it("stacks at most 4 people, then +N", () => {
    expect(jobPeopleStack([1, 2, 3])).toEqual({ shown: [1, 2, 3], hidden: 0 });
    expect(jobPeopleStack([1, 2, 3, 4])).toEqual({ shown: [1, 2, 3, 4], hidden: 0 });
    expect(jobPeopleStack([1, 2, 3, 4, 5, 6])).toEqual({ shown: [1, 2, 3, 4], hidden: 2 });
    expect(jobPeopleStack([])).toEqual({ shown: [], hidden: 0 });
  });

  it("“Tổng tấm” per process: chips in the API's order, then +N with the rest as its tooltip (PD-048)", () => {
    const totals = [
      { process: { id: id(41), name: "Normal Retouch" }, qty: 16 },
      { process: { id: id(42), name: "Premium Retouch" }, qty: 15 },
      { process: { id: id(43), name: "Light Retouch" }, qty: 4 },
      { process: { id: id(44), name: "Cắt nền" }, qty: 1200 }
    ];
    expect(processTotalsText(totals.slice(0, 3))).toBe(
      "Normal Retouch 16 · Premium Retouch 15 · Light Retouch 4"
    );
    const two = processTotalChips(totals, 2);
    expect(two.shown.map((total) => total.process.name)).toEqual([
      "Normal Retouch",
      "Premium Retouch"
    ]);
    expect(two.hidden).toBe(2);
    expect(two.hiddenText).toBe("Light Retouch 4 · Cắt nền 1.200");
    expect(two.text).toBe(
      "Normal Retouch 16 · Premium Retouch 15 · Light Retouch 4 · Cắt nền 1.200"
    );
    expect(processTotalChips(totals).hidden).toBe(0);
    expect(processTotalChips(totals.slice(0, 2), 2)).toMatchObject({ hidden: 0, hiddenText: "" });
    expect(processTotalChips([], 2)).toEqual({ shown: [], hidden: 0, hiddenText: "", text: "" });
  });

  it("carries several tags and custom-field filters (old single-tag links still work)", () => {
    const old = jobFiltersFromSearch(new URLSearchParams(`tag=${id(60)}`));
    expect(old.custom.tagIds).toEqual([id(60)]);
    const filters = {
      ...emptyJobFilters,
      custom: {
        tagIds: [id(60), id(61)],
        fields: { uu_tien: { values: ["gap", "__empty__"], from: null, to: null } }
      }
    };
    const params = jobFiltersToSearch(filters);
    expect(params.getAll("tag")).toEqual([id(60), id(61)]);
    expect(params.getAll("cf.uu_tien")).toEqual(["gap", "__empty__"]);
    expect(jobFiltersFromSearch(params)).toEqual(filters);
    expect(activeFilterCount(filters)).toBe(2);
    expect(jobQueryFromFilters(filters, VN)).toMatchObject({
      tagId: [id(60), id(61)],
      "cf.uu_tien": ["gap", "__empty__"]
    });
  });

  it("filters by manual job statuses (PD-038): repeated in the URL, counted once, sent as jobStatusId", () => {
    const filters = { ...emptyJobFilters, jobStatusIds: [id(72), id(70)], late: true };
    const params = jobFiltersToSearch(filters);
    expect(params.getAll("jobStatus")).toEqual([id(72), id(70)]);
    expect(params.toString()).toBe(`jobStatus=${id(72)}&jobStatus=${id(70)}&late=1`);
    expect(jobFiltersFromSearch(params)).toEqual(filters);
    expect(activeFilterCount(filters)).toBe(2);
    // Any of them, sorted (one cache entry per choice) and repeated by queryPath.
    expect(jobQueryFromFilters(filters, VN).jobStatusId).toEqual([id(70), id(72)]);
    expect(jobQueryFromFilters(emptyJobFilters, VN).jobStatusId).toBeUndefined();
    expect(jobQueryFromFilters(filters, VN)).not.toHaveProperty("statusId");
  });

  it("keeps only valid, distinct job status ids and ignores the old derived `status` parameter", () => {
    const parsed = jobFiltersFromSearch(
      new URLSearchParams(
        `status=${id(1)}&jobStatus=nope&jobStatus=${id(70)}&jobStatus=${id(70)}&jobStatus=&jobStatus=${id(71)}`
      )
    );
    expect(parsed.jobStatusIds).toEqual([id(70), id(71)]);
    expect(parsed).not.toHaveProperty("statusId");
    expect(jobFiltersFromSearch(new URLSearchParams(`status=${id(1)}`))).toEqual(emptyJobFilters);
    expect(activeFilterCount(emptyJobFilters)).toBe(0);
    // At most the catalog limit (50) from a crafted link.
    const many = new URLSearchParams(
      Array.from({ length: 60 }, (_, index) => `jobStatus=${id(100 + index)}`).join("&")
    );
    expect(jobFiltersFromSearch(many).jobStatusIds).toHaveLength(50);
  });

  it("drops deleted job statuses once the catalog is known", () => {
    const ids = [id(70), id(79)];
    expect(sanitizeJobStatusIds(ids, undefined)).toEqual(ids);
    expect(sanitizeJobStatusIds(ids, new Set([id(70), id(71)]))).toEqual([id(70)]);
    expect(sanitizeJobStatusIds(ids, new Set())).toEqual([]);
  });

  it("groups the status filter (open first, closed last) and keeps choices in catalog order", () => {
    const catalog = [
      { id: id(70), isClosed: false },
      { id: id(75), isClosed: true },
      { id: id(71), isClosed: false }
    ];
    const groups = jobStatusFilterGroups(catalog);
    expect(groups.openIds).toEqual([id(70), id(71)]);
    expect(groups.closedIds).toEqual([id(75)]);
    expect([...groups.open, ...groups.closed].map((status) => status.id)).toEqual([
      id(70),
      id(71),
      id(75)
    ]);
    expect(toggleJobStatusId([id(75)], id(70), catalog)).toEqual([id(70), id(75)]);
    expect(toggleJobStatusId([id(70), id(75)], id(70), catalog)).toEqual([id(75)]);
    // A status missing from the catalog (still loading) goes last.
    expect(toggleJobStatusId([id(99)], id(71), catalog)).toEqual([id(71), id(99)]);
    expect(sameIdSet([id(71), id(70)], groups.openIds)).toBe(true);
    expect(sameIdSet([id(70)], groups.openIds)).toBe(false);
    expect(sameIdSet([], [])).toBe(true);
  });

  it("turns the day range into [from, to+1) instants in the organization timezone", () => {
    const query = jobQueryFromFilters(
      { ...emptyJobFilters, from: "2026-10-01", to: "2026-10-31", archived: true },
      VN
    );
    expect(query.deadlineFrom).toBe("2026-09-30T17:00:00.000Z");
    expect(query.deadlineTo).toBe("2026-10-31T17:00:00.000Z");
    expect(query.includeArchived).toBe("true");
    expect(query.late).toBeUndefined();
  });
});

describe("timeline sentences", () => {
  const names = {
    user: (value: string) => ({ [id(1)]: "Leader A", [id(2)]: "NV B", [id(3)]: "QC C" })[value],
    process: (value: string) => (value === id(80) ? "Retouch" : undefined),
    shift: () => undefined,
    timeZone: VN
  };
  const log = (
    action: TaskLog["action"],
    fromValue: Record<string, unknown> | null,
    toValue: Record<string, unknown> | null
  ) => ({
    action,
    fromValue,
    toValue,
    taskNumber: 7,
    taskCode: "7"
  });

  it("describes creation with the over-allocation warning", () => {
    const segments = describeTaskLog(
      log("CREATE", null, {
        assigneeId: id(2),
        qcId: id(3),
        qtyAssigned: 5,
        kind: "NORMAL",
        warning: "Vượt tổng tấm"
      }),
      names
    );
    expect(text(segments)).toBe("đã tạo task #7 cho NV B · 5 tấm · QC QC C — Vượt tổng tấm");
    expect(segments.at(-1)?.tone).toBe("warning");
  });

  it("describes status moves with Done quantity, QC fail and overrides", () => {
    expect(
      text(
        describeTaskLog(
          log("STATUS", { name: "Đang làm" }, { name: "Done", qtyDone: 5, otHours: 1.5 }),
          names
        )
      )
    ).toBe("chuyển #7 từ Đang làm sang Done · 5 tấm · 1,5 giờ OT");
    expect(
      text(
        describeTaskLog(
          log("STATUS", { name: "Đang check" }, { name: "Cần sửa lại", qcFail: true }),
          names
        )
      )
    ).toBe("chuyển #7 từ Đang check sang Cần sửa lại · QC yêu cầu sửa lại");
    expect(
      text(describeTaskLog(log("STATUS", { name: "A" }, { name: "B", override: true }), names))
    ).toContain("ngoài luồng");
  });

  it("PD-058: a quantity filled in reads “— → N” (directly: a FIELD row; at Done: on the STATUS row)", () => {
    expect(
      text(
        describeTaskLog(
          log(
            "STATUS",
            { name: "Đang làm", qtyAssigned: null },
            { name: "Done", qtyAssigned: 120, qtyDone: 120 }
          ),
          names
        )
      )
    ).toBe("chuyển #7 từ Đang làm sang Done · số lượng — → 120 tấm");
    expect(
      text(describeTaskLog(log("FIELD", { qtyAssigned: null }, { qtyAssigned: 120 }), names))
    ).toBe("sửa #7: số lượng — → 120 tấm");
    // Created without a quantity: no "· N tấm".
    expect(
      text(describeTaskLog(log("CREATE", null, { assigneeId: null, qtyAssigned: null }), names))
    ).toBe("đã tạo task #7 cho không ai");
  });

  it("reads a status row's from → to and its details for the job log (PD-044)", () => {
    const row = log(
      "STATUS",
      { statusId: id(41), code: "WAITING_QC", name: "Chờ QC" },
      { statusId: id(42), code: "REWORK", name: "Cần sửa lại", qcFail: true }
    );
    expect(logStatusChange(row)).toEqual({
      from: { id: id(41), code: "WAITING_QC", name: "Chờ QC" },
      to: { id: id(42), code: "REWORK", name: "Cần sửa lại" }
    });
    expect(logStatusChange(log("QTY", null, null))).toBeNull();
    expect(logTone(row)).toBe("danger");
    expect(text(statusLogDetails({ qtyDone: 5, qcFail: true }))).toBe(
      " · 5 tấm · QC yêu cầu sửa lại"
    );
    expect(text(statusLogDetails({ qtyDone: 5, qcFail: true }, { withQcFail: false }))).toBe(
      " · 5 tấm"
    );
  });

  it("describes subtasks created, edited and deleted on the line (PD-044)", () => {
    // Rows written before subtask codes (PD-045) only hold the number.
    const base = { subtaskId: id(50), subtaskNumber: 1301, processId: id(80) };
    expect(
      text(
        describeTaskLog(
          log("SUBTASK", null, {
            ...base,
            op: "created",
            processName: "Mannequin Retouch",
            qtyAssigned: 3,
            parentQtyAssigned: 7
          }),
          names
        )
      )
    ).toBe("đã tạo subtask #1301 · Mannequin Retouch · 3 tấm từ task #7 (task còn 7 tấm)");
    // No process name stored: the catalog names it.
    expect(
      text(describeTaskLog(log("SUBTASK", null, { ...base, op: "created", qtyAssigned: 2 }), names))
    ).toBe("đã tạo subtask #1301 · Retouch · 2 tấm từ task #7");
    expect(
      text(
        describeTaskLog(
          log(
            "SUBTASK",
            { processName: "Mannequin", qtyAssigned: 3 },
            { ...base, op: "updated", processName: "Ghép nền", qtyAssigned: 5 }
          ),
          names
        )
      )
    ).toBe("đã sửa subtask #1301 của task #7: công đoạn Mannequin → Ghép nền; 3 tấm → 5 tấm");
    // PD-058: a subtask filled in from "no quantity".
    expect(
      text(
        describeTaskLog(
          log(
            "SUBTASK",
            { processName: "Mannequin", qtyAssigned: null },
            { ...base, op: "updated", processName: "Mannequin", qtyAssigned: 4 }
          ),
          names
        )
      )
    ).toBe("đã sửa subtask #1301 của task #7: — → 4 tấm");
    expect(
      text(
        describeTaskLog(
          log("SUBTASK", null, {
            ...base,
            op: "deleted",
            processName: "Mannequin",
            qtyAssigned: 3,
            parentQtyAssigned: 10
          }),
          names
        )
      )
    ).toBe("đã xoá subtask #1301 · Mannequin · 3 tấm — trả số tấm về task #7 (nay 10 tấm)");
  });

  it("names tasks and subtasks by their code (PD-045), the number on older rows", () => {
    const created = {
      subtaskId: id(50),
      subtaskNumber: 1301,
      subtaskCode: "1216a",
      op: "created",
      processName: "Ghép nền",
      qtyAssigned: 2
    };
    expect(
      text(describeTaskLog({ ...log("SUBTASK", null, created), taskCode: "1216" }, names))
    ).toBe("đã tạo subtask #1216a · Ghép nền · 2 tấm từ task #1216");
    expect(
      text(describeTaskLog({ ...log("NOTE", null, { note: "x" }), taskCode: "1216a" }, names))
    ).toBe("cập nhật ghi chú của #1216a");
    expect(logTaskLabel({ taskCode: "1216a", taskNumber: 1301 })).toBe("#1216a");
    expect(logTaskLabel({ taskCode: null, taskNumber: 1301 })).toBe("#1301");
    expect(logTaskLabel({ taskCode: null, taskNumber: null })).toBeNull();
  });

  it("describes quantity requests and their decisions (PD-044)", () => {
    const request = { requestId: id(60), fromQty: 10, toQty: 12 };
    const sentence = (op: string) =>
      text(describeTaskLog(log("QTY_REQUEST", null, { ...request, op }), names));
    expect(sentence("requested")).toBe("đề nghị sửa số tấm giao #7: 10 → 12 tấm");
    expect(sentence("approved")).toBe("đã duyệt đề nghị sửa số tấm giao #7: 10 → 12 tấm");
    expect(sentence("rejected")).toBe("đã từ chối đề nghị sửa số tấm giao #7: 10 → 12 tấm");
    expect(sentence("cancelled")).toBe("đã huỷ đề nghị sửa số tấm giao #7 (10 → 12 tấm)");
    expect(
      ["requested", "approved", "rejected", "cancelled"].map((op) =>
        logTone(log("QTY_REQUEST", null, { ...request, op }))
      )
    ).toEqual(["warning", "success", "danger", null]);
  });

  it("describes quantity, assignment, note and field edits", () => {
    expect(text(describeTaskLog(log("QTY", { qtyDone: 5 }, { qtyDone: 4 }), names))).toBe(
      "sửa số tấm hoàn thành của #7: 5 → 4 tấm"
    );
    expect(
      text(
        describeTaskLog(
          log("ASSIGN", { assigneeId: id(2), qcId: null }, { assigneeId: id(2), qcId: id(3) }),
          names
        )
      )
    ).toBe("giao lại #7: QC không ai → QC C");
    expect(text(describeTaskLog(log("NOTE", { note: "x" }, { note: null }), names))).toBe(
      "xóa ghi chú của #7"
    );
    expect(
      text(
        describeTaskLog(
          log(
            "FIELD",
            { qtyAssigned: 5, processId: id(81) },
            { qtyAssigned: 6, processId: id(80) }
          ),
          names
        )
      )
    ).toBe("sửa #7: số lượng 5 tấm → 6 tấm; quy trình quy trình khác → Retouch");
  });

  it("shows the old and the new Link chia việc (PD-045)", () => {
    const sentence = (from: unknown, to: unknown) =>
      text(describeTaskLog(log("FIELD", { workLink: from }, { workLink: to }), names));
    expect(sentence("//old/path", "//new/path")).toBe(
      "sửa #7: link chia việc “//old/path” → “//new/path”"
    );
    expect(sentence(null, "Y:\\Client\\Batch 1")).toBe(
      "sửa #7: link chia việc trống → “Y:\\Client\\Batch 1”"
    );
    expect(sentence("https://drive.example.com/f/1", null)).toBe(
      "sửa #7: link chia việc “https://drive.example.com/f/1” → trống"
    );
    expect(
      text(
        describeTaskLog(
          log("FIELD", { errorQty: null, workLink: null }, { errorQty: 2, workLink: "Y:\\A" }),
          names
        )
      )
    ).toBe("sửa #7: hình lỗi — → 2; link chia việc trống → “Y:\\A”");
  });

  it("shortens a long link in the middle and keeps it whole in the tooltip (PD-045)", () => {
    const long = `//nas/Khach hang/VD JOB-1/${"thu-muc-".repeat(8)}Batch 12/Done`;
    const segments = describeTaskLog(log("FIELD", { workLink: "//a" }, { workLink: long }), names);
    const value = segments.at(-1);
    expect(value?.title).toBe(long);
    expect(value?.text.startsWith("“//nas/Khach")).toBe(true);
    expect(value?.text.endsWith("Batch 12/Done”")).toBe(true);
    expect(value?.text).toContain("…");
    expect(value?.text.length).toBe(LOG_VALUE_MAX + 2);
    expect(logValue("  ")).toEqual({ text: "trống" });
    expect(logValue("//a")).toEqual({ text: "“//a”", strong: true });
  });

  const orderField = {
    id: id(70),
    entity: "JOB" as const,
    key: "ma_don_hang",
    label: "Mã đơn hàng",
    type: "TEXT" as const,
    options: [],
    required: false,
    showInTable: true,
    sortOrder: 0,
    active: true
  };
  const levelField = {
    ...orderField,
    id: id(71),
    entity: "TASK" as const,
    key: "do_kho",
    label: "Độ khó",
    type: "SELECT" as const,
    options: [
      { value: "de", label: "Dễ" },
      { value: "kho", label: "Khó" }
    ]
  };
  const richNames = {
    ...names,
    tag: (value: string) => ({ [id(60)]: "Gấp", [id(61)]: "VIP" })[value],
    field: (entity: "JOB" | "TASK", key: string) =>
      [orderField, levelField].find((field) => field.entity === entity && field.key === key)
  };

  it("describes job edits (JOB rows) field by field", () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const segments = describeTaskLog(
      {
        action: "JOB",
        taskNumber: null,
        taskCode: null,
        fromValue: {
          deadline: `${year}-10-12T10:00:00.000Z`,
          leaderId: id(1),
          leaderName: "Leader A",
          customValues: { ma_don_hang: "ĐH1", uu_tien: "gap" },
          tagIds: [id(61)],
          totalImages: 100
        },
        toValue: {
          deadline: `${year}-10-13T05:00:00.000Z`,
          leaderId: id(2),
          leaderName: "Leader B",
          customValues: { ma_don_hang: "ĐH2", uu_tien: "gap" },
          tagIds: [id(60)],
          totalImages: 1200
        }
      },
      richNames
    );
    expect(text(segments)).toBe(
      "đã sửa job: ngày giao 12/10 17:00 → 13/10 12:00; Leader Leader A → Leader B; " +
        "Mã đơn hàng ĐH1 → ĐH2; thêm tag Gấp; bỏ tag VIP; tổng tấm 100 → 1.200"
    );
    expect(
      text(
        describeTaskLog(
          {
            action: "JOB",
            taskNumber: null,
            taskCode: null,
            fromValue: { archived: false },
            toValue: { archived: true }
          },
          richNames
        )
      )
    ).toBe("đã lưu trữ job");
    expect(
      text(
        describeTaskLog(
          {
            action: "JOB",
            taskNumber: null,
            taskCode: null,
            fromValue: { driveLink: null, name: null },
            toValue: { driveLink: "https://x", name: "Lô 2" }
          },
          richNames
        )
      )
    ).toBe("đã sửa job: link thư mục ảnh trống → “https://x”; tên job — → “Lô 2”");
  });

  it("describes manual job status changes (PD-038), also when an Admin deleted the status", () => {
    const from = { jobStatusId: id(70), jobStatusName: "Mới nhận", jobStatusColor: "slate" };
    const to = { jobStatusId: id(71), jobStatusName: "Đang làm", jobStatusColor: "blue" };
    expect(
      text(
        describeTaskLog(
          { action: "JOB", taskNumber: null, taskCode: null, fromValue: from, toValue: to },
          richNames
        )
      )
    ).toBe("đã đổi trạng thái job: Mới nhận → Đang làm");
    expect(
      text(
        describeTaskLog(
          {
            action: "JOB",
            taskNumber: null,
            taskCode: null,
            fromValue: from,
            toValue: { ...to, statusDeleted: true }
          },
          richNames
        )
      )
    ).toBe("đã xoá trạng thái Mới nhận, job chuyển sang Đang làm");
  });

  it("describes task tag and custom-field edits", () => {
    expect(
      text(
        describeTaskLog(
          log(
            "FIELD",
            { tagIds: [], customValues: { do_kho: "de" } },
            { tagIds: [id(60)], customValues: { do_kho: "kho" } }
          ),
          richNames
        )
      )
    ).toBe("sửa #7: thêm tag Gấp; Độ khó Dễ → Khó");
  });
});

describe("job log (PD-044)", () => {
  type Item = ProductionTimelinePage["items"][number];
  const entry = (n: number, extra: Partial<TaskLog> = {}): Item => ({
    kind: "log",
    log: {
      id: id(n),
      taskId: id(1),
      taskNumber: 1,
      taskCode: "1",
      user: null,
      action: "STATUS",
      fromValue: null,
      toValue: null,
      note: null,
      createdAt: `2026-10-14T0${n}:00:00.000Z`,
      ...extra
    }
  });
  const comment: Item = {
    kind: "comment",
    comment: {
      id: id(90),
      entity: "JOB",
      entityId: id(20),
      jobId: id(20),
      author: null,
      body: "Bình luận",
      mentionedUserIds: [],
      createdAt: "2026-10-14T09:00:00.000Z",
      editedAt: null,
      canEdit: false
    }
  };

  it("keeps history only, newest first, once, without a subtask's own status / assignment rows", () => {
    const subtaskIds = new Set([id(11)]);
    const pages = [
      { items: [entry(5), comment, entry(3, { taskId: id(11), action: "STATUS" })] },
      {
        items: [
          entry(5),
          entry(4, { taskId: id(11), action: "ASSIGN" }),
          entry(2, { taskId: id(11), action: "QTY" }),
          entry(6, { action: "SUBTASK" })
        ]
      }
    ];
    expect(jobLogRows(pages, subtaskIds).map((log) => log.id)).toEqual([id(6), id(5), id(2)]);
    expect(jobLogRows(undefined, subtaskIds)).toEqual([]);
  });

  it("says when, compactly", () => {
    const now = new Date("2026-10-14T10:00:00.000Z");
    expect(logTimeLabel("2026-10-14T09:59:40.000Z", VN, now)).toBe("vừa xong");
    // A few seconds ahead of the device clock.
    expect(logTimeLabel("2026-10-14T10:00:05.000Z", VN, now)).toBe("vừa xong");
    expect(logTimeLabel("2026-10-14T09:35:00.000Z", VN, now)).toBe("25 phút trước");
    expect(logTimeLabel("2026-10-14T07:00:00.000Z", VN, now)).toBe("3 giờ trước");
    expect(logTimeLabel("2026-10-12T10:30:00.000Z", VN, now)).toBe("17:30 · 12/10");
  });
});

describe("maxDeclaredDoneQty", () => {
  it("mirrors the API cap: max(2 × assigned, assigned + 10)", () => {
    expect(maxDeclaredDoneQty(10)).toBe(20);
    expect(maxDeclaredDoneQty(1)).toBe(11);
    expect(maxDeclaredDoneQty(100)).toBe(200);
  });
});

describe("myCreditSummary", () => {
  it("sums the caller's rows and marks Khoán-only tasks", () => {
    expect(myCreditSummary({ myCredits: [] })).toBeNull();
    expect(
      myCreditSummary({
        myCredits: [
          { role: "WORKER", credits: 12.5, qty: 10, payMode: "POINTS" },
          { role: "WORKER", credits: -1.25, qty: -1, payMode: "POINTS" }
        ]
      })
    ).toEqual({
      credits: 11.25,
      khoan: false,
      detail: "Người làm 12,5 điểm · 10 tấm; Người làm -1,25 điểm · -1 tấm"
    });
    expect(
      myCreditSummary({ myCredits: [{ role: "QC", credits: 3, qty: 30, payMode: "MONEY_IF_KPI" }] })
    ).toMatchObject({ credits: 3, khoan: true, detail: "QC 3 điểm Khoán · 30 tấm" });
  });
});

describe("mentions", () => {
  it("detects the @query at the caret and inserts the name", () => {
    expect(mentionAt("Chào @ng", 8)).toEqual({ query: "ng", start: 5 });
    expect(mentionAt("email a@b", 9)).toBeNull();
    expect(mentionAt("@", 1)).toEqual({ query: "", start: 0 });
    expect(insertMention("Chào @ng xem", 5, 8, "NV B")).toEqual({
      text: "Chào @NV B  xem",
      caret: 11
    });
  });

  it("keeps only mentions still present in the text", () => {
    const picked = new Map([
      [id(2), "NV B"],
      [id(3), "QC C"]
    ]);
    expect(mentionedIds("@NV B làm lại giúp", picked)).toEqual([id(2)]);
  });
});
