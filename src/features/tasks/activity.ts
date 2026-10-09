import type { Activity, TaskPriority } from "@/contracts/work";
import { priorityMeta } from "@/lib/task-meta";

/**
 * Structured activity events (spec §26) → human-readable Vietnamese sentences. Pure data so the
 * rendering stays dumb and the wording is unit-tested. The actor is rendered separately in front.
 */

export type ActivityPart =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "status"; name: string; color: string | null }
  | { kind: "priority"; priority: TaskPriority }
  | { kind: "date"; iso: string }
  | { kind: "user"; name: string; id: string | null }
  | { kind: "file"; name: string };

export type ActivityIcon =
  | "created"
  | "edit"
  | "status"
  | "reopen"
  | "priority"
  | "date"
  | "assign"
  | "unassign"
  | "move"
  | "attach"
  | "delete"
  | "restore"
  | "done"
  | "other";

export type ActivitySentence = { icon: ActivityIcon; parts: ActivityPart[] };

export type ActivityContext = {
  /** Display name for a user id (directory cache, assignees, members). */
  resolveUser?: ((id: string) => string | undefined) | undefined;
  /** List name for a list id (project lists). */
  resolveList?: ((id: string) => string | undefined) | undefined;
};

const text = (value: string): ActivityPart => ({ kind: "text", text: value });
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const str = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
const isPriority = (value: unknown): value is TaskPriority =>
  typeof value === "string" && value in priorityMeta;

const statusPart = (value: Record<string, unknown>): ActivityPart | null => {
  const name = str(value.name) ?? str(value.statusName);
  return name ? { kind: "status", name, color: str(value.color) } : null;
};

/** User referenced by an assignee event: `{userId}` / `{user:{id,displayName}}` when the API sends it. */
const userPart = (value: Record<string, unknown>, context: ActivityContext): ActivityPart | null => {
  const nested = record(value.user);
  const id = str(value.userId) ?? str(nested.id);
  const name = str(nested.displayName) ?? str(value.displayName) ?? (id ? context.resolveUser?.(id) : undefined);
  return name ? { kind: "user", name, id } : null;
};

const dateChange = (
  label: string,
  previous: string | null,
  next: string | null
): ActivityPart[] => {
  if (!previous && next) return [text(`đặt ${label} `), { kind: "date", iso: next }];
  if (previous && !next) return [text(`xóa ${label} `), { kind: "date", iso: previous }];
  if (previous && next) {
    return [text(`đổi ${label} `), { kind: "date", iso: previous }, text(" → "), { kind: "date", iso: next }];
  }
  return [text(`cập nhật ${label}`)];
};

