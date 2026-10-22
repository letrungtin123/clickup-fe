import {
  AlarmClock,
  ArrowRightLeft,
  AtSign,
  BadgeCheck,
  CalendarCheck2,
  CalendarClock,
  CircleX,
  ClipboardCheck,
  Crown,
  FilePenLine,
  MessageCircleWarning,
  MessageSquare,
  SlidersHorizontal,
  Target,
  TriangleAlert,
  UserRoundPlus,
  UserRoundX
} from "lucide-react";

import type { Notification } from "@/contracts/notifications";
import { colorTokens, type ColorToken } from "@/contracts/work";

import type { NotificationDescription, SentenceSegment } from "./describe";

/**
 * Vietnamese sentences for the production (Photo Retouch) notification types — PLAN §8. Payloads come
 * from BE modules/production/notifications.ts: { jobCode, taskCode, taskNumber, processName, qty, deadline,
 * note, from, to, feedbackType, requesterName, fromDate, toDate, status, period, points, target, … };
 * quantity change requests (PD-044) add { requestId, fromQty, toQty, reason, approved, decisionNote }; a filled-in
 * quantity (PD-058) adds { filledQty, atDone } (a task without a quantity has `qty: null` — no "· N tấm"); a job
 * status change (PD-045) is { jobId, jobCode, jobName, from: { id, name, color }, to: { id, name, color } }.
 * A task is named by its code ("#1216" / "#1216a", PD-045); notifications sent before codes only hold the number.
 */

const str = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const two = (value: number) => String(value).padStart(2, "0");

const formatDeadline = (value: unknown) => {
  const raw = str(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  // Business timezone (UTC+7, no DST) so every viewer reads the same deadline.
  const local = new Date(date.getTime() + 7 * 3_600_000);
  return `${two(local.getUTCHours())}:${two(local.getUTCMinutes())}, ${two(local.getUTCDate())}/${two(local.getUTCMonth() + 1)}`;
};

const formatDay = (value: unknown) => {
  const match = str(value) ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(value) ?? "") : null;
  return match ? `${match[3]}/${match[2]}` : null;
};

/** The task's display code (PD-045), else its number (older notifications); null for a job-level notification. */
const taskCodeOf = (notification: Notification) => {
  const code = str(notification.payload.taskCode);
  if (code) return code;
  const number = num(notification.payload.taskNumber);
  return number !== null ? String(number) : null;
};

const taskRef = (notification: Notification): SentenceSegment => {
  const job = str(notification.payload.jobCode) ?? notification.title;
  const code = taskCodeOf(notification);
  return { text: code !== null ? `${job} #${code}` : job, strong: true };
};

const isColorToken = (value: unknown): value is ColorToken =>
  typeof value === "string" && (colorTokens as readonly string[]).includes(value);

/** A job status of a payload ({ id, name, color }) as a coloured chip; plain strong text without a known colour. */
const statusChip = (value: unknown): SentenceSegment => {
  const status = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const name = str(status.name) ?? "?";
  return isColorToken(status.color)
    ? { text: name, strong: true, color: status.color }
    : { text: name, strong: true };
};

/** "10 → 12" of a quantity change request (PD-044), null when the payload lacks a number. */
const qtyChange = (notification: Notification) => {
  const from = num(notification.payload.fromQty);
  const to = num(notification.payload.toQty);
  return from !== null && to !== null ? `${from} → ${to}` : null;
};

const taskSubject = (notification: Notification) => {
  const process = str(notification.payload.processName);
  const qty = num(notification.payload.qty);
  return [process, qty !== null ? `${qty} tấm` : null].filter(Boolean).join(" · ") || null;
};

