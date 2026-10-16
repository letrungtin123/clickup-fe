import { describe, expect, it } from "vitest";

import type { CustomField } from "@/contracts/production-catalog";
import type { ProductionTask } from "@/contracts/production-jobs";
import { ApiError } from "@/lib/api/errors";

import {
  allQtyKnown,
  customFieldPayload,
  customFieldProblem,
  doneQtyExtras,
  doneQtyNoteRequired,
  doneQtyProblem,
  doneQtyTargets,
  doneQtyTargetsFor,
  doneQtyWithSubtasks,
  entersDone,
  isQcSendBack,
  lineDraftOf,
  lineFieldProblem,
  lineProcessHint,
  lineProcessOptions,
  lineQtyLeft,
  ownQtyOfTotal,
  qtyChangeLabel,
  qtyRequestActions,
  qtyRequestMessage,
  qtyRequestProblems,
  qtyRequiredTaskIds,
  requiredQtyProblem,
  subtaskDraftProblems,
  subtaskProcessOptions,
  subtaskQtyMax,
  subtaskQtyProblem,
  subtaskReasonValue,
  subtasksQty,
  subtasksWithoutQty,
  taskEditErrorMessage,
  taskEditRights,
  totalQtyProblem,
  wholeNumber
} from "./task-edit-model";

// PD-044 line page helpers. Obviously fake ids and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Asia/Ho_Chi_Minh";

const caps = (
  overrides: Partial<ProductionTask["capabilities"]> = {}
): ProductionTask["capabilities"] => ({
  transitions: [],
  canEdit: false,
  canAssign: false,
  canChangeAssignee: false,
  canEditQty: false,
  canEditQtyAssigned: false,
  canRequestQty: false,
  canDecideQtyRequest: false,
  canCreateSubtask: false,
  canDelete: false,
  ...overrides
});

const line = (overrides: Partial<ProductionTask> = {}) =>
  ({
    id: id(1),
    number: 3,
    assignee: { id: id(10), displayName: "Người A", email: null, avatarUrl: null },
    qc: null,
    process: { id: id(20), name: "Retouch", isQc: false },
    shift: { id: id(30), name: "Ca ngày", payMode: "POINTS", requiresOtHours: false },
    qtyAssigned: 7,
    qtyDone: null,
    errorQty: null,
    otHours: null,
    assignedAt: "2026-10-01T00:00:00+07:00",
    deadline: "2026-10-05T23:59:00+07:00",
    doneAt: null,
    checkedAt: null,
    isSubtask: false,
    subtasks: [],
    allocatedQty: 7,
    pendingQtyRequest: null,
    workLink: null,
    capabilities: caps(),
    ...overrides
  }) as unknown as ProductionTask;

const subtask = (n: number, qtyAssigned: number | null, qtyDone: number | null = null) => ({
  id: id(100 + n),
  number: n,
  code: `3${String.fromCharCode(96 + n)}`,
  process: { id: id(21), name: "Cắt nền" },
  qtyAssigned,
  qtyDone,
  reason: "Lý do thử",
  createdBy: null,
  createdAt: "2026-10-02T09:00:00+07:00"
});

