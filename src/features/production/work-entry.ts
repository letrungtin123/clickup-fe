import type { ProductionRole } from "@/contracts/production-catalog";
import type { JobOption } from "@/contracts/production-jobs";

import type { WorkEntryInput } from "./jobs-api";
import { dueDayToIso, receivedDayToIso, workLinkProblem, workLinkValue } from "./jobs-model";

/**
 * "Nhập công việc" (PD-035, PD-038): one row of the work-log Excel typed in a form, added to a job of the project that
 * already exists (picked from GET /production/jobs/options — the entry never creates a job; jobs come from "Tạo job").
 * Pure helpers for the dialog (components/jobs/work-entry-dialog.tsx) and its job picker
 * (components/jobs/job-option-picker.tsx): validation mirroring the API, the payload, what "Lưu & nhập tiếp" keeps,
 * what a project change keeps. Unit tested in work-entry.test.ts.
 */

export type WorkEntryDraft = {
  assigneeId: string | null;
  /** The task's QC (PD-047: required unless the process is the Checking one, which has no QC). */
  qcId: string | null;
  projectId: string | null;
  /** "Gói công việc": the picked job of `projectId` (its id is sent; the rest is shown). */
  job: JobOption | null;
  processId: string | null;
  shiftId: string | null;
  /** "Ngày nhận" / "Ngày giao": organization-calendar days (YYYY-MM-DD). */
  receivedDay: string | null;
  dueDay: string | null;
  qty: string;
  errorQty: string;
  otHours: string;
  /** "Link chia việc" (PD-040): a web link or a folder path; optional. */
  workLink: string;
  note: string;
};

export type WorkEntryField =
  | "assignee"
  | "qc"
  | "project"
  | "job"
  | "process"
  | "shift"
  | "receivedDay"
  | "dueDay"
  | "qty"
  | "errorQty"
  | "otHours"
  | "workLink";

export type WorkEntryProblems = Partial<Record<WorkEntryField, string>>;

export const MAX_QTY = 1_000_000;
export const MAX_OT_HOURS = 24;

/** The job when it belongs to `projectId`, otherwise none (a job never crosses projects). */
const jobOf = (job: JobOption | null | undefined, projectId: string | null) =>
  job && projectId && job.projectId === projectId ? job : null;

/**
 * A fresh row: both dates today. A given job brings its project (when none is given) and is dropped when it belongs to
 * another project than the given one.
 */
export const newWorkEntryDraft = (
  today: string,
  initial: {
    assigneeId?: string | null | undefined;
    projectId?: string | null | undefined;
    job?: JobOption | null | undefined;
  } = {}
): WorkEntryDraft => {
  const projectId = initial.projectId ?? initial.job?.projectId ?? null;
  return {
    assigneeId: initial.assigneeId ?? null,
    qcId: null,
    projectId,
    job: jobOf(initial.job, projectId),
    processId: null,
    shiftId: null,
    receivedDay: today,
    dueDay: today,
    qty: "",
    errorQty: "",
    otHours: "",
    workLink: "",
    note: ""
  };
};

/** "Dự án" changed: the picked job stays only when it belongs to the new project. */
export const withProject = (draft: WorkEntryDraft, projectId: string | null): WorkEntryDraft => ({
  ...draft,
  projectId,
  job: jobOf(draft.job, projectId)
});

/**
 * "Lưu & nhập tiếp": the next row of the same day — person, QC, project, job, process, shift and dates stay; the row's
 * own numbers, link (each row is its own batch of images) and note are cleared.
 */
export const nextWorkEntryDraft = (draft: WorkEntryDraft): WorkEntryDraft => ({
  ...draft,
  qty: "",
  errorQty: "",
  otHours: "",
  workLink: "",
  note: ""
});

const integerPattern = /^\d+$/;

/** "12" → 12; null when empty; NaN when not a whole number. */
export const parseWholeNumber = (text: string) => {
  const value = text.trim();
  if (value === "") return null;
  return integerPattern.test(value) ? Number(value) : Number.NaN;
};

