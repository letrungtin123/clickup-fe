import { cn } from "cn";
import { Coins, FilePenLine, ListTree, MessageSquareWarning } from "lucide-react";
import { memo, type HTMLAttributes, type ReactNode } from "react";

import type { CustomField } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";
import { toneClass } from "@/lib/colors";

import { formatCredit, formatInteger } from "../../format";
import { formatDateTime, formatWorkDay, myCreditSummary, relativeDeadline } from "../../jobs-model";
import { CustomFieldChips } from "../list-filters";
import { KindBadge, LateBadge, Person, StatusChip } from "./job-bits";
import { StatusSelect } from "./transition-controls";

/**
 * Compact task card for the kanban, the list view and the QC queue. The whole card opens the task;
 * `footer` holds extra buttons (they stop propagation). With `showStatus` the status sits at the top
 * right — the status dropdown of the caller's moves when `onMove` is given (PD-044), a plain chip
 * otherwise. Memoized: while a card is dragged the board re-renders its draggable wrappers, but cards
 * whose task did not change are skipped (PERF-16). `dragHandle` (kanban) puts the drag
 * listeners/attributes on the card itself, so a card is one tab stop with a visible ring: Enter opens
 * it, Space picks it up (dnd-kit keyboard sensor) — keys pressed in a control inside the card stay there.
 *
 * PLAN §7 "Task của tôi: xem note QC; điểm từng task": the caller's points on the task ("điểm của
 * tôi", worker or QC) and the latest QC-fail note with who / when (red until the task passes QC,
 * muted after). TASK custom fields marked "hiện trong bảng" show as "Label: value" chips. A line
 * split into subtasks says "+N subtask"; an open quantity request shows "Đề nghị 10 → 12" (PD-044).
 */
