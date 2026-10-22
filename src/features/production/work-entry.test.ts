import { describe, expect, it } from "vitest";

import type { JobOption } from "@/contracts/production-jobs";

import {
  assigneeRolesFor,
  jobOptionsFor,
  newWorkEntryDraft,
  nextWorkEntryDraft,
  parseHours,
  parseWholeNumber,
  shortPackage,
  toggleStatusFilter,
  withProject,
  withoutLinePrefix,
  workEntryJobError,
  workEntryPayload,
  workEntryProblems,
  type WorkEntryDraft
} from "./work-entry";

// Obviously fake ids and packages (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VN = "Asia/Ho_Chi_Minh";
const TODAY = "2026-10-13";

const option = (n: number, code: string, projectId = id(2)): JobOption => ({
  id: id(100 + n),
  code,
  projectId,
  deadline: "2026-10-20T16:59:00.000Z",
  jobStatus: {
    id: id(50),
    name: "Đang làm",
    color: "blue",
    isClosed: false,
    requiresAllChecked: false
  }
});

const JOB = option(1, "Batch A/Folder 01");

const valid = (patch: Partial<WorkEntryDraft> = {}): WorkEntryDraft => ({
  ...newWorkEntryDraft(TODAY, { assigneeId: id(1), projectId: id(2), job: JOB }),
  qcId: id(5),
  processId: id(3),
  shiftId: id(4),
  qty: "25",
  ...patch
});

const staffContext = { checking: false, assigneeRoles: ["STAFF"] as const, self: true };

describe("newWorkEntryDraft / withProject / nextWorkEntryDraft", () => {
  it("starts both dates today and keeps the given person, project and job", () => {
    expect(
      newWorkEntryDraft(TODAY, { assigneeId: id(1), projectId: id(2), job: JOB })
    ).toMatchObject({
      assigneeId: id(1),
      projectId: id(2),
      job: { id: id(101) },
      receivedDay: TODAY,
      dueDay: TODAY,
      qty: ""
    });
    expect(newWorkEntryDraft(TODAY)).toMatchObject({ projectId: null, job: null });
  });

  it("takes the project of a given job, and drops a job of another project", () => {
    expect(newWorkEntryDraft(TODAY, { job: JOB })).toMatchObject({
      projectId: id(2),
      job: { id: id(101) }
    });
    expect(newWorkEntryDraft(TODAY, { projectId: id(9), job: JOB })).toMatchObject({
      projectId: id(9),
      job: null
    });
  });

  it("keeps the job when the project stays, clears it for another project", () => {
    expect(withProject(valid(), id(2)).job).toEqual(JOB);
    expect(withProject(valid(), id(9))).toMatchObject({ projectId: id(9), job: null });
    expect(withProject(valid(), null)).toMatchObject({ projectId: null, job: null });
  });

  it("keeps the row's context (job included) and clears its numbers and note for the next row", () => {
    const next = nextWorkEntryDraft(
      valid({ errorQty: "2", otHours: "1,5", note: "ghi chú", dueDay: "2026-10-14" })
    );
    expect(next).toEqual({
      ...valid({ dueDay: "2026-10-14" }),
      qty: "",
      errorQty: "",
      otHours: "",
      note: ""
    });
    expect(next.job).toEqual(JOB);
  });
});

describe("parseWholeNumber / parseHours", () => {
  it("reads whole numbers, empty as null, anything else as NaN", () => {
    expect(parseWholeNumber(" 12 ")).toBe(12);
    expect(parseWholeNumber("")).toBeNull();
    expect(parseWholeNumber("1.5")).toBeNaN();
    expect(parseWholeNumber("-3")).toBeNaN();
  });

  it("reads hours with a comma or a dot", () => {
    expect(parseHours("1,5")).toBe(1.5);
    expect(parseHours("2.25")).toBe(2.25);
    expect(parseHours(" ")).toBeNull();
    expect(parseHours("abc")).toBeNaN();
  });
});

