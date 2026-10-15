import type { CustomField, Process } from "@/contracts/production-catalog";
import type {
  ProductionSubtask,
  ProductionTask,
  TaskQtyRequest,
  TaskTransitionOption
} from "@/contracts/production-jobs";
import { isApiError } from "@/lib/api/errors";

import { toCustomValuesPayload, validateCustomValues, type CustomValue } from "./custom-fields";
import { productionErrorMessage } from "./errors";
import { formatInteger } from "./format";
import {
  isoToDay,
  qcQueueCodes,
  taskLineProblems,
  type LineContext,
  type TaskLineDraft,
  type TaskLineProblemKey
} from "./jobs-model";

/**
 * PD-044 task page: which fields the viewer may change in place (click-to-edit, PD-047), subtasks, quantity
 * requests and the Done quantities of a line's subtasks. Pure helpers (unit tested in task-edit-model.test.ts); the
 * API enforces every rule again.
 */

// Rights ------------------------------------------------------------------------------------------------------

export type TaskEditKey =
  | "process"
  | "assignee"
  | "qc"
  | "shift"
  | "qtyAssigned"
  | "qtyDone"
  | "errorQty"
  | "otHours"
  | "received"
  | "due"
  | "workLink"
  | "note"
  | "tags"
  | "custom";

/**
 * Per field: may the viewer edit it in place. `requestQty`: no direct right on "Số lượng giao", but the viewer may ask
 * the Leader to change it (the field opens the inline request form instead, PD-047).
 */
export type TaskEditRights = Record<TaskEditKey, boolean> & { requestQty: boolean };

const noRights: TaskEditRights = {
  process: false,
  assignee: false,
  qc: false,
  shift: false,
  qtyAssigned: false,
  qtyDone: false,
  errorQty: false,
  otHours: false,
  received: false,
  due: false,
  workLink: false,
  note: false,
  tags: false,
  custom: false,
  requestQty: false
};

type RightsTask = Pick<
  ProductionTask,
  "capabilities" | "doneAt" | "checkedAt" | "process" | "isSubtask" | "pendingQtyRequest"
>;

/**
 * The fields the viewer may change in place, from the task's capabilities (PD-036 / PD-044). Done locks Công đoạn,
 * Ca, the person and "Số lượng giao"; the QC can change until "Đã check" (not on a Checking line, which has none). A
 * subtask follows its line for the person, QC, Ca, dates, Giờ OT, link, tags and custom fields: only its Công đoạn,
 * quantities, Hình lỗi and Ghi chú are its own. An archived job is read-only.
 */
export const taskEditRights = (
  task: RightsTask,
  options: { archived: boolean }
): TaskEditRights => {
  if (options.archived) return noRights;
  const caps = task.capabilities;
  const done = task.doneAt !== null;
  const lineOnly = !task.isSubtask;
  return {
    process: caps.canEdit && !done,
    assignee: caps.canChangeAssignee && !done && lineOnly,
    qc: caps.canAssign && task.checkedAt === null && !task.process.isQc && lineOnly,
    shift: caps.canEdit && !done && lineOnly,
    qtyAssigned: caps.canEditQtyAssigned && !done,
    requestQty:
      !caps.canEditQtyAssigned && caps.canRequestQty && !done && task.pendingQtyRequest === null,
    qtyDone: caps.canEditQty && done,
    errorQty: caps.canEdit,
    otHours: caps.canEdit && lineOnly,
    received: caps.canEdit && lineOnly,
    due: caps.canEdit && lineOnly,
    workLink: caps.canEdit && lineOnly,
    note: caps.canEdit,
    tags: caps.canEdit && lineOnly,
    custom: caps.canEdit && lineOnly
  };
};

// Numbers -----------------------------------------------------------------------------------------------------

/** A whole number as typed ("12", " 12 "); null when it is not one. */
export const wholeNumber = (text: string) => {
  const value = text.trim();
  return /^\d+$/.test(value) ? Number(value) : null;
};

/** Images split off into subtasks (the line's own part is `qtyAssigned`). */
export const subtasksQty = (subtasks: readonly Pick<ProductionSubtask, "qtyAssigned">[]) =>
  subtasks.reduce((sum, subtask) => sum + subtask.qtyAssigned, 0);

