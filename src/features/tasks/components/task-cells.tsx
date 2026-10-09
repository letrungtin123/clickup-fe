import { cn } from "cn";
import { CalendarDays, Flag, MessageSquare, Paperclip, UserPlus, Workflow } from "lucide-react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";

import { PriorityFlag } from "@/components/shared/task-meta";
import { AvatarGroup } from "@/components/shared/user-avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TaskSummary } from "@/contracts/work";
import { priorityMeta } from "@/lib/task-meta";

import { dueTone, dueToneClass, dueToneLabel, formatFullDate, formatShortDate } from "../due";
import { useInlineEditor, type InlineEditorKind } from "../inline-editor-context";
import { StatusIcon } from "./status-icon";

const stop = (event: MouseEvent | PointerEvent) => event.stopPropagation();

/** Button that opens the shared inline editor for one field of a task (or renders static). */
const EditableCell = ({
  task,
  kind,
  editable,
  label,
  className,
  children
}: {
  task: TaskSummary;
  kind: InlineEditorKind;
  editable: boolean;
  label: string;
  className?: string | undefined;
  children: ReactNode;
}) => {
  const openEditor = useInlineEditor();
  if (!editable || !openEditor) {
    return (
      <span className={cn("inline-flex items-center", className)} aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      onPointerDown={stop}
      onClick={(event) => {
        event.stopPropagation();
        openEditor({ kind, task, anchor: event.currentTarget });
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
      className={cn(
        "inline-flex items-center rounded-md outline-none transition-colors duration-100 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {children}
    </button>
  );
};

export const StatusCell = ({ task, editable, size = "md" }: { task: TaskSummary; editable: boolean; size?: "md" | "lg" }) => (
  <EditableCell
    task={task}
    kind="status"
    editable={editable}
    label={`Trạng thái: ${task.status.name}`}
    className="size-6 shrink-0 justify-center pointer-coarse:size-8"
  >
    <StatusIcon status={task.status} size={size} />
  </EditableCell>
);

export const AssigneesCell = ({
  task,
  editable,
  max = 3,
  className
}: {
  task: TaskSummary;
  editable: boolean;
  max?: number;
  className?: string | undefined;
}) => (
  <EditableCell
    task={task}
    kind="assignees"
    editable={editable}
    label={
      task.assignees.length > 0
        ? `Người thực hiện: ${task.assignees.map((user) => user.displayName).join(", ")}`
        : "Chưa giao — thêm người thực hiện"
    }
    className={cn("h-7 min-w-7 justify-center px-0.5 pointer-coarse:h-8 pointer-coarse:min-w-8", className)}
  >
    {task.assignees.length > 0 ? (
      <AvatarGroup users={task.assignees} max={max} size="xs" />
    ) : (
      <span className="flex size-5 items-center justify-center rounded-full border border-dashed border-border-strong text-foreground-subtle">
        <UserPlus className="size-3" aria-hidden="true" />
      </span>
    )}
  </EditableCell>
);

export const DueCell = ({
  task,
  editable,
  className,
  showEmpty = true
}: {
  task: TaskSummary;
  editable: boolean;
  className?: string | undefined;
  showEmpty?: boolean;
}) => {
  const tone = dueTone(task);
  const content = task.dueAt ? (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", dueToneClass[tone])}>
      {tone === "overdue" || tone === "today" ? <CalendarDays className="size-3.5" aria-hidden="true" /> : null}
      {formatShortDate(task.dueAt)}
    </span>
  ) : showEmpty ? (
    <CalendarDays className="size-3.5 text-foreground-subtle/70" aria-hidden="true" />
  ) : null;
  if (!content) return null;
  const cell = (
    <EditableCell
      task={task}
      kind="due"
      editable={editable}
      label={task.dueAt ? `Hạn chót: ${formatFullDate(task.dueAt)} (${dueToneLabel[tone]})` : "Đặt hạn chót"}
      className={cn("h-7 px-1.5 pointer-coarse:h-8", className)}
    >
      {content}
    </EditableCell>
  );
  if (!task.dueAt) return cell;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{cell}</TooltipTrigger>
      <TooltipContent>
        <span className="first-letter:uppercase">{formatFullDate(task.dueAt)}</span>
        <span className="opacity-70">· {dueToneLabel[tone]}</span>
      </TooltipContent>
    </Tooltip>
  );
};

export const PriorityCell = ({
  task,
  editable,
  showLabel = false,
  className
}: {
  task: TaskSummary;
  editable: boolean;
  showLabel?: boolean;
  className?: string | undefined;
}) => (
  <EditableCell
    task={task}
    kind="priority"
    editable={editable}
    label={`Ưu tiên: ${priorityMeta[task.priority].label}`}
    className={cn("h-7 min-w-7 justify-center px-1 pointer-coarse:h-8 pointer-coarse:min-w-8", className)}
  >
    {task.priority === "normal" && !showLabel ? (
      <Flag className="size-3.5 text-foreground-subtle/70" aria-hidden="true" />
    ) : (
      <PriorityFlag priority={task.priority} showLabel={showLabel} />
    )}
  </EditableCell>
);

/** Subtask / comment / attachment counters (only the non-zero ones). */
export const TaskCounts = ({
  task,
  showSubtasks = false,
  className
}: {
  task: TaskSummary;
  showSubtasks?: boolean;
  className?: string | undefined;
}) => {
  const parts: ReactNode[] = [];
  if (showSubtasks && task.subtaskCount > 0) {
    parts.push(
      <span key="sub" className="inline-flex items-center gap-0.5" title={`${task.subtaskCount - task.openSubtaskCount}/${task.subtaskCount} việc con đã xong`}>
        <Workflow className="size-3" aria-hidden="true" />
        {task.subtaskCount - task.openSubtaskCount}/{task.subtaskCount}
      </span>
    );
  }
  if (task.commentCount > 0) {
    parts.push(
      <span key="c" className="inline-flex items-center gap-0.5" title={`${task.commentCount} bình luận`}>
        <MessageSquare className="size-3" aria-hidden="true" />
        {task.commentCount}
      </span>
    );
  }
  if (task.attachmentCount > 0) {
    parts.push(
      <span key="a" className="inline-flex items-center gap-0.5" title={`${task.attachmentCount} tệp đính kèm`}>
        <Paperclip className="size-3" aria-hidden="true" />
        {task.attachmentCount}
      </span>
    );
  }
  if (parts.length === 0) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2 text-[11px] text-foreground-subtle tabular-nums", className)}>
      {parts}
    </span>
  );
};