/** "1,5" / "1.5" → 1.5; null when empty; NaN when not a number. */
export const parseHours = (text: string) => {
  const value = text.trim().replace(",", ".");
  if (value === "") return null;
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
};

/** At most one decimal (the API checks multipleOf 0.1). */
const hasOneDecimalAtMost = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;

/** Roles the line's process needs from its assignee (PD-037: a Checking line is done by QC / Leader). */
export const assigneeRolesFor = (checking: boolean): readonly ProductionRole[] =>
  checking ? ["QC", "LEADER", "ADMIN"] : ["STAFF", "LEADER"];

/**
 * Field problems of a draft (empty object = valid). Mirrors POST /production/work-entries: everything is required
 * except Hình lỗi, Giờ OT (also on the OT shift), Link chia việc and Ghi chú — the QC too, unless the process is the
 * Checking one (PD-047; a Checking task has no QC); the job belongs to the project; Ngày giao from Ngày nhận on.
 * `checking`: the chosen process is the Checking one; `assigneeRoles`: the production roles of the chosen person when
 * known (null = unknown, the API decides); `self`: that person is me.
 */
export const workEntryProblems = (
  draft: WorkEntryDraft,
  context: {
    checking: boolean;
    assigneeRoles: readonly ProductionRole[] | null;
    self: boolean;
  }
): WorkEntryProblems => {
  const problems: WorkEntryProblems = {};
  if (!draft.assigneeId) {
    problems.assignee = "Chọn nhân viên thực hiện.";
  } else if (
    draft.processId &&
    context.assigneeRoles &&
    !assigneeRolesFor(context.checking).some((role) => context.assigneeRoles?.includes(role))
  ) {
    problems.assignee = context.checking
      ? context.self
        ? "Task Checking cần vai trò QC hoặc Leader — bạn chưa có."
        : "Task Checking cần người có vai trò QC hoặc Leader."
      : context.self
        ? "Quy trình này cần vai trò Nhân viên hoặc Leader — bạn chưa có."
        : "Cần người có vai trò Nhân viên hoặc Leader.";
  }
  if (!context.checking) {
    if (!draft.qcId) problems.qc = "Chọn QC.";
    else if (draft.qcId === draft.assigneeId) problems.qc = "QC phải khác người làm.";
  }
  if (!draft.projectId) problems.project = "Chọn dự án.";
  if (!draft.job) problems.job = "Chọn gói công việc.";
  else if (draft.job.projectId !== draft.projectId)
    problems.job = "Gói công việc không thuộc dự án đã chọn.";
  if (!draft.processId) problems.process = "Chọn quy trình.";
  if (!draft.shiftId) problems.shift = "Chọn ca làm việc.";
  if (!draft.receivedDay) problems.receivedDay = "Chọn ngày nhận.";
  if (!draft.dueDay) problems.dueDay = "Chọn ngày giao.";
  else if (draft.receivedDay && draft.dueDay < draft.receivedDay)
    problems.dueDay = "Ngày giao phải từ Ngày nhận trở đi.";
  const qty = parseWholeNumber(draft.qty);
  if (qty === null || !Number.isFinite(qty) || qty < 1 || qty > MAX_QTY)
    problems.qty = "Số lượng nguyên ≥ 1.";
  const errorQty = parseWholeNumber(draft.errorQty);
  if (errorQty !== null && (!Number.isFinite(errorQty) || errorQty > MAX_QTY))
    problems.errorQty = "Số nguyên ≥ 0.";
  const otHours = parseHours(draft.otHours);
  if (
    otHours !== null &&
    (!Number.isFinite(otHours) ||
      otHours <= 0 ||
      otHours > MAX_OT_HOURS ||
      !hasOneDecimalAtMost(otHours))
  )
    problems.otHours = "Từ 0,1 đến 24 giờ, tối đa 1 chữ số lẻ.";
  const workLink = workLinkProblem(draft.workLink);
  if (workLink) problems.workLink = workLink;
  return problems;
};

/**
 * The request body of a valid draft (null when something required is missing). The job goes by id (`jobId`, never a
 * typed package). `sendAssignee`: false when the task is fixed to me ("create: own") — the API then takes the caller.
 * `checking`: the process is the Checking one, which has no QC (PD-037); any other task needs its QC (PD-047).
 */