/**
 * "Số lượng giao" edited as the total the Leader gave (PD-048): the task with its subtasks. The subtasks keep their
 * images, so the task keeps total − subtasks and must keep at least 1.
 */
export const totalQtyProblem = (text: string, split: number) => {
  const total = wholeNumber(text);
  if (total === null || total < 1 || total > 1_000_000) return "Số lượng nguyên ≥ 1.";
  if (split > 0 && total - split < 1)
    return `Tổng phải lớn hơn số lượng các subtask (${formatInteger(split)}).`;
  return null;
};

/** The task's own part of a new total (what the API takes as `qtyAssigned`); null while not a whole number. */
export const ownQtyOfTotal = (text: string, split: number) => {
  const total = wholeNumber(text);
  return total === null ? null : total - split;
};

/**
 * "Số tấm đã xong" of a task with its subtasks (PD-048): its own Done quantity plus each subtask's; null while nothing
 * is recorded.
 */
export const doneQtyWithSubtasks = (
  task: Pick<ProductionTask, "qtyDone"> & {
    subtasks: readonly Pick<ProductionSubtask, "qtyDone">[];
  }
) => {
  const parts = [task.qtyDone, ...task.subtasks.map((subtask) => subtask.qtyDone)];
  if (parts.every((part) => part === null)) return null;
  return parts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
};

// One field of the line (same checks as "Chia task" / the old "Sửa dòng") ---------------------------------------

const noPeople: LineContext = { roles: new Map(), qcProcessIds: new Set() };

/** The line's stored values as a draft (days in the organization's time zone). */
export const lineDraftOf = (
  task: Pick<
    ProductionTask,
    | "assignee"
    | "process"
    | "shift"
    | "qtyAssigned"
    | "assignedAt"
    | "deadline"
    | "errorQty"
    | "otHours"
    | "workLink"
  >,
  timeZone: string
): TaskLineDraft => ({
  assigneeId: task.assignee.id,
  qcId: null,
  processId: task.process.id,
  shiftId: task.shift.id,
  qty: String(task.qtyAssigned),
  receivedDay: isoToDay(task.assignedAt, timeZone),
  dueDay: isoToDay(task.deadline, timeZone),
  errorQty: task.errorQty === null ? "" : String(task.errorQty),
  otHours: task.otHours === null ? "" : String(task.otHours),
  workLink: task.workLink ?? ""
});

/**
 * The problem of one edited field (null = fine), the line's other values as stored: `taskLineProblems` for the keys
 * the field can break (a new Ngày nhận may fall after the Ngày giao). People are the API's to check.
 */
export const lineFieldProblem = (
  base: TaskLineDraft,
  patch: Partial<TaskLineDraft>,
  keys: readonly TaskLineProblemKey[]
) => {
  const problems = taskLineProblems({ ...base, ...patch }, noPeople);
  for (const key of keys) {
    const problem = problems[key];
    if (problem) {
      return key === "due" && "receivedDay" in patch && !("dueDay" in patch)
        ? "Ngày nhận không được sau ngày giao."
        : problem;
    }
  }
  return null;
};

/** One TASK custom field: its error (required ones cannot be emptied), null when fine. */
export const customFieldProblem = (field: CustomField, value: CustomValue | undefined) =>
  validateCustomValues([field], { [field.key]: value ?? null }, { enforceRequired: true })[
    field.key
  ] ?? null;

/** One TASK custom field for the API: only its key (the API keeps the others). */
export const customFieldPayload = (field: CustomField, value: CustomValue | undefined) =>
  toCustomValuesPayload([field], { [field.key]: value ?? null });

// "Số tấm đã xong" after Done ----------------------------------------------------------------------------------

export type DoneQtyDraft = { qty: string; note: string };

/** Someone other than the worker correcting the Done quantity must say why (the worker is notified). */
export const doneQtyNoteRequired = (task: Pick<ProductionTask, "assignee">, myId: string | null) =>
  task.assignee.id !== myId;