describe("taskEditRights", () => {
  const editor = caps({
    canEdit: true,
    canAssign: true,
    canChangeAssignee: true,
    canEditQty: true,
    canEditQtyAssigned: true
  });

  it("before Done the editor may change every field; the Done quantity waits for Done", () => {
    const rights = taskEditRights(line({ capabilities: editor }), { archived: false });
    expect(rights).toMatchObject({
      process: true,
      assignee: true,
      qc: true,
      shift: true,
      qtyAssigned: true,
      requestQty: false,
      qtyDone: false,
      errorQty: true,
      otHours: true,
      received: true,
      due: true,
      workLink: true,
      note: true,
      tags: true,
      custom: true
    });
  });

  it("Done locks process, person, shift and Số lượng giao; QC stays until Đã check; the Done quantity opens", () => {
    const done = line({ capabilities: editor, doneAt: "2026-10-03T10:00:00+07:00" });
    const rights = taskEditRights(done, { archived: false });
    expect(rights).toMatchObject({
      process: false,
      assignee: false,
      shift: false,
      qtyAssigned: false,
      qc: true,
      qtyDone: true,
      note: true
    });
    const checked = { ...done, checkedAt: "2026-10-04T10:00:00+07:00" } as ProductionTask;
    expect(taskEditRights(checked, { archived: false }).qc).toBe(false);
  });

  it("a Checking line has no QC to change", () => {
    const checking = line({
      capabilities: editor,
      process: { id: id(22), name: "Checking", isQc: true }
    });
    expect(taskEditRights(checking, { archived: false }).qc).toBe(false);
  });

  it("a subtask edits only its process, quantities, Hình lỗi and Ghi chú (the rest follows its line)", () => {
    const sub = line({ capabilities: editor, isSubtask: true, parentTaskId: id(1) });
    const rights = taskEditRights(sub, { archived: false });
    expect(rights).toMatchObject({ process: true, qtyAssigned: true, errorQty: true, note: true });
    for (const key of [
      "assignee",
      "qc",
      "shift",
      "otHours",
      "received",
      "due",
      "workLink",
      "tags",
      "custom"
    ] as const)
      expect(rights[key], key).toBe(false);
  });

  it("a worker without a direct right asks the Leader — unless a request is already open", () => {
    const worker = caps({ canEdit: true, canRequestQty: true });
    expect(taskEditRights(line({ capabilities: worker }), { archived: false })).toMatchObject({
      qtyAssigned: false,
      requestQty: true
    });
    const open = line({
      capabilities: worker,
      pendingQtyRequest: {
        id: id(50),
        taskId: id(1),
        fromQty: 7,
        toQty: 9,
        reason: "x",
        status: "PENDING",
        requestedBy: null,
        createdAt: "2026-10-02T09:00:00+07:00",
        decidedBy: null,
        decidedAt: null,
        decisionNote: null
      }
    });
    expect(taskEditRights(open, { archived: false }).requestQty).toBe(false);
  });

  it("an archived job is read-only", () => {
    const rights = taskEditRights(line({ capabilities: editor }), { archived: true });
    expect(Object.values(rights).every((value) => value === false)).toBe(true);
  });

  it("PD-058: a task without a quantity is filled in directly — by its worker too, never through a request", () => {
    const empty = { qtyAssigned: null, allocatedQty: 0 };
    // The worker who could only ask (PD-044) fills it in.
    const worker = taskEditRights(
      line({ ...empty, capabilities: caps({ canEdit: true, canRequestQty: true }) }),
      { archived: false }
    );
    expect(worker).toMatchObject({ fillQty: true, requestQty: false, qtyAssigned: false });
    // So does whoever may change it anyway (Leader / "update: all").
    expect(
      taskEditRights(line({ ...empty, capabilities: editor }), { archived: false })
    ).toMatchObject({ fillQty: true, qtyAssigned: false, requestQty: false });
    // Not a viewer without any right, not after Done, not on an archived job.
    expect(taskEditRights(line({ ...empty }), { archived: false }).fillQty).toBe(false);
    expect(
      taskEditRights(
        line({ ...empty, capabilities: editor, doneAt: "2026-10-03T10:00:00+07:00" }),
        { archived: false }
      ).fillQty
    ).toBe(false);
    expect(taskEditRights(line({ ...empty, capabilities: editor }), { archived: true }).fillQty).toBe(
      false
    );
    // A number already given keeps PD-044: the request flow for the worker.
    expect(
      taskEditRights(line({ capabilities: caps({ canEdit: true, canRequestQty: true }) }), {
        archived: false
      })
    ).toMatchObject({ fillQty: false, requestQty: true });
  });
});

describe("one field of the line", () => {
  const base = lineDraftOf(line(), TZ);

  it("reads the stored values as a draft (days in the organization's time zone)", () => {
    expect(base).toMatchObject({
      qty: "7",
      receivedDay: "2026-10-01",
      dueDay: "2026-10-05",
      errorQty: "",
      otHours: "",
      workLink: ""
    });
  });

  it("checks only the keys the field can break", () => {
    expect(lineFieldProblem(base, { qty: "0" }, ["qty"])).toBe("Số lượng nguyên ≥ 1.");
    expect(lineFieldProblem(base, { qty: "12" }, ["qty"])).toBeNull();
    expect(lineFieldProblem(base, { errorQty: "-1" }, ["errorQty"])).toBe("Số nguyên ≥ 0.");
    expect(lineFieldProblem(base, { otHours: "25" }, ["otHours"])).toBe("Từ 0,1 đến 24 giờ.");
    expect(lineFieldProblem(base, { otHours: "1,5" }, ["otHours"])).toBeNull();
    expect(lineFieldProblem(base, { dueDay: "2026-09-30" }, ["due"])).toBe(
      "Ngày giao phải từ ngày nhận trở đi."
    );
  });

  it("a Ngày nhận after the Ngày giao is worded for the Ngày nhận", () => {
    expect(lineFieldProblem(base, { receivedDay: "2026-10-06" }, ["received", "due"])).toBe(
      "Ngày nhận không được sau ngày giao."
    );
  });

  it("a custom field sends only its own key; a required one cannot be emptied", () => {
    const field = {
      id: id(60),
      entity: "TASK",
      key: "ma_lo",
      label: "Mã lô",
      type: "NUMBER",
      required: true,
      options: [],
      active: true,
      sortOrder: 1
    } as unknown as CustomField;
    expect(customFieldPayload(field, "1,5")).toEqual({ ma_lo: 1.5 });
    expect(customFieldPayload(field, "")).toEqual({ ma_lo: null });
    expect(customFieldProblem(field, "")).toBe("Bắt buộc.");
    expect(customFieldProblem(field, "abc")).toBe("Nhập một số.");
    expect(customFieldProblem(field, "3")).toBeNull();
  });
});