describe("workEntryProblems", () => {
  it("accepts a complete row (Hình lỗi, Giờ OT and Ghi chú optional)", () => {
    expect(workEntryProblems(valid(), staffContext)).toEqual({});
  });

  it("names every missing required field", () => {
    const problems = workEntryProblems(
      { ...newWorkEntryDraft(TODAY), receivedDay: null, dueDay: null },
      { checking: false, assigneeRoles: null, self: false }
    );
    expect(Object.keys(problems).sort()).toEqual(
      [
        "assignee",
        "dueDay",
        "job",
        "process",
        "project",
        "qc",
        "receivedDay",
        "shift"
      ].sort()
    );
  });

  it("needs a QC other than the worker, except on a Checking task (PD-047)", () => {
    expect(workEntryProblems(valid({ qcId: null }), staffContext).qc).toBe("Chọn QC.");
    expect(workEntryProblems(valid({ qcId: id(1) }), staffContext).qc).toBe(
      "QC phải khác người làm."
    );
    expect(
      workEntryProblems(valid({ qcId: null }), {
        checking: true,
        assigneeRoles: ["QC"],
        self: true
      }).qc
    ).toBeUndefined();
  });

  it("needs a job picked from the project", () => {
    expect(workEntryProblems(valid({ job: null }), staffContext).job).toBe("Chọn Job Code.");
    expect(
      workEntryProblems(valid({ job: option(2, "Batch khác", id(9)) }), staffContext).job
    ).toBe("Job Code không thuộc Project đã chọn.");
  });

  it("refuses a Ngày giao before the Ngày nhận, accepts the same day", () => {
    expect(
      workEntryProblems(valid({ receivedDay: "2026-10-13", dueDay: "2026-10-12" }), staffContext)
        .dueDay
    ).toBe("Ngày giao phải từ Ngày nhận trở đi.");
    expect(workEntryProblems(valid(), staffContext).dueDay).toBeUndefined();
  });

  it("checks quantities and overtime like the API", () => {
    const problems = (patch: Partial<WorkEntryDraft>) =>
      workEntryProblems(valid(patch), staffContext);
    expect(problems({ qty: "0" }).qty).toBeDefined();
    expect(problems({ qty: "2.5" }).qty).toBeDefined();
    expect(problems({ qty: "1000001" }).qty).toBeDefined();
    // PD-058: optional — empty is "chưa có số lượng".
    expect(problems({ qty: "" }).qty).toBeUndefined();
    expect(problems({ qty: "  " }).qty).toBeUndefined();
    expect(problems({ errorQty: "0" }).errorQty).toBeUndefined();
    expect(problems({ errorQty: "-1" }).errorQty).toBeDefined();
    expect(problems({ otHours: "1,5" }).otHours).toBeUndefined();
    expect(problems({ otHours: "24" }).otHours).toBeUndefined();
    expect(problems({ otHours: "0" }).otHours).toBeDefined();
    expect(problems({ otHours: "24.5" }).otHours).toBeDefined();
    expect(problems({ otHours: "1.25" }).otHours).toBeDefined();
  });

  it("needs QC or Leader for a Checking line and Staff or Leader otherwise (PD-037)", () => {
    expect(
      workEntryProblems(valid(), { checking: true, assigneeRoles: ["STAFF"], self: true }).assignee
    ).toBe("Task Checking cần vai trò QC hoặc Leader — bạn chưa có.");
    expect(
      workEntryProblems(valid(), { checking: true, assigneeRoles: ["QC"], self: false }).assignee
    ).toBeUndefined();
    expect(
      workEntryProblems(valid(), { checking: false, assigneeRoles: ["QC"], self: false }).assignee
    ).toBe("Cần người có vai trò Nhân viên hoặc Leader.");
    // Unknown roles: the API decides.
    expect(
      workEntryProblems(valid(), { checking: true, assigneeRoles: null, self: false }).assignee
    ).toBeUndefined();
    expect(assigneeRolesFor(true)).toContain("LEADER");
    expect(assigneeRolesFor(false)).toEqual(["STAFF", "LEADER"]);
  });
});

