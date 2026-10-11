import { describe, expect, it } from "vitest";

import type { TaskTransitionOption } from "@/contracts/production-jobs";

import {
  activeFilterCount,
  allocation,
  assignedNormalQty,
  boardColumns,
  defaultTaskDeadline,
  describeTaskLog,
  emptyJobFilters,
  expectedEarnings,
  formatDateTime,
  insertMention,
  isoToZoned,
  jobFiltersFromSearch,
  jobFiltersToSearch,
  jobProgress,
  jobQueryFromFilters,
  mentionAt,
  maxDeclaredDoneQty,
  mentionedIds,
  myCreditSummary,
  needsInput,
  transitionAsks,
  qcActions,
  relativeDeadline,
  splitTransitions,
  taskLineProblems,
  zonedToIso,
  type Segment
} from "./jobs-model";

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VN = "Asia/Ho_Chi_Minh";
const text = (segments: Segment[]) => segments.map((segment) => segment.text).join("");

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
    callerId: id(1),
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

  it("mirrors the API's people and catalog rules", () => {
    expect(taskLineProblems({ ...line, assigneeId: id(4) }, context).assignee).toBe(
      "Cần vai trò Nhân viên hoặc Leader."
    );
    expect(taskLineProblems({ ...line, qcId: id(2) }, context).qc).toBe("Người QC cần vai trò QC.");
    expect(taskLineProblems({ ...line, assigneeId: id(1), qcId: id(1) }, context).qc).toBe(
      "QC phải khác người làm."
    );
    expect(taskLineProblems({ ...line, assigneeId: id(1), qcId: null }, context).qc).toBe(
      "Tự giao cho mình thì cần QC là người khác."
    );
    expect(taskLineProblems({ ...line, processId: id(90) }, context).process).toBe(
      "Quy trình QC không giao như task."
    );
    expect(taskLineProblems({ ...line, qty: "0" }, context).qty).toBe("Số tấm nguyên ≥ 1.");
    expect(taskLineProblems({ ...line, qty: "2.5" }, context).qty).toBe("Số tấm nguyên ≥ 1.");
    expect(
      Object.keys(
        taskLineProblems(
          { assigneeId: null, qcId: null, processId: null, shiftId: null, qty: "" },
          context
        )
      )
    ).toEqual(["assignee", "process", "shift", "qty"]);
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
    expect(needsInput(fresh, option(1, { asksQty: true }))).toBe(true);
    expect(needsInput(fresh, option(1, { requiresNote: true }))).toBe(true);
    // Re-Done after a QC fail: qty/OT hours are locked at the first Done.
    expect(needsInput(doneBefore, option(1, { asksQty: true, asksOtHours: true }))).toBe(false);
    expect(transitionAsks(doneBefore, option(1, { asksQty: true }))).toEqual({
      qty: false,
      otHours: false,
      note: false
    });
  });

  it("finds Pass and Fail among the task's own options", () => {
    const statuses = [
      { id: id(10), sortOrder: 2, countsChecked: false },
      { id: id(11), sortOrder: 4, countsChecked: false },
      { id: id(12), sortOrder: 5, countsChecked: true }
    ];
    const task = {
      status: { id: id(11), code: "WAITING_QC", name: "Chờ QC", color: "amber" as const },
      capabilities: {
        transitions: [
          option(12),
          option(10, { requiresNote: true }),
          option(12, { override: true })
        ],
        canEdit: false,
        canAssign: false,
        canEditQty: false
      }
    };
    const actions = qcActions(task, statuses);
    expect(actions.pass?.toStatusId).toBe(id(12));
    expect(actions.fail?.toStatusId).toBe(id(10));
    expect(
      qcActions({ ...task, capabilities: { ...task.capabilities, transitions: [] } }, statuses)
    ).toEqual({
      pass: null,
      fail: null
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
    action: "CREATE" | "STATUS" | "QTY" | "ASSIGN" | "NOTE" | "FIELD",
    fromValue: Record<string, unknown> | null,
    toValue: Record<string, unknown> | null
  ) => ({
    action,
    fromValue,
    toValue,
    taskNumber: 7
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
          log("STATUS", { name: "Chờ QC" }, { name: "Đang làm", qcFail: true }),
          names
        )
      )
    ).toBe("chuyển #7 từ Chờ QC sang Đang làm · QC trả lại");
    expect(
      text(describeTaskLog(log("STATUS", { name: "A" }, { name: "B", override: true }), names))
    ).toContain("ngoài luồng");
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
    ).toBe("sửa #7: số tấm giao 5 tấm → 6 tấm; quy trình quy trình khác → Retouch");
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
      "đã sửa job: deadline 12/10 17:00 → 13/10 12:00; Leader Leader A → Leader B; " +
        "Mã đơn hàng ĐH1 → ĐH2; thêm tag Gấp; bỏ tag VIP; tổng tấm 100 → 1.200"
    );
    expect(
      text(
        describeTaskLog(
          {
            action: "JOB",
            taskNumber: null,
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
            fromValue: { driveLink: null, name: null },
            toValue: { driveLink: "https://x", name: "Lô 2" }
          },
          richNames
        )
      )
    ).toBe("đã sửa job: thêm link ảnh; tên job — → “Lô 2”");
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