export const describeActivity = (activity: Activity, context: ActivityContext = {}): ActivitySentence => {
  const previous = record(activity.previousValue);
  const next = record(activity.newValue);

  switch (activity.action) {
    case "TASK_CREATED": {
      const status = statusPart(next);
      return {
        icon: "created",
        parts: status ? [text("đã tạo công việc ở trạng thái "), status] : [text("đã tạo công việc")]
      };
    }
    case "TASK_TITLE_CHANGED": {
      const before = str(previous.title);
      const after = str(next.title);
      return {
        icon: "edit",
        parts:
          before && after
            ? [text("đã đổi tên "), { kind: "strong", text: before }, text(" thành "), { kind: "strong", text: after }]
            : [text("đã đổi tên công việc")]
      };
    }
    case "TASK_DESCRIPTION_CHANGED":
      return { icon: "edit", parts: [text("đã cập nhật mô tả")] };
    case "TASK_STATUS_CHANGED": {
      const before = statusPart(previous);
      const after = statusPart(next);
      const lead = next.reason === "workflow_changed" ? "đã đổi quy trình trạng thái: " : "đã đổi trạng thái ";
      if (before && after) return { icon: "status", parts: [text(lead), before, text(" → "), after] };
      if (after) return { icon: "status", parts: [text(`${lead}sang `), after] };
      return { icon: "status", parts: [text("đã đổi trạng thái")] };
    }
    case "TASK_REOPENED": {
      const after = statusPart(next);
      const reason = next.reason === "reassigned" ? "đã giao lại việc đã xong nên công việc được mở lại" : "đã mở lại công việc";
      return { icon: "reopen", parts: after ? [text(`${reason} → `), after] : [text(reason)] };
    }
    case "TASK_COMPLETED":
      return { icon: "done", parts: [text("đã hoàn thành công việc")] };
    case "TASK_PRIORITY_CHANGED": {
      const before = previous.priority;
      const after = next.priority;
      if (isPriority(before) && isPriority(after)) {
        return {
          icon: "priority",
          parts: [text("đã đổi mức ưu tiên "), { kind: "priority", priority: before }, text(" → "), { kind: "priority", priority: after }]
        };
      }
      return {
        icon: "priority",
        parts: isPriority(after)
          ? [text("đã đặt mức ưu tiên "), { kind: "priority", priority: after }]
          : [text("đã đổi mức ưu tiên")]
      };
    }
    case "TASK_START_DATE_CHANGED":
      return { icon: "date", parts: [text("đã "), ...dateChange("ngày bắt đầu", str(previous.startAt), str(next.startAt))] };
    case "TASK_DUE_DATE_CHANGED":
      return { icon: "date", parts: [text("đã "), ...dateChange("hạn chót", str(previous.dueAt), str(next.dueAt))] };
    case "TASK_ASSIGNEE_ADDED": {
      const user = userPart(next, context);
      return {
        icon: "assign",
        parts: user ? [text("đã giao việc cho "), user] : [text("đã thêm một người thực hiện")]
      };
    }
    case "TASK_ASSIGNEE_REMOVED": {
      const user = userPart(previous, context) ?? userPart(next, context);
      return {
        icon: "unassign",
        parts: user ? [text("đã gỡ "), user, text(" khỏi người thực hiện")] : [text("đã gỡ một người thực hiện")]
      };
    }
    case "TASK_MOVED": {
      const fromList = str(previous.listId);
      const toList = str(next.listId);
      if (fromList && toList && fromList !== toList) {
        const fromName = context.resolveList?.(fromList);
        const toName = context.resolveList?.(toList);
        return {
          icon: "move",
          parts:
            fromName && toName
              ? [text("đã chuyển từ danh sách "), { kind: "strong", text: fromName }, text(" sang "), { kind: "strong", text: toName }]
              : toName
                ? [text("đã chuyển sang danh sách "), { kind: "strong", text: toName }]
                : [text("đã chuyển công việc sang danh sách khác")]
        };
      }
      if (str(previous.parentTaskId) && !str(next.parentTaskId)) {
        return { icon: "move", parts: [text("đã tách thành công việc độc lập")] };
      }
      if (str(next.parentTaskId)) {
        return { icon: "move", parts: [text("đã chuyển thành việc con của một công việc khác")] };
      }
      return { icon: "move", parts: [text("đã di chuyển công việc")] };
    }
    case "TASK_ATTACHMENT_ADDED": {
      const name = str(next.fileName);
      return { icon: "attach", parts: name ? [text("đã đính kèm "), { kind: "file", name }] : [text("đã đính kèm một tệp")] };
    }
    case "TASK_ATTACHMENT_REMOVED": {
      const name = str(previous.fileName);
      return { icon: "delete", parts: name ? [text("đã gỡ tệp "), { kind: "file", name }] : [text("đã gỡ một tệp đính kèm")] };
    }
    case "TASK_DELETED": {
      const count = typeof next.subtaskCount === "number" ? next.subtaskCount : 0;
      return {
        icon: "delete",
        parts: [text(count > 0 ? `đã chuyển công việc và ${count} việc con vào thùng rác` : "đã chuyển công việc vào thùng rác")]
      };
    }
    case "TASK_RESTORED":
      return { icon: "restore", parts: [text("đã khôi phục công việc từ thùng rác")] };
    default:
      return { icon: "other", parts: [text("đã cập nhật công việc")] };
  }
};

/** Flat text of a sentence (tests, aria labels, notifications). */
export const sentenceText = (sentence: ActivitySentence, formatDate: (iso: string) => string = (iso) => iso) =>
  sentence.parts
    .map((part) => {
      switch (part.kind) {
        case "text":
        case "strong":
          return part.text;
        case "status":
          return part.name;
        case "priority":
          return priorityMeta[part.priority].label;
        case "date":
          return formatDate(part.iso);
        case "user":
          return part.name;
        case "file":
          return part.name;
        default:
          return "";
      }
    })
    .join("");
