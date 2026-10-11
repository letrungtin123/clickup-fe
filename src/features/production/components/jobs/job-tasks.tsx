import { cn } from "cn";
import { ListTodo } from "lucide-react";
import type { CSSProperties } from "react";

import { EmptyState } from "@/components/shared/states";
import type { CustomField } from "@/contracts/production-catalog";
import type { ProductionTask } from "@/contracts/production-jobs";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { formatDateTime } from "../../jobs-model";
import { CustomFieldValue } from "../custom-field-input";
import { CustomFieldChips } from "../list-filters";
import { KindBadge, LateBadge, Person, StatusChip } from "./job-bits";
import { TransitionButtons } from "./transition-controls";

/**
 * Most-used columns first (who, status, quantity, deadline, moves) so a narrow desktop column next to
 * the timeline shows them without scrolling; QC, process/shift and the TASK custom fields marked
 * "hiện trong bảng" follow. "Chuyển" is dropped when nobody can move any task (e.g. Account
 * mid-production, archived job).
 */
const columnsTemplate = (showMoves: boolean, fieldCount: number) =>
  [
    "5.5rem",
    "minmax(9rem,1.2fr)",
    "8.5rem",
    "6.5rem",
    "7rem",
    ...(showMoves ? ["minmax(11rem,1.3fr)"] : []),
    "minmax(8.5rem,1fr)",
    "minmax(9rem,1fr)",
    ...Array.from({ length: fieldCount }, () => "minmax(7.5rem,1fr)")
  ].join(" ");

/**
 * Tasks of a job: a table with a pinned first column (scrolls inside its card) on tablet/desktop,
 * cards on phones. Row click opens the task sheet; the move buttons are the task's capabilities.
 */