export const doneQtyProblem = (draft: DoneQtyDraft, noteRequired: boolean) => {
  const value = wholeNumber(draft.qty);
  if (value === null || value > 1_000_000) return "Nhập số tấm nguyên ≥ 0.";
  if (noteRequired && !draft.note.trim()) return "Ghi lý do sửa để người làm biết.";
  if (draft.note.trim().length > 5000) return "Lý do tối đa 5.000 ký tự.";
  return null;
};

// Công đoạn ---------------------------------------------------------------------------------------------------

/**
 * Processes a task (not a subtask) may switch to ("Công đoạn"): every active one, the QC ones marked, its current one
 * kept even when archived. The same list on the task title and on the task row of the subtask tree; the API checks the
 * rest (the people must fit the process; a task with subtasks takes neither a Checking process nor one of its
 * subtasks' — PROCESS_INVALID, worded by the server).
 */
export const lineProcessOptions = (
  processes: readonly Pick<Process, "id" | "name" | "isQc" | "active">[],
  currentId: string
) =>
  processes
    .filter((process) => process.active || process.id === currentId)
    .map((process) => ({
      id: process.id,
      label: process.name,
      hint: process.isQc ? "QC" : null
    }));

/** The note under a task's "Công đoạn" editor. */
export const lineProcessHint = (hasSubtasks: boolean) =>
  hasSubtasks
    ? "Công đoạn phải hợp với người làm. Task có subtask không chuyển sang Checking hay công đoạn của subtask."
    : "Công đoạn phải hợp với người làm (task Checking là việc của QC).";

// Subtasks ----------------------------------------------------------------------------------------------------

/**
 * Processes a subtask may take ("Công đoạn"): active, not the QC process and not its line's own. The subtask's current
 * process stays listed even when archived.
 */
export const subtaskProcessOptions = (
  processes: readonly Pick<Process, "id" | "name" | "isQc" | "active">[],
  lineProcessId: string | null,
  currentId: string | null = null
) =>
  processes
    .filter(
      (process) =>
        process.id === currentId ||
        (process.active && !process.isQc && process.id !== lineProcessId)
    )
    .map((process) => ({ id: process.id, label: process.name }));

/**
 * Most images a subtask can hold: taken from the line, which keeps at least 1. `current` is the subtask's own quantity
 * when editing it (it goes back to the line first).
 */
export const subtaskQtyMax = (lineQtyAssigned: number, current = 0) =>
  Math.max(0, lineQtyAssigned + current - 1);

export const subtaskQtyProblem = (text: string, max: number) => {
  if (max < 1) return "Task gốc chỉ còn 1 tấm — không tách thêm được.";
  const value = wholeNumber(text);
  if (value === null || value < 1) return "Số tấm nguyên ≥ 1.";
  if (value > max) return `Tối đa ${formatInteger(max)} tấm (task gốc giữ ít nhất 1 tấm).`;
  return null;
};

/**
 * What the line keeps once the subtask holds `text` images ("Task gốc còn N tấm"); null while the number is not valid.
 */
export const lineQtyLeft = (lineQtyAssigned: number, current: number, text: string) => {
  const value = wholeNumber(text);
  if (value === null) return null;
  return lineQtyAssigned + current - value;
};

export type SubtaskDraft = { processId: string | null; qty: string; reason: string };
export type SubtaskProblemKey = "process" | "qty" | "reason";

/** "Tạo subtask": a process and a quantity; the reason is optional (PD-045), at most 2,000 characters. */
export const subtaskDraftProblems = (draft: SubtaskDraft, max: number) => {
  const problems: Partial<Record<SubtaskProblemKey, string>> = {};
  if (!draft.processId) problems.process = "Chọn công đoạn.";
  const qty = subtaskQtyProblem(draft.qty, max);
  if (qty) problems.qty = qty;
  if (draft.reason.trim().length > 2000) problems.reason = "Lý do tối đa 2.000 ký tự.";
  return problems;
};

/** The subtask reason to send: trimmed, undefined when empty (optional, PD-045). */
export const subtaskReasonValue = (text: string) => text.trim() || undefined;

// Quantity requests ("Số lượng giao" asked by the worker) --------------------------------------------------------

export type QtyRequestDraft = { qty: string; reason: string };

/**
 * The new total the worker asks for: a whole number other than the current total, enough for the subtasks already
 * split off plus 1 image on the line; a reason is required (the Leader decides on it).
 */