export const describeProductionNotification = (
  notification: Notification
): NotificationDescription | null => {
  const actor: SentenceSegment = { text: notification.actor?.displayName ?? "Ai đó", strong: true };
  const excerpt = notification.body?.trim() ? notification.body.trim() : null;
  const note = str(notification.payload.note);
  const ref = taskRef(notification);
  const subject = taskSubject(notification);

  switch (notification.type) {
    case "production.task_assigned":
      return {
        segments: [actor, { text: " đã giao cho bạn task " }, ref],
        subject,
        excerpt: null,
        icon: UserRoundPlus,
        tone: "brand"
      };
    case "production.job_leader_assigned": {
      // { jobId, jobCode, jobName, projectCode, deadline, taskCount }
      const due = formatDeadline(notification.payload.deadline);
      const name = str(notification.payload.jobName);
      return {
        segments: [
          actor,
          { text: " đã giao bạn làm Leader job " },
          { text: str(notification.payload.jobCode) ?? notification.title, strong: true }
        ],
        subject: [name, due ? `hạn ${due}` : null].filter(Boolean).join(" · ") || null,
        excerpt: null,
        icon: Crown,
        tone: "brand"
      };
    }
    case "production.task_waiting_qc":
      return {
        segments: [{ text: "Task " }, ref, { text: " đang chờ bạn QC" }],
        subject,
        excerpt: null,
        icon: ClipboardCheck,
        tone: "brand"
      };
    case "production.qc_failed":
      // PD-044: a QC fail sends the line to "Cần sửa lại" with the QC's reason.
      return {
        segments: [actor, { text: " yêu cầu sửa lại task " }, ref],
        subject,
        excerpt: note ?? excerpt,
        icon: CircleX,
        tone: "danger"
      };
    case "production.task_checked":
      return {
        segments: [{ text: "Task " }, ref, { text: " đã qua QC (Đã check)" }],
        subject,
        excerpt: null,
        icon: BadgeCheck,
        tone: "success"
      };
    case "production.qty_change_requested": {
      // PD-044, to the job's Leader: { …task, requestId, fromQty, toQty, reason }.
      const change = qtyChange(notification);
      return {
        segments: [
          actor,
          { text: " đề nghị sửa số tấm giao của task " },
          ref,
          ...(change ? [{ text: ": " }, { text: change, strong: true }] : [])
        ],
        subject,
        excerpt: str(notification.payload.reason) ?? excerpt,
        icon: FilePenLine,
        tone: "warning"
      };
    }
    case "production.qty_change_decided": {
      // PD-044, to the worker who asked: { …task, requestId, fromQty, toQty, approved, decisionNote }.
      const approved = notification.payload.approved === true;
      const change = qtyChange(notification);
      return {
        segments: [
          actor,
          {
            text: approved
              ? " đã duyệt đề nghị sửa số tấm của task "
              : " đã từ chối đề nghị sửa số tấm của task "
          },
          ref,
          ...(change ? [{ text: ": " }, { text: change, strong: true }] : [])
        ],
        subject,
        excerpt: str(notification.payload.decisionNote) ?? excerpt,
        icon: approved ? BadgeCheck : CircleX,
        tone: approved ? "success" : "danger"
      };
    }
    case "production.qty_filled": {
      // PD-058, to the job's Leader (or the Admins): { …task, filledQty, atDone } — someone filled in the quantity of a
      // task that had none, directly or when moving it to Done.
      const filled = num(notification.payload.filledQty);
      return {
        segments: [
          actor,
          { text: " đã điền số lượng " },
          ...(filled !== null ? [{ text: `${filled}`, strong: true }, { text: " " }] : []),
          { text: "cho task " },
          ref
        ],
        subject,
        excerpt: notification.payload.atDone === true ? "Điền khi chuyển Done" : null,
        icon: FilePenLine,
        tone: "brand"
      };
    }
    case "production.task_due_soon": {
      const due = formatDeadline(notification.payload.deadline);
      return {
        segments: [
          { text: "Task " },
          ref,
          { text: due ? ` sắp đến hạn lúc ${due}` : " sắp đến hạn" }
        ],
        subject,
        excerpt: null,
        icon: AlarmClock,
        tone: "warning"
      };
    }
    case "production.task_late": {
      const due = formatDeadline(notification.payload.deadline);
      return {
        segments: [
          { text: "Task " },
          ref,
          { text: due ? ` đã trễ deadline (${due})` : " đã trễ deadline" }
        ],
        subject,
        excerpt: null,
        icon: TriangleAlert,
        tone: "danger"
      };
    }
    case "production.qty_changed": {
      const from = num(notification.payload.from);
      const to = num(notification.payload.to);
      return {
        segments: [
          actor,
          { text: " đã sửa số tấm của " },
          ref,
          ...(from !== null && to !== null
            ? [{ text: ": " }, { text: `${from} → ${to} tấm`, strong: true }]
            : [])
        ],
        subject: null,
        excerpt: note,
        icon: SlidersHorizontal,
        tone: "warning"
      };
    }
    case "production.job_status_changed": {
      // PD-045, to the job's Leader and production Account / Admin: { jobId, jobCode, jobName, from, to }.
      const name = str(notification.payload.jobName);
      return {
        segments: [
          actor,
          { text: " đổi trạng thái job " },
          { text: str(notification.payload.jobCode) ?? notification.title, strong: true },
          { text: ": " },
          statusChip(notification.payload.from),
          { text: " → " },
          statusChip(notification.payload.to)
        ],
        subject: name,
        excerpt: null,
        icon: ArrowRightLeft,
        tone: "brand"
      };
    }
    case "production.feedback": {
      const type = str(notification.payload.feedbackType);
      return {
        segments: [
          { text: "Khách phản hồi " },
          { text: type === "EXTRA" ? "yêu cầu thêm" : "sai", strong: true },
          { text: " cho job " },
          { text: str(notification.payload.jobCode) ?? notification.title, strong: true }
        ],
        subject: null,
        excerpt: note ?? excerpt,
        icon: MessageCircleWarning,
        tone: "warning"
      };
    }
    case "production.mentioned":
      return {
        segments: [
          actor,
          { text: " đã nhắc đến bạn trong " },
          taskCodeOf(notification) !== null
            ? ref
            : { text: `job ${notification.title}`, strong: true }
        ],
        subject: null,
        excerpt,
        icon: AtSign,
        tone: "brand"
      };
    case "production.commented":
      return {
        segments: [
          actor,
          { text: " đã bình luận trong " },
          taskCodeOf(notification) !== null
            ? ref
            : { text: `job ${notification.title}`, strong: true }
        ],
        subject: null,
        excerpt,
        icon: MessageSquare,
        tone: "muted"
      };
    case "production.leave_requested": {
      const from = formatDay(notification.payload.fromDate);
      const to = formatDay(notification.payload.toDate);
      const span = from ? (to && to !== from ? ` ${from} – ${to}` : ` ngày ${from}`) : "";
      return {
        segments: [
          { text: str(notification.payload.requesterName) ?? notification.title, strong: true },
          { text: ` xin nghỉ${span}` }
        ],
        subject: null,
        // PD-057: the body says which part and why ("Nghỉ buổi sáng 20/10: Khám bệnh") for the approver.
        excerpt,
        icon: CalendarClock,
        tone: "brand"
      };
    }
    case "production.leave_decided": {
      const approved = str(notification.payload.status) === "APPROVED";
      return {
        segments: [
          { text: "Đơn nghỉ của bạn " },
          { text: approved ? "đã được duyệt" : "bị từ chối", strong: true }
        ],
        subject: null,
        excerpt,
        icon: CalendarCheck2,
        tone: approved ? "success" : "danger"
      };
    }
    case "production.kpi_settled": {
      const period = str(notification.payload.period);
      return {
        segments: [{ text: period ? `Đã chốt KPI kỳ ${period}` : "Đã chốt KPI" }],
        subject: null,
        excerpt,
        icon: Target,
        tone: notification.payload.met === false ? "warning" : "success"
      };
    }
    case "production.leader_removed": {
      // To production Admins: { userId, userName, reason: role_removed | deactivated, jobCount, jobs[{ id, code }] }.
      const name = str(notification.payload.userName) ?? notification.title;
      const count = num(notification.payload.jobCount);
      const codes = Array.isArray(notification.payload.jobs)
        ? notification.payload.jobs
            .map((job: unknown) => (job && typeof job === "object" ? str((job as { code?: unknown }).code) : null))
            .filter((code): code is string => code !== null)
        : [];
      const shown = codes.slice(0, 5);
      const more = (count ?? codes.length) - shown.length;
      return {
        segments: [
          { text: name, strong: true },
          {
            text:
              str(notification.payload.reason) === "deactivated"
                ? " đã bị vô hiệu hóa — còn "
                : " không còn là Leader — còn "
          },
          { text: count !== null ? `${count} job` : "job", strong: true },
          { text: " cần giao Leader khác" }
        ],
        subject: shown.length > 0 ? `${shown.join(", ")}${more > 0 ? ` và ${more} job khác` : ""}` : null,
        excerpt: null,
        icon: UserRoundX,
        tone: "warning"
      };
    }
    default:
      return null;
  }
};

/** Where a production notification leads (same paths as the e-mail links). */
export const productionPath = (notification: Notification) => {
  const taskId = notification.target.productionTaskId ?? str(notification.payload.productionTaskId);
  if (taskId) return `/production/tasks/${taskId}`;
  const jobId = notification.target.jobId ?? str(notification.payload.jobId);
  if (jobId) return `/production/jobs/${jobId}`;
  // Lịch nghỉ tabs: a new request waits in "Chờ duyệt"; a decision is about one of "Đơn của tôi".
  if (notification.type === "production.leave_requested") return "/production/leave?tab=pending";
  if (notification.type.startsWith("production.leave_")) return "/production/leave?tab=mine";
  if (notification.type === "production.kpi_settled") return "/production/scores";
  if (notification.type === "production.leader_removed") {
    // The jobs list filtered to the jobs this person still leads.
    const userId = str(notification.payload.userId);
    return userId ? `/production/jobs?scope=all&leader=${encodeURIComponent(userId)}` : "/production/jobs";
  }
  return null;
};
