import { cn } from "cn";
import { MessageSquareWarning } from "lucide-react";
import type { ReactNode } from "react";

import type { ProductionTask } from "@/contracts/production-jobs";

import { formatDateTime, relativeDeadline } from "../../jobs-model";
import { KindBadge, LateBadge, Person, StatusChip } from "./job-bits";

/**
 * Compact task card for the kanban, the list view and the QC queue. The whole card opens the task;
 * `footer` holds move buttons (they stop propagation).
 */
export const TaskCard = ({
  task,
  timeZone,
  onOpen,
  footer,
  showStatus = false,
  meta,
  className,
  dragging = false
}: {
  task: ProductionTask;
  timeZone: string;
  onOpen: (taskId: string) => void;
  footer?: ReactNode;
  showStatus?: boolean;
  meta?: ReactNode;
  className?: string | undefined;
  dragging?: boolean;
}) => {
  const deadline = relativeDeadline(task.deadline);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Task #${task.number} · ${task.jobCode} · ${task.process.name}`}
      onClick={() => onOpen(task.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) onOpen(task.id);
      }}
      className={cn(
        "group/card flex cursor-pointer flex-col gap-2 rounded-xl border bg-surface p-3 text-left shadow-xs outline-none transition-[box-shadow,border-color] duration-150 hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
        task.isLate && "border-l-[3px] border-l-danger",
        dragging && "rotate-[1.5deg] shadow-xl ring-1 ring-brand/30",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-xs text-foreground-muted">
            <span className="font-mono">{task.project.code}</span> · {task.jobCode}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
            #{task.number} · {task.process.name}
            <KindBadge kind={task.kind} />
          </span>
        </div>
        {showStatus ? <StatusChip status={task.status} size="sm" className="shrink-0" /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
        <span className="tabular-nums">
          {task.qtyDone !== null ? `${task.qtyDone}/` : ""}
          {task.qtyAssigned} tấm
        </span>
        <span>{task.shift.name}</span>
        <span className={cn("tabular-nums", task.isLate && "font-medium text-danger")}>
          {formatDateTime(task.deadline, timeZone)}
          {!task.doneAt ? (
            <span className={cn(deadline.late ? "text-danger" : "text-foreground-subtle")}>
              {" "}
              · {deadline.label}
            </span>
          ) : null}
        </span>
        {task.isLate ? <LateBadge /> : null}
        {task.qcFailCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-danger">
            <MessageSquareWarning className="size-3" aria-hidden="true" />
            QC trả {task.qcFailCount}
          </span>
        ) : null}
      </div>
      {meta ?? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <Person user={task.assignee} size="xs" />
          {task.qc ? (
            <span className="flex min-w-0 items-center gap-1 text-foreground-muted">
              QC <Person user={task.qc} size="xs" />
            </span>
          ) : null}
        </div>
      )}
      {footer}
    </div>
  );
};