export const workEntryPayload = (
  draft: WorkEntryDraft,
  options: {
    timeZone: string;
    sendAssignee: boolean;
    checking?: boolean | undefined;
    customValues?: WorkEntryInput["customValues"];
  }
): WorkEntryInput | null => {
  const assignedAt = draft.receivedDay
    ? receivedDayToIso(draft.receivedDay, options.timeZone)
    : null;
  const deadline = draft.dueDay ? dueDayToIso(draft.dueDay, options.timeZone) : null;
  const qty = parseWholeNumber(draft.qty);
  const job = jobOf(draft.job, draft.projectId);
  const qcId = options.checking ? null : draft.qcId;
  if (
    !draft.projectId ||
    !job ||
    (!options.checking && !qcId) ||
    !draft.processId ||
    !draft.shiftId ||
    !assignedAt ||
    !deadline ||
    qty === null ||
    !Number.isFinite(qty)
  )
    return null;
  const errorQty = parseWholeNumber(draft.errorQty);
  const otHours = parseHours(draft.otHours);
  const note = draft.note.trim();
  const workLink = workLinkValue(draft.workLink);
  return {
    projectId: draft.projectId,
    jobId: job.id,
    ...(options.sendAssignee && draft.assigneeId ? { assigneeId: draft.assigneeId } : {}),
    ...(qcId ? { qcId } : {}),
    processId: draft.processId,
    shiftId: draft.shiftId,
    qtyAssigned: qty,
    assignedAt,
    deadline,
    ...(errorQty !== null && Number.isFinite(errorQty) ? { errorQty } : {}),
    ...(otHours !== null && Number.isFinite(otHours)
      ? { otHours: Math.round(otHours * 10) / 10 }
      : {}),
    ...(workLink ? { workLink } : {}),
    ...(note ? { note } : {}),
    ...(options.customValues ? { customValues: options.customValues } : {})
  };
};

/**
 * Save errors that are about the picked job, worded for the "Gói công việc" field (null = not about the job): it was
 * deleted (404 JOB_NOT_FOUND), archived (409 JOB_ARCHIVED) or belongs to another project (400 JOB_PROJECT_MISMATCH).
 */
export const workEntryJobError = (code: string): string | null => {
  switch (code) {
    case "JOB_NOT_FOUND":
      return "Không tìm thấy gói công việc này (có thể đã bị xoá) — chọn lại trong danh sách.";
    case "JOB_ARCHIVED":
      return "Job của gói này đã lưu trữ nên không thêm task được — chọn gói khác hoặc nhờ Leader mở lại.";
    case "JOB_PROJECT_MISMATCH":
      return "Gói công việc không thuộc dự án đã chọn — chọn lại.";
    default:
      return null;
  }
};

// "Gói công việc" picker ----------------------------------------------------------------------------------------

/** Status filter of the picker: toggles one status; an empty list means every status ("Tất cả"). */
export const toggleStatusFilter = (selected: readonly string[], statusId: string): string[] =>
  selected.includes(statusId)
    ? selected.filter((id) => id !== statusId)
    : [...selected, statusId];

/**
 * The options to list for `projectId`: the API answer filtered to that project — while the first answer for a newly
 * picked project loads, the previous project's answer (kept as placeholder data) must not be offered.
 */
export const jobOptionsFor = <T extends Pick<JobOption, "projectId">>(
  items: readonly T[] | undefined,
  projectId: string | null
): T[] => (projectId ? (items ?? []).filter((item) => item.projectId === projectId) : []);

/** A long folder path kept readable in a toast: its start and its (more telling) end. */
export const shortPackage = (code: string, max = 60) => {
  const value = code.trim();
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 3);
  const tail = max - 1 - head;
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
};

/**
 * The API words task errors for multi-task splits ("Task 1: …", PD-047; older servers "Dòng 1: …"); a work entry is a
 * single task.
 */
export const withoutLinePrefix = (message: string) =>
  message.replace(/(^|\s)(?:Task|Dòng) 1:\s*/g, "$1");
