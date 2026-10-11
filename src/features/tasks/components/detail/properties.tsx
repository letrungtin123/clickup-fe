import { cn } from "cn";
import { CalendarDays, CalendarPlus, Check, CircleDot, Flag, Plus, RotateCcw, UserRound, X } from "lucide-react";
import type { ReactNode } from "react";

import { PriorityFlag, StatusPill } from "@/components/shared/task-meta";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import type { TaskDetail } from "@/contracts/work";

import { dueTone, dueToneClass, dueToneLabel, formatFullDate } from "../../due";
import { useWorkflow } from "../../hooks";
import { useInlineEditor, type InlineEditorKind } from "../../inline-editor-context";
import { relativeTime } from "../../time";
import { useTaskActions } from "../../use-task-actions";

const Row = ({ icon: Icon, label, children }: { icon: typeof Flag; label: string; children: ReactNode }) => (
  <>
    <dt className="flex h-8 items-center gap-2 text-[13px] text-foreground-muted">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </dt>
    <dd className="flex min-h-8 min-w-0 flex-wrap items-center gap-1.5">{children}</dd>
  </>
);

/** Value button that opens the panel's shared inline editor. */
const EditTrigger = ({
  task,
  kind,
  editable,
  label,
  children,
  className
}: {
  task: TaskDetail;
  kind: InlineEditorKind;
  editable: boolean;
  label: string;
  children: ReactNode;
  className?: string;
}) => {
  const openEditor = useInlineEditor();
  if (!editable) return <span className={cn("inline-flex items-center gap-1.5 px-1.5 text-[13px]", className)}>{children}</span>;
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      onClick={(event) => openEditor?.({ kind, task, anchor: event.currentTarget })}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] outline-none transition-colors duration-100 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {children}
    </button>
  );
};

/** Status, assignees, priority, dates and creator — every field inline editable per capability. */
export const DetailProperties = ({ task }: { task: TaskDetail }) => {
  const caps = task.capabilities;
  const actions = useTaskActions();
  const workflow = useWorkflow(task.projectId, task.listId);
  const statuses = workflow.data?.items ?? [];
  const isOpen = task.status.category === "active";
  const doneStatus = statuses.find((status) => status.category === "done") ?? statuses.find((status) => status.category !== "active");
  const initialStatus = statuses.find((status) => status.isInitial) ?? statuses[0];
  const tone = dueTone(task);

  return (
    <dl className="grid grid-cols-[6.25rem_1fr] gap-x-2 gap-y-0.5 sm:grid-cols-[8.5rem_1fr] sm:gap-x-3">
      <Row icon={CircleDot} label="Trạng thái">
        <EditTrigger task={task} kind="status" editable={caps.canEdit} label={`Trạng thái: ${task.status.name}. Đổi trạng thái`}>
          <StatusPill status={task.status} />
        </EditTrigger>
        {caps.canEdit && (isOpen ? doneStatus : initialStatus) ? (
          <Button
            variant="ghost"
            size="xs"
            className={cn("text-foreground-muted", isOpen && "hover:text-success")}
            onClick={() => {
              const target = isOpen ? doneStatus : initialStatus;
              if (target) void actions.changeStatus(task, target);
            }}
          >
            {isOpen ? <Check /> : <RotateCcw />}
            {isOpen ? "Hoàn thành" : "Mở lại"}
          </Button>
        ) : null}
      </Row>

      <Row icon={UserRound} label="Người thực hiện">
        {task.assignees.map((user) => (
          <span
            key={user.id}
            className="group/chip inline-flex h-7 items-center gap-1.5 rounded-full border bg-surface py-0.5 pr-1 pl-0.5 text-xs"
          >
            <UserAvatar user={user} size="xs" />
            <span className="max-w-[8rem] truncate">{user.displayName}</span>
            {caps.canAssign ? (
              <button
                type="button"
                aria-label={`Gỡ ${user.displayName}`}
                onClick={() => actions.toggleAssignee(task, user)}
                className="relative inline-flex size-4 items-center justify-center rounded-full text-foreground-subtle outline-none pointer-coarse:size-6 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        ))}
        {caps.canAssign ? (
          <EditTrigger task={task} kind="assignees" editable label="Thêm người thực hiện" className="h-7 text-foreground-muted">
            <Plus className="size-3.5" />
            {task.assignees.length === 0 ? "Giao việc" : null}
          </EditTrigger>
        ) : task.assignees.length === 0 ? (
          <span className="px-1.5 text-[13px] text-foreground-subtle">Chưa giao</span>
        ) : null}
      </Row>

      <Row icon={Flag} label="Ưu tiên">
        <EditTrigger task={task} kind="priority" editable={caps.canEdit} label="Đổi mức ưu tiên">
          <PriorityFlag priority={task.priority} showLabel className="text-[13px] text-foreground" />
        </EditTrigger>
      </Row>

      <Row icon={CalendarPlus} label="Ngày bắt đầu">
        <EditTrigger task={task} kind="start" editable={caps.canEdit} label="Đặt ngày bắt đầu">
          {task.startAt ? (
            <span className="first-letter:uppercase">{formatFullDate(task.startAt)}</span>
          ) : (
            <span className="text-foreground-subtle">Chưa đặt</span>
          )}
        </EditTrigger>
      </Row>

      <Row icon={CalendarDays} label="Hạn chót">
        <EditTrigger task={task} kind="due" editable={caps.canEdit} label="Đặt hạn chót">
          {task.dueAt ? (
            <span className={cn("first-letter:uppercase", dueToneClass[tone])}>{formatFullDate(task.dueAt)}</span>
          ) : (
            <span className="text-foreground-subtle">Chưa đặt</span>
          )}
        </EditTrigger>
        {task.dueAt && (tone === "overdue" || tone === "today") ? (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", tone === "overdue" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
            {dueToneLabel[tone]}
          </span>
        ) : null}
      </Row>

      {task.createdBy ? (
        <Row icon={UserRound} label="Người tạo">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1.5 text-[13px] whitespace-nowrap text-foreground-muted">
            <UserAvatar user={task.createdBy} size="xs" />
            <span>{task.createdBy.displayName}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={task.createdAt} title={formatFullDate(task.createdAt)}>
              {relativeTime(task.createdAt)}
            </time>
          </span>
        </Row>
      ) : null}
    </dl>
  );
};