describe("Done quantity after Done", () => {
  it("someone other than the worker must say why", () => {
    const task = line();
    expect(doneQtyNoteRequired(task, id(10))).toBe(false);
    expect(doneQtyNoteRequired(task, id(11))).toBe(true);
    expect(doneQtyProblem({ qty: "6", note: "" }, true)).toBe("Ghi lý do sửa để người làm biết.");
    expect(doneQtyProblem({ qty: "6", note: "" }, false)).toBeNull();
    expect(doneQtyProblem({ qty: "6,5", note: "x" }, false)).toBe("Nhập số tấm nguyên ≥ 0.");
    expect(doneQtyProblem({ qty: "0", note: "" }, false)).toBeNull();
  });
});

describe("Công đoạn of a task", () => {
  it("offers every active process, QC ones marked, keeping the task's own when archived", () => {
    const processes = [
      { id: id(20), name: "Retouch", isQc: false, active: true },
      { id: id(22), name: "Checking", isQc: true, active: true },
      { id: id(23), name: "Cũ", isQc: false, active: false }
    ];
    expect(lineProcessOptions(processes, id(20))).toEqual([
      { id: id(20), label: "Retouch", hint: null },
      { id: id(22), label: "Checking", hint: "QC" }
    ]);
    expect(lineProcessOptions(processes, id(23)).map((option) => option.label)).toEqual([
      "Retouch",
      "Checking",
      "Cũ"
    ]);
  });

  it("warns a task with subtasks off Checking and its subtasks' processes", () => {
    expect(lineProcessHint(true)).toContain("Task có subtask không chuyển sang Checking");
    expect(lineProcessHint(false)).toBe(
      "Công đoạn phải hợp với người làm (task Checking là việc của QC)."
    );
  });
});