export const JobTasks = ({
  tasks,
  fields = [],
  timeZone,
  onOpen,
  onMove,
  busyTaskId,
  readOnly = false
}: {
  tasks: ProductionTask[];
  /** Active TASK custom fields: `showInTable` ones become columns (chips on phone cards). */
  fields?: readonly CustomField[];
  timeZone: string;
  onOpen: (taskId: string) => void;
  onMove: (
    task: ProductionTask,
    option: ProductionTask["capabilities"]["transitions"][number]
  ) => void;
  busyTaskId: string | null | undefined;
  /** Archived job: no moves. */
  readOnly?: boolean;
}) => {
  const breakpoint = useBreakpoint();
  if (tasks.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={ListTodo}
        title="Chưa chia task"
        description="Leader phụ trách bấm “Chia task” để giao ảnh cho nhân viên theo từng quy trình."
      />
    );
  }

  if (breakpoint === "mobile") {
    return (
      <ul className="flex flex-col gap-2.5">
        {tasks.map((task) => (
          <li key={task.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(task.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onOpen(task.id);
              }}
              className="flex flex-col gap-2 rounded-xl border bg-surface p-3 shadow-xs outline-none active:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start gap-2">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    #{task.number} · {task.process.name}
                    <KindBadge kind={task.kind} />
                    {task.isLate ? <LateBadge /> : null}
                  </span>
                  <span className="text-xs text-foreground-muted">
                    {task.shift.name} ·{" "}
                    <span className="whitespace-nowrap">
                      {task.qtyDone !== null ? `${task.qtyDone}/` : ""}
                      {task.qtyAssigned} tấm
                    </span>{" "}
                    ·{" "}
                    <span className="whitespace-nowrap">
                      {formatDateTime(task.deadline, timeZone)}
                    </span>
                  </span>
                </span>
                <StatusChip status={task.status} size="sm" className="shrink-0" />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <Person user={task.assignee} size="xs" />
                <span className="flex items-center gap-1 text-foreground-muted">
                  QC <Person user={task.qc} size="xs" fallback="chưa gán" />
                </span>
              </div>
              <CustomFieldChips fields={fields} values={task.customValues} />
              {readOnly ? null : (
                <TransitionButtons
                  task={task}
                  busy={busyTaskId === task.id}
                  onMove={(option) => onMove(task, option)}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const showMoves = !readOnly && tasks.some((task) => task.capabilities.transitions.length > 0);
  const columns = fields.filter((field) => field.showInTable);
  return (
    <div
      // relative: keeps any absolutely positioned descendant inside this scroller.
      className="relative overflow-x-auto overscroll-x-contain rounded-xl border bg-surface shadow-xs"
      style={{ "--task-cols": columnsTemplate(showMoves, columns.length) } as CSSProperties}
    >
      <div role="table" aria-label="Task của job" className="min-w-max">
        <div
          role="row"
          className="grid h-10 grid-cols-(--task-cols) items-center border-b text-xs font-medium text-foreground-muted"
        >
          <span
            role="columnheader"
            className="sticky left-0 z-10 flex h-full items-center bg-surface px-3 shadow-[1px_0_0_var(--border)]"
          >
            #
          </span>
          <span role="columnheader" className="px-3">
            Người làm
          </span>
          <span role="columnheader" className="px-3">
            Trạng thái
          </span>
          <span role="columnheader" className="px-3 text-right whitespace-nowrap">
            Xong / giao
          </span>
          <span role="columnheader" className="px-3">
            Deadline
          </span>
          {showMoves ? (
            <span role="columnheader" className="px-3">
              Chuyển
            </span>
          ) : null}
          <span role="columnheader" className="px-3">
            QC
          </span>
          <span role="columnheader" className="px-3">
            Quy trình · Ca
          </span>
          {columns.map((field) => (
            <span
              key={field.id}
              role="columnheader"
              className="truncate px-3 whitespace-nowrap"
              title={field.label}
            >
              {field.label}
            </span>
          ))}
        </div>
        {tasks.map((task) => (
          <div
            key={task.id}
            role="row"
            tabIndex={0}
            onClick={() => onOpen(task.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.target === event.currentTarget) onOpen(task.id);
            }}
            className="group/row grid min-h-14 cursor-pointer grid-cols-(--task-cols) items-center border-b border-border/70 text-[13px] outline-none last:border-b-0 hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <span
              role="cell"
              className="sticky left-0 z-[1] flex h-full flex-col justify-center gap-1 bg-surface px-3 font-semibold tabular-nums shadow-[1px_0_0_var(--border)] group-hover/row:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_3%)]"
            >
              #{task.number}
              {task.kind !== "NORMAL" ? (
                <KindBadge kind={task.kind} className="self-start" />
              ) : null}
            </span>
            <span role="cell" className="min-w-0 px-3">
              <Person user={task.assignee} size="xs" />
            </span>
            <span role="cell" className="min-w-0 px-3">
              <StatusChip status={task.status} size="sm" />
            </span>
            <span role="cell" className="px-3 text-right tabular-nums">
              {task.qtyDone ?? "—"} / {task.qtyAssigned}
            </span>
            <span role="cell" className="flex flex-col gap-0.5 px-3">
              <span className={cn("tabular-nums", task.isLate && "font-medium text-danger")}>
                {formatDateTime(task.deadline, timeZone)}
              </span>
              {task.isLate ? <LateBadge className="self-start" /> : null}
            </span>
            {showMoves ? (
              <span role="cell" className="px-3 py-2">
                <TransitionButtons
                  task={task}
                  busy={busyTaskId === task.id}
                  onMove={(option) => onMove(task, option)}
                  size="xs"
                  max={2}
                />
              </span>
            ) : null}
            <span role="cell" className="min-w-0 px-3">
              <Person user={task.qc} size="xs" fallback="Chưa gán" />
            </span>
            <span role="cell" className="flex min-w-0 flex-col px-3">
              <span className="truncate">{task.process.name}</span>
              <span className="truncate text-xs text-foreground-muted">{task.shift.name}</span>
            </span>
            {columns.map((field) => (
              <span key={field.id} role="cell" className="flex min-w-0 px-3">
                <CustomFieldValue
                  field={field}
                  value={task.customValues[field.key]}
                  className="min-w-0"
                />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