describe("workEntryPayload", () => {
  it("sends the job id, the days as 00:00 / 23:59 in the organization timezone, and leaves empty optionals out", () => {
    const payload = workEntryPayload(valid(), { timeZone: VN, sendAssignee: false });
    expect(payload).toEqual({
      projectId: id(2),
      jobId: id(101),
      qcId: id(5),
      processId: id(3),
      shiftId: id(4),
      qtyAssigned: 25,
      assignedAt: "2026-10-12T17:00:00.000Z",
      deadline: "2026-10-13T16:59:00.000Z"
    });
    // PD-038: the package is never sent as text.
    expect(payload).not.toHaveProperty("jobCode");
  });

  it("leaves an empty quantity out — the task has none until the worker fills it in (PD-058)", () => {
    const payload = workEntryPayload(valid({ qty: "" }), { timeZone: VN, sendAssignee: false });
    expect(payload).not.toBeNull();
    expect(payload).not.toHaveProperty("qtyAssigned");
    expect(workEntryPayload(valid({ qty: "abc" }), { timeZone: VN, sendAssignee: false })).toBeNull();
  });

  it("sends the person only when picked, and the optional numbers, note and fields when given", () => {
    const payload = workEntryPayload(
      valid({ errorQty: "3", otHours: "1,5", note: "  làm thêm  " }),
      { timeZone: VN, sendAssignee: true, customValues: { level: "hard" } }
    );
    expect(payload).toMatchObject({
      assigneeId: id(1),
      errorQty: 3,
      otHours: 1.5,
      note: "làm thêm",
      customValues: { level: "hard" }
    });
  });

  it("sends Link chia việc trimmed when given — a web link or a folder path (PD-040)", () => {
    const options = { timeZone: VN, sendAssignee: false };
    expect(workEntryPayload(valid({ workLink: "  Y:\\Client\\Batch 1 " }), options)).toMatchObject({
      workLink: "Y:\\Client\\Batch 1"
    });
    expect(
      workEntryPayload(valid({ workLink: "https://drive.example.com/f/1" }), options)
    ).toMatchObject({ workLink: "https://drive.example.com/f/1" });
    expect(workEntryPayload(valid({ workLink: "   " }), options)).not.toHaveProperty("workLink");
    // Control characters are refused like the API does; the next row starts without a link.
    expect(workEntryProblems(valid({ workLink: "a\tb" }), staffContext).workLink).toBeDefined();
    expect(
      workEntryProblems(valid({ workLink: "Y:\\Client" }), staffContext).workLink
    ).toBeUndefined();
    expect(nextWorkEntryDraft(valid({ workLink: "Y:\\Client" })).workLink).toBe("");
  });

  it("sends no QC for a Checking task, and needs one otherwise (PD-047)", () => {
    const checking = workEntryPayload(valid(), {
      timeZone: VN,
      sendAssignee: false,
      checking: true
    });
    expect(checking).not.toBeNull();
    expect(checking).not.toHaveProperty("qcId");
    expect(
      workEntryPayload(valid({ qcId: null }), { timeZone: VN, sendAssignee: false, checking: true })
    ).not.toBeNull();
    expect(
      workEntryPayload(valid({ qcId: null }), { timeZone: VN, sendAssignee: false })
    ).toBeNull();
  });

  it("is null while something required is missing or the job is of another project", () => {
    expect(
      workEntryPayload(valid({ shiftId: null }), { timeZone: VN, sendAssignee: false })
    ).toBeNull();
    expect(
      workEntryPayload(valid({ job: null }), { timeZone: VN, sendAssignee: false })
    ).toBeNull();
    expect(
      workEntryPayload(valid({ job: option(2, "Batch khác", id(9)) }), {
        timeZone: VN,
        sendAssignee: false
      })
    ).toBeNull();
  });
});

describe("workEntryJobError", () => {
  it("words the job errors of the API for the package field, nothing for the others", () => {
    expect(workEntryJobError("JOB_NOT_FOUND")).toMatch(/chọn lại/);
    expect(workEntryJobError("JOB_ARCHIVED")).toMatch(/lưu trữ/);
    expect(workEntryJobError("JOB_PROJECT_MISMATCH")).toMatch(/^Job Code không thuộc Project/);
    expect(workEntryJobError("SHIFT_NOT_FOUND")).toBeNull();
  });
});

describe("job picker helpers", () => {
  it("toggles statuses of the filter (empty = every status)", () => {
    expect(toggleStatusFilter([], id(50))).toEqual([id(50)]);
    expect(toggleStatusFilter([id(50), id(51)], id(50))).toEqual([id(51)]);
    expect(toggleStatusFilter([id(51)], id(50))).toEqual([id(51), id(50)]);
  });

  it("lists only the options of the chosen project (never the previous project's answer)", () => {
    const items = [option(1, "Batch 1"), option(2, "Batch 2", id(9))];
    expect(jobOptionsFor(items, id(2)).map((item) => item.id)).toEqual([id(101)]);
    expect(jobOptionsFor(items, null)).toEqual([]);
    expect(jobOptionsFor(undefined, id(2))).toEqual([]);
  });
});

describe("shortPackage / withoutLinePrefix", () => {
  it("keeps short packages and shortens long paths in the middle", () => {
    expect(shortPackage(" Batch A ")).toBe("Batch A");
    const long = `Root/${"a".repeat(80)}/Folder 99`;
    const short = shortPackage(long, 30);
    expect(short).toHaveLength(30);
    expect(short.startsWith("Root/")).toBe(true);
    expect(short.endsWith("/Folder 99")).toBe(true);
  });

  it("drops the API's task prefix of a single row (PD-047 “Task 1: …”, older “Dòng 1: …”)", () => {
    expect(withoutLinePrefix("Task 1: Chọn QC cho task. Task 1: Ca làm không tồn tại.")).toBe(
      "Chọn QC cho task. Ca làm không tồn tại."
    );
    expect(
      withoutLinePrefix(
        "Dòng 1: Người làm phải có vai trò Nhân viên hoặc Leader. Dòng 1: Ca làm không tồn tại."
      )
    ).toBe("Người làm phải có vai trò Nhân viên hoặc Leader. Ca làm không tồn tại.");
    expect(withoutLinePrefix("Không tìm thấy job.")).toBe("Không tìm thấy job.");
  });
});