describe("subtasks", () => {
  it("offers active non-QC processes other than the line's, keeping the subtask's own", () => {
    const processes = [
      { id: id(20), name: "Retouch", isQc: false, active: true },
      { id: id(21), name: "Cắt nền", isQc: false, active: true },
      { id: id(22), name: "Checking", isQc: true, active: true },
      { id: id(23), name: "Cũ", isQc: false, active: false }
    ];
    expect(subtaskProcessOptions(processes, id(20)).map((option) => option.label)).toEqual([
      "Cắt nền"
    ]);
    expect(subtaskProcessOptions(processes, id(20), id(23)).map((option) => option.label)).toEqual([
      "Cắt nền",
      "Cũ"
    ]);
  });

  it("the line keeps at least 1 image", () => {
    expect(subtaskQtyMax(7)).toBe(6);
    expect(subtaskQtyMax(7, 3)).toBe(9);
    expect(subtaskQtyMax(1)).toBe(0);
    expect(subtaskQtyProblem("6", 6)).toBeNull();
    expect(subtaskQtyProblem("7", 6)).toBe("Tối đa 6 tấm (task gốc giữ ít nhất 1 tấm).");
    expect(subtaskQtyProblem("0", 6)).toBe("Số tấm nguyên ≥ 1.");
    expect(subtaskQtyProblem("1", 0)).toBe("Task gốc chỉ còn 1 tấm — không tách thêm được.");
    expect(lineQtyLeft(7, 0, "2")).toBe(5);
    expect(lineQtyLeft(7, 3, "5")).toBe(5);
    expect(lineQtyLeft(7, 0, "x")).toBeNull();
  });

  it("PD-058: nothing is carved from a line without a quantity; an empty subtask filled in is carved", () => {
    expect(subtaskQtyMax(null)).toBe(1_000_000);
    // A subtask without a quantity filled in under a line that has one is carved like a new one.
    expect(subtaskQtyMax(7, null)).toBe(6);
    expect(subtaskQtyProblem("50", subtaskQtyMax(null))).toBeNull();
    expect(subtaskQtyProblem("1000001", subtaskQtyMax(null))).toBe("Tối đa 1.000.000 tấm.");
    expect(lineQtyLeft(null, 0, "2")).toBeNull();
    expect(lineQtyLeft(7, null, "2")).toBe(5);
    // "Tạo subtask": the quantity may stay empty, even when the line keeps only 1 image.
    expect(subtaskQtyProblem("", 0, { optional: true })).toBeNull();
    expect(subtaskQtyProblem("2", 0, { optional: true })).toBe(
      "Task gốc chỉ còn 1 tấm — không tách thêm được."
    );
    expect(requiredQtyProblem("")).toBe("Nhập số tấm nguyên ≥ 1.");
    expect(requiredQtyProblem("0")).toBe("Nhập số tấm nguyên ≥ 1.");
    expect(requiredQtyProblem(" 12 ")).toBeNull();
  });

  it("the create form needs a process; the quantity (PD-058) and the reason (PD-045) are optional", () => {
    expect(subtaskDraftProblems({ processId: null, qty: "", reason: " " }, 6)).toEqual({
      process: "Chọn công đoạn."
    });
    expect(subtaskDraftProblems({ processId: id(21), qty: "", reason: "" }, 6)).toEqual({});
    expect(subtaskDraftProblems({ processId: id(21), qty: "0", reason: "" }, 6)).toEqual({
      qty: "Số tấm nguyên ≥ 1."
    });
    expect(subtaskDraftProblems({ processId: id(21), qty: "2", reason: "" }, 6)).toEqual({});
    expect(subtaskDraftProblems({ processId: id(21), qty: "2", reason: "Lý do" }, 6)).toEqual({});
    expect(
      subtaskDraftProblems({ processId: id(21), qty: "2", reason: "x".repeat(2001) }, 6)
    ).toEqual({ reason: "Lý do tối đa 2.000 ký tự." });
    expect(subtaskReasonValue("   ")).toBeUndefined();
    expect(subtaskReasonValue(" Cắt nền ")).toBe("Cắt nền");
  });

  it("counts the images split off (PD-058: known numbers only)", () => {
    expect(subtasksQty([subtask(4, 2), subtask(5, 1)])).toBe(3);
    expect(subtasksQty([subtask(4, 2), subtask(5, null)])).toBe(2);
    expect(subtasksWithoutQty([subtask(4, 2), subtask(5, null)])).toBe(1);
    expect(allQtyKnown({ qtyAssigned: 7, subtasks: [subtask(4, 2)] })).toBe(true);
    expect(allQtyKnown({ qtyAssigned: 7, subtasks: [subtask(4, null)] })).toBe(false);
    expect(allQtyKnown({ qtyAssigned: null, subtasks: [] })).toBe(false);
    expect(lineDraftOf(line({ qtyAssigned: null }), TZ).qty).toBe("");
    expect(wholeNumber(" 12 ")).toBe(12);
    expect(wholeNumber("1.5")).toBeNull();
  });

  it("“Số lượng giao” is edited as the total: the task keeps total − subtasks, at least 1 (PD-048)", () => {
    expect(totalQtyProblem("20", 9)).toBeNull();
    expect(totalQtyProblem("10", 9)).toBeNull();
    expect(totalQtyProblem("9", 9)).toBe("Tổng phải lớn hơn số lượng các subtask (9).");
    expect(totalQtyProblem("4", 9)).toBe("Tổng phải lớn hơn số lượng các subtask (9).");
    expect(totalQtyProblem("0", 0)).toBe("Số lượng nguyên ≥ 1.");
    expect(totalQtyProblem("1,5", 0)).toBe("Số lượng nguyên ≥ 1.");
    expect(totalQtyProblem("1", 0)).toBeNull();
    expect(ownQtyOfTotal("20", 9)).toBe(11);
    expect(ownQtyOfTotal(" 7 ", 0)).toBe(7);
    expect(ownQtyOfTotal("x", 9)).toBeNull();
  });

  it("“Số tấm đã xong” adds the subtasks' Done quantities to the task's own (PD-048)", () => {
    expect(
      doneQtyWithSubtasks({ qtyDone: 11, subtasks: [subtask(1, 5, 5), subtask(2, 4, 4)] })
    ).toBe(20);
    expect(doneQtyWithSubtasks({ qtyDone: 7, subtasks: [] })).toBe(7);
    expect(doneQtyWithSubtasks({ qtyDone: 6, subtasks: [subtask(1, 3, null)] })).toBe(6);
    expect(doneQtyWithSubtasks({ qtyDone: null, subtasks: [subtask(1, 3, null)] })).toBeNull();
    expect(doneQtyWithSubtasks({ qtyDone: null, subtasks: [] })).toBeNull();
  });
});