export const qtyRequestProblems = (
  draft: QtyRequestDraft,
  task: Pick<ProductionTask, "allocatedQty" | "subtasks">
) => {
  const problems: Partial<Record<"qty" | "reason", string>> = {};
  const value = wholeNumber(draft.qty);
  const minTotal = subtasksQty(task.subtasks) + 1;
  if (value === null || value < 1 || value > 1_000_000) problems.qty = "Số tấm nguyên ≥ 1.";
  else if (value === task.allocatedQty) problems.qty = "Số mới phải khác số đang giao.";
  else if (value < minTotal)
    problems.qty = `Ít nhất ${formatInteger(minTotal)} tấm: subtask đã tách ${formatInteger(minTotal - 1)} tấm, task gốc giữ ít nhất 1 tấm.`;
  const reason = draft.reason.trim();
  if (!reason) problems.reason = "Nhập lý do để Leader biết vì sao cần sửa.";
  else if (reason.length > 2000) problems.reason = "Lý do tối đa 2.000 ký tự.";
  return problems;
};

/** The request's problems as the one message under the inline form, one per line (null = fine). */
export const qtyRequestMessage = (
  draft: QtyRequestDraft,
  task: Pick<ProductionTask, "allocatedQty" | "subtasks">
) => {
  const problems = qtyRequestProblems(draft, task);
  const lines = [problems.qty, problems.reason].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
};

/** "10 → 12". */
export const qtyChangeLabel = (request: Pick<TaskQtyRequest, "fromQty" | "toQty">) =>
  `${formatInteger(request.fromQty)} → ${formatInteger(request.toQty)}`;

/** What the viewer may do with the open request: decide it (Leader / "update: all"), cancel it (who asked), or only read. */
export const qtyRequestActions = (
  request: Pick<TaskQtyRequest, "requestedBy">,
  options: { myId: string | null; canDecide: boolean; archived: boolean }
) => ({
  canDecide: !options.archived && options.canDecide,
  canCancel: !options.archived && options.myId !== null && request.requestedBy?.id === options.myId
});

// Moves -------------------------------------------------------------------------------------------------------

/**
 * QC sends the line back to its worker ("Cần sửa lại", PD-044): a noted, non-override move out of a QC queue status
 * ("Chờ QC" or "Đang check") — or into REWORK.
 */
export const isQcSendBack = (
  fromCode: string | null | undefined,
  option: Pick<TaskTransitionOption, "requiresNote" | "override">,
  targetCode?: string | null
) =>
  option.requiresNote &&
  !option.override &&
  ((fromCode !== null && fromCode !== undefined && qcQueueCodes.has(fromCode)) ||
    targetCode === "REWORK");

// Errors ------------------------------------------------------------------------------------------------------

/** Fallback copy for the PD-044 codes when the API sends no Vietnamese message. */
const pd044Messages: Record<string, string> = {
  SUBTASK_FOLLOWS_PARENT: "Subtask đi theo trạng thái của task gốc — hãy chuyển task gốc.",
  SUBTASK_FIELD_LOCKED: "Thông tin này của subtask đi theo task gốc — hãy sửa ở task gốc.",
  QTY_REQUEST_REQUIRED:
    "Bạn không sửa trực tiếp được số tấm giao — hãy gửi đề nghị để Leader duyệt.",
  QTY_REQUEST_OPEN: "Task này đã có một đề nghị sửa số tấm đang chờ duyệt.",
  TASK_ALREADY_DONE: "Task đã Done nên không đổi được nữa.",
  JOB_NOT_READY: "Job chưa Complete được: còn task chưa check."
};

/** Vietnamese-only letters: a server message without any is an English leftover (same test as errors.ts). */
const looksVietnamese = (message: string) =>
  /[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/i.test(message);

/**
 * Error copy for the line page's edits: the API's own Vietnamese message for the PD-044 codes (it names the lines and
 * numbers), else productionErrorMessage.
 */
export const taskEditErrorMessage = (error: unknown) => {
  if (isApiError(error)) {
    const fallback = pd044Messages[error.code];
    if (fallback) return error.message && looksVietnamese(error.message) ? error.message : fallback;
  }
  return productionErrorMessage(error);
};