export const TaskCard = memo(function TaskCard({
  task,
  timeZone,
  onOpen,
  footer,
  showStatus = false,
  onMove,
  busy = false,
  meta,
  fields,
  className,
  dragging = false,
  dragHandle
}: {
  task: ProductionTask;
  timeZone: string;
  onOpen: (taskId: string) => void;
  footer?: ReactNode;
  showStatus?: boolean;
  /** With `showStatus`: the status becomes the move dropdown (the task's own capabilities). */
  onMove?: ((task: ProductionTask, option: TaskTransitionOption) => void) | undefined;
  /** A move of this task is in flight. */
  busy?: boolean;
  meta?: ReactNode;
  /** Active TASK custom fields (fieldsFor); the `showInTable` ones with a value become chips. */
  fields?: readonly CustomField[] | undefined;
  className?: string | undefined;
  dragging?: boolean;
  dragHandle?: HTMLAttributes<HTMLDivElement> | undefined;
}) {
  const deadline = relativeDeadline(task.deadline);
  const { onKeyDown: dragKeyDown, ...handle } = dragHandle ?? {};
  const credits = myCreditSummary(task);
  // Red while the work is redone / re-checked; muted history once the task passed QC.
  const qcNote = task.lastQcFail;
  const qcOpen = task.checkedAt === null;
  return (
    <div
      {...handle}
      role="button"
      tabIndex={0}
      aria-label={`Task #${task.code} · ${task.jobCode} · ${task.process.name}`}
      onClick={() => onOpen(task.id)}
      onKeyDown={(event) => {
        // Keys pressed in a control inside the card (status dropdown, buttons) are theirs.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter") {
          onOpen(task.id);
          return;
        }
        dragKeyDown?.(event);
      }}
      className={cn(
        // relative: contains the sr-only label (absolutely positioned) — <main> is relative, so it
        // would otherwise widen <main> from cards scrolled out of a kanban column.
        "group/card relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-surface p-3 text-left shadow-xs outline-none transition-[box-shadow,border-color] duration-150 hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
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
            #{task.code} · {task.process.name}
            <KindBadge kind={task.kind} />
          </span>
        </div>
        {showStatus ? (
          onMove ? (
            <span className="flex max-w-[55%] shrink-0 justify-end">
              <StatusSelect
                task={task}
                onMove={(option) => onMove(task, option)}
                busy={busy}
                size="sm"
                align="end"
              />
            </span>
          ) : (
            <StatusChip status={task.status} size="sm" className="shrink-0" />
          )
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
        <span className="tabular-nums">
          {task.qtyDone !== null ? `${task.qtyDone}/` : ""}
          {task.qtyAssigned} tấm
        </span>
        {task.subtasks.length > 0 ? (
          <span
            className="inline-flex items-center gap-1 tabular-nums"
            title={`${task.subtasks.map((subtask) => `#${subtask.code} ${subtask.process.name} · ${subtask.qtyAssigned} tấm`).join("\n")}\nTổng Leader giao: ${task.allocatedQty} tấm`}
          >
            <ListTree className="size-3" aria-hidden="true" />+{task.subtasks.length} subtask
          </span>
        ) : null}
        {task.pendingQtyRequest ? (
          <span
            className={cn(
              toneClass("amber"),
              "inline-flex items-center gap-1 rounded-md bg-(--tone-soft) px-1.5 font-medium text-(--tone-text) tabular-nums"
            )}
            title={`Chờ Leader duyệt — lý do: ${task.pendingQtyRequest.reason}`}
          >
            <FilePenLine className="size-3" aria-hidden="true" />
            Đề nghị {formatInteger(task.pendingQtyRequest.fromQty)} →{" "}
            {formatInteger(task.pendingQtyRequest.toQty)}
          </span>
        ) : null}
        <span>{task.shift.name}</span>
        <span className={cn("tabular-nums", task.isLate && "font-medium text-danger")}>
          Giao {formatWorkDay(task.deadline, timeZone)}
          {!task.doneAt ? (
            <span className={cn(deadline.late ? "text-danger" : "text-foreground-subtle")}>
              {" "}
              · {deadline.label}
            </span>
          ) : null}
        </span>
        {task.isLate ? <LateBadge /> : null}
        {credits ? (
          <span
            className="inline-flex items-center gap-1 font-medium text-success tabular-nums"
            title={`Điểm của tôi: ${credits.detail}`}
          >
            <Coins className="size-3" aria-hidden="true" />
            {formatCredit(credits.credits)} điểm{credits.khoan ? " Khoán" : ""}
            <span className="sr-only"> của tôi</span>
          </span>
        ) : null}
        {task.qcFailCount > 0 && !qcNote ? (
          <span className="inline-flex items-center gap-1 text-danger">
            <MessageSquareWarning className="size-3" aria-hidden="true" />
            QC yêu cầu sửa lại · {task.qcFailCount} lần
          </span>
        ) : null}
      </div>
      {qcNote ? (
        <div
          className={cn(
            "flex gap-1.5 rounded-lg px-2 py-1.5 text-xs",
            qcOpen ? "bg-danger-soft" : "bg-muted/70"
          )}
        >
          <MessageSquareWarning
            className={cn(
              "mt-px size-3.5 shrink-0",
              qcOpen ? "text-danger" : "text-foreground-subtle"
            )}
            aria-hidden="true"
          />
          <p className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="line-clamp-2 text-foreground [overflow-wrap:anywhere]">
              <span className={cn("font-medium", qcOpen ? "text-danger" : "text-foreground-muted")}>
                QC yêu cầu sửa lại{task.qcFailCount > 1 ? ` (${task.qcFailCount} lần)` : ""}:
              </span>{" "}
              {qcNote.note ? `“${qcNote.note}”` : "không ghi lý do"}
            </span>
            <span className="text-[11px] text-foreground-muted">
              {qcNote.by?.displayName ?? "QC"} · {formatDateTime(qcNote.at, timeZone)}
            </span>
          </p>
        </div>
      ) : null}
      {fields ? <CustomFieldChips fields={fields} values={task.customValues} /> : null}
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
});