describe("quantity requests", () => {
  const split = line({ qtyAssigned: 7, allocatedQty: 10, subtasks: [subtask(4, 3)] });

  it("asks a new total other than the current one, enough for the subtasks, with a reason", () => {
    expect(qtyRequestProblems({ qty: "10", reason: "x" }, split).qty).toBe(
      "Số mới phải khác số đang giao."
    );
    expect(qtyRequestProblems({ qty: "3", reason: "x" }, split).qty).toBe(
      "Ít nhất 4 tấm: subtask đã tách 3 tấm, task gốc giữ ít nhất 1 tấm."
    );
    expect(qtyRequestProblems({ qty: "12", reason: "" }, split)).toEqual({
      reason: "Nhập lý do để Leader biết vì sao cần sửa."
    });
    expect(qtyRequestProblems({ qty: "12", reason: "Thêm ảnh" }, split)).toEqual({});
  });

  it("words the problems as one message for the inline form (PD-047), one per line", () => {
    expect(qtyRequestMessage({ qty: "12", reason: "Thêm ảnh" }, split)).toBeNull();
    expect(qtyRequestMessage({ qty: "10", reason: " " }, split)).toBe(
      "Số mới phải khác số đang giao.\nNhập lý do để Leader biết vì sao cần sửa."
    );
  });

  it("labels the change and who may act on it", () => {
    expect(qtyChangeLabel({ fromQty: 10, toQty: 1200 })).toBe("10 → 1.200");
    const request = {
      requestedBy: { id: id(10), displayName: "Người A", email: null, avatarUrl: null }
    };
    expect(qtyRequestActions(request, { myId: id(10), canDecide: false, archived: false })).toEqual(
      {
        canDecide: false,
        canCancel: true
      }
    );
    expect(qtyRequestActions(request, { myId: id(11), canDecide: true, archived: false })).toEqual({
      canDecide: true,
      canCancel: false
    });
    expect(qtyRequestActions(request, { myId: id(10), canDecide: true, archived: true })).toEqual({
      canDecide: false,
      canCancel: false
    });
  });
});

describe("moves", () => {
  const noted = { requiresNote: true, override: false };

  it("QC sends the line back from Chờ QC or Đang check (Cần sửa lại)", () => {
    expect(isQcSendBack("WAITING_QC", noted)).toBe(true);
    expect(isQcSendBack("QC_CHECKING", noted)).toBe(true);
    expect(isQcSendBack("IN_PROGRESS", noted, "REWORK")).toBe(true);
    expect(isQcSendBack("IN_PROGRESS", noted, "DONE")).toBe(false);
    expect(isQcSendBack("WAITING_QC", { requiresNote: true, override: true })).toBe(false);
    expect(isQcSendBack("WAITING_QC", { requiresNote: false, override: false })).toBe(false);
  });
});

describe("taskEditErrorMessage", () => {
  it("shows the API's Vietnamese message for the PD-044 codes, else a fallback", () => {
    expect(
      taskEditErrorMessage(
        new ApiError({
          status: 409,
          code: "QTY_REQUEST_OPEN",
          message: "Task #3 đã có đề nghị đang chờ duyệt."
        })
      )
    ).toBe("Task #3 đã có đề nghị đang chờ duyệt.");
    expect(
      taskEditErrorMessage(
        new ApiError({ status: 409, code: "SUBTASK_FOLLOWS_PARENT", message: "Conflict" })
      )
    ).toBe("Subtask đi theo trạng thái của task gốc — hãy chuyển task gốc.");
    expect(
      taskEditErrorMessage(
        new ApiError({ status: 500, code: "INTERNAL_SERVER_ERROR", message: "x" })
      )
    ).toBe("Đã có lỗi phía máy chủ. Vui lòng thử lại sau.");
  });
});

