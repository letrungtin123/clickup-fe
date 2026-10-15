import {
  ArrowRightLeft,
  Briefcase,
  CirclePlus,
  FilePenLine,
  ListTree,
  NotebookPen,
  Pencil,
  SlidersHorizontal,
  Trash2,
  UserRoundCog,
  type LucideIcon
} from "lucide-react";

import type { TaskLog } from "@/contracts/production-jobs";

/** One icon per history action (job timeline, task timeline and the job's "Nhật ký"). */
export const logIcons: Record<TaskLog["action"], LucideIcon> = {
  CREATE: CirclePlus,
  STATUS: ArrowRightLeft,
  QTY: SlidersHorizontal,
  ASSIGN: UserRoundCog,
  NOTE: NotebookPen,
  FIELD: Pencil,
  // Job-level edit history (task_id null): deadline, Leader, custom fields, tags…
  JOB: Briefcase,
  // A deleted line (PD-036).
  DELETE: Trash2,
  // PD-044: a subtask created / edited / deleted on the line, and a request to change "Số lượng giao".
  SUBTASK: ListTree,
  QTY_REQUEST: FilePenLine
};

type LogToneKey = "danger" | "success" | "warning" | "none";

/** The icon bubble of a history row by its tone (jobs-model logTone; "none" = neutral). */
export const logToneBubble: Record<LogToneKey, string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  none: ""
};

/** The left rule of a history row's quoted note / reason by its tone. */
export const logToneBorder: Record<LogToneKey, string> = {
  danger: "border-danger",
  warning: "border-warning",
  success: "border-success",
  none: "border-border-strong"
};