describe("Done without a quantity (PD-058)", () => {
  const statuses = [
    { id: id(60), countsDone: false },
    { id: id(61), countsDone: true },
    { id: id(62), countsDone: true }
  ];
  const working = { id: id(60), code: "IN_PROGRESS", name: "Đang làm", color: "blue" as const };
  const toDone = { toStatusId: id(61), asksQty: true };
  const lineWith = (qtyAssigned: number | null, subtasks: ReturnType<typeof subtask>[] = []) =>
    line({ code: "3", status: working, qtyAssigned, subtasks });

  it("asks only when entering Done while the line or a live subtask has no quantity", () => {
    expect(doneQtyTargets(lineWith(7, [subtask(4, 2)]), toDone, statuses)).toEqual([]);
    expect(doneQtyTargets(lineWith(null, [subtask(4, 2), subtask(5, null)]), toDone, statuses)).toEqual([
      { taskId: id(1), code: "3", processName: "Retouch", subtask: false },
      { taskId: id(105), code: "3e", processName: "Cắt nền", subtask: true }
    ]);
    // Not entering Done: nothing to ask.
    expect(
      doneQtyTargets(lineWith(null), { toStatusId: id(60), asksQty: false }, statuses)
    ).toEqual([]);
  });

  it("knows Done from the API's asksQty, or from a status that counts as done", () => {
    expect(entersDone({ status: working }, toDone, [])).toBe(true);
    expect(entersDone({ status: working }, { toStatusId: id(61), asksQty: false }, statuses)).toBe(true);
    // Done → Chờ QC: both count as done.
    const done = { ...working, id: id(61) };
    expect(entersDone({ status: done }, { toStatusId: id(62), asksQty: false }, statuses)).toBe(false);
    expect(entersDone({ status: working }, { toStatusId: id(60), asksQty: false }, statuses)).toBe(false);
  });

  it("sends the line's number as qtyDone and each subtask's in subtaskQtyDone", () => {
    const targets = doneQtyTargets(lineWith(null, [subtask(4, null), subtask(5, 1)]), toDone, statuses);
    expect(doneQtyExtras(id(1), targets, { [id(1)]: "12", [id(104)]: " 3 " })).toEqual({
      qtyDone: 12,
      subtaskQtyDone: [{ taskId: id(104), qtyDone: 3 }]
    });
    // Only subtasks missing: no qtyDone for the line (it keeps its own Done quantity).
    const onlySub = doneQtyTargets(lineWith(7, [subtask(4, null)]), toDone, statuses);
    expect(doneQtyExtras(id(1), onlySub, { [id(104)]: "4" })).toEqual({
      subtaskQtyDone: [{ taskId: id(104), qtyDone: 4 }]
    });
  });

  it("reads TASK_QTY_REQUIRED's task ids and labels them from the refetched line", () => {
    const error = new ApiError({
      status: 400,
      code: "TASK_QTY_REQUIRED",
      message: "Nhập số lượng trước khi chuyển Done.",
      details: { taskIds: [id(104), id(999), 7] }
    });
    expect(qtyRequiredTaskIds(error)).toEqual([id(104), id(999)]);
    expect(
      qtyRequiredTaskIds(new ApiError({ status: 400, code: "TASK_QTY_REQUIRED", message: "x" }))
    ).toEqual([]);
    expect(qtyRequiredTaskIds(new ApiError({ status: 409, code: "QTY_LOCKED", message: "x" }))).toBeNull();
    const fresh = lineWith(7, [subtask(4, null)]);
    expect(doneQtyTargetsFor(fresh, [id(104), id(999)])).toEqual([
      { taskId: id(104), code: "3d", processName: "Cắt nền", subtask: true },
      { taskId: id(999), code: "3…", processName: "Subtask", subtask: true }
    ]);
    // No ids: whatever the line still lacks.
    expect(doneQtyTargetsFor(fresh, [])).toEqual([
      { taskId: id(104), code: "3d", processName: "Cắt nền", subtask: true }
    ]);
    expect(taskEditErrorMessage(error)).toBe("Nhập số lượng trước khi chuyển Done.");
    expect(
      taskEditErrorMessage(new ApiError({ status: 409, code: "TASK_QTY_EMPTY", message: "Conflict" }))
    ).toBe("Task chưa có số lượng — điền trực tiếp vào ô số lượng.");
  });
});
