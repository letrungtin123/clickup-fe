import { cn } from "cn";
import { ListTodo } from "lucide-react";
import type { CSSProperties } from "react";

import { EmptyState } from "@/components/shared/states";
import type { CustomField } from "@/contracts/production-catalog";
import type { ProductionTask } from "@/contracts/production-jobs";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { formatInteger, formatNumber } from "../../format";
import { formatWorkDay } from "../../jobs-model";
import { CustomFieldValue } from "../custom-field-input";
import { CustomFieldChips } from "../list-filters";
import { Fact, KindBadge, LateBadge, Person, StatusChip } from "./job-bits";
import { TransitionButtons } from "./transition-controls";
import { WorkLinkIcon, WorkLinkValue } from "./work-link";

/**
 * The work-log columns (PD-035) in the owner's order: Người làm · Công đoạn · Ca · Xong/giao · Hình lỗi · Giờ OT ·
 * Ngày nhận · Ngày giao · QC · Trạng thái · Ghi chú, then a narrow "Link" (Link chia việc as an icon, PD-040), then the
 * TASK custom fields marked "hiện trong bảng". "#" is pinned left and "Chuyển" (the move buttons) pinned right, so the
 * narrow desktop column next to the timeline scrolls the middle while the task number and its moves stay in view.
 * "Chuyển" is dropped when nobody can move any task (e.g. Account mid-production, archived job).
 */
const taskColumns = (showMoves: boolean, fieldCount: number) => {
  // [track, minimum in rem]
  const columns: [string, number][] = [
    ["5.5rem", 5.5],
    ["minmax(10rem,1.2fr)", 10],
    ["minmax(8rem,1fr)", 8],
    ["minmax(5.5rem,0.6fr)", 5.5],
    ["6rem", 6],
    ["4.75rem", 4.75],
    ["4.75rem", 4.75],
    ["5.75rem", 5.75],
    ["6.5rem", 6.5],
    ["minmax(8.5rem,1fr)", 8.5],
    ["8.5rem", 8.5],
    ["minmax(8rem,1fr)", 8],
    // Link chia việc: one icon.
    ["3.5rem", 3.5],
    ...Array.from({ length: fieldCount }, (): [string, number] => ["minmax(7.5rem,1fr)", 7.5]),
    ...(showMoves ? [["minmax(11rem,1.2fr)", 11] as [string, number]] : [])
  ];
  return {
    template: columns.map(([track]) => track).join(" "),
    // The table never shrinks below the minimums (it scrolls instead); wider, the fr columns share
    // the room. An explicit minimum (not max-content) keeps fr columns from inflating each other.
    minWidth: `${columns.reduce((sum, [, min]) => sum + min, 0)}rem`
  };
};

/** Pinned cells: opaque, and tinted like the row on hover. */
const pinnedCell =
  "bg-surface group-hover/row:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_3%)] group-focus-visible/row:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_3%)]";

/**
 * Tasks of a job: a table with pinned "#" and "Chuyển" columns (scrolls inside its card) on
 * tablet/desktop, cards on phones (worker, QC, process and shift as labelled facts). Row click opens
 * the task sheet; the move buttons are the task's capabilities.
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
        title="Chưa có dòng công việc"
        description="Bấm “Chia task” hoặc “Nhập công việc” để thêm dòng: người làm, quy trình, ca, số lượng, ngày nhận / giao."
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
                    #{task.number}
                    <KindBadge kind={task.kind} />
                    {task.isLate ? <LateBadge /> : null}
                  </span>
                  <span className="text-xs text-foreground-muted">
                    <span className="whitespace-nowrap tabular-nums">
                      {task.qtyDone !== null ? `${formatInteger(task.qtyDone)}/` : ""}
                      {formatInteger(task.qtyAssigned)} tấm
                    </span>{" "}
                    ·{" "}
                    <span className="whitespace-nowrap tabular-nums">
                      {formatWorkDay(task.assignedAt, timeZone)} →{" "}
                      <span className={cn(task.isLate && "font-medium text-danger")}>
                        {formatWorkDay(task.deadline, timeZone)}
                      </span>
                    </span>
                  </span>
                </span>
                <StatusChip status={task.status} size="sm" className="shrink-0" />
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Fact label="Người làm">
                  <Person user={task.assignee} size="xs" />
                </Fact>
                <Fact label="Công đoạn">
                  <span className="block truncate">{task.process.name}</span>
                </Fact>
                <Fact label="Ca">
                  <span className="block truncate">{task.shift.name}</span>
                </Fact>
                <Fact label="QC">
                  {task.process.isQc ? (
                    <span className="text-foreground-subtle">—</span>
                  ) : (
                    <Person user={task.qc} size="xs" />
                  )}
                </Fact>
                <Fact label="Hình lỗi">
                  <span className="tabular-nums">
                    {task.errorQty === null ? "—" : formatInteger(task.errorQty)}
                  </span>
                </Fact>
                <Fact label="Giờ OT">
                  <span className="tabular-nums">
                    {task.otHours === null ? "—" : formatNumber(task.otHours)}
                  </span>
                </Fact>
              </dl>
              {task.note ? (
                <p
                  className="line-clamp-2 text-xs text-foreground-muted [overflow-wrap:anywhere]"
                  title={task.note}
                >
                  {task.note}
                </p>
              ) : null}
              {task.workLink ? <WorkLinkValue value={task.workLink} className="text-xs" /> : null}
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
  const layout = taskColumns(showMoves, columns.length);
  return (
    <div
      // relative: keeps any absolutely positioned descendant inside this scroller.
      className="relative overflow-x-auto overscroll-x-contain rounded-xl border bg-surface shadow-xs"
      style={{ "--task-cols": layout.template } as CSSProperties}
    >
      <div role="table" aria-label="Task của job" style={{ minWidth: layout.minWidth }}>
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
          <span role="columnheader" className="px-3 whitespace-nowrap">
            Công đoạn
          </span>
          <span role="columnheader" className="px-3">
            Ca
          </span>
          <span role="columnheader" className="px-3 text-right whitespace-nowrap">
            Xong / giao
          </span>
          <span role="columnheader" className="px-3 text-right whitespace-nowrap">
            Hình lỗi
          </span>
          <span role="columnheader" className="px-3 text-right whitespace-nowrap">
            Giờ OT
          </span>
          <span role="columnheader" className="px-3 whitespace-nowrap">
            Ngày nhận
          </span>
          <span role="columnheader" className="px-3 whitespace-nowrap">
            Ngày giao
          </span>
          <span role="columnheader" className="px-3">
            QC
          </span>
          <span role="columnheader" className="px-3">
            Trạng thái
          </span>
          <span role="columnheader" className="px-3">
            Ghi chú
          </span>
          <span role="columnheader" className="px-2 text-center" title="Link chia việc">
            Link
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
          {showMoves ? (
            <span
              role="columnheader"
              className="sticky right-0 z-10 flex h-full items-center bg-surface px-3 shadow-[-1px_0_0_var(--border)]"
            >
              Chuyển
            </span>
          ) : null}
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
              className={cn(
                "sticky left-0 z-[1] flex h-full flex-col justify-center gap-1 px-3 font-semibold tabular-nums shadow-[1px_0_0_var(--border)]",
                pinnedCell
              )}
            >
              #{task.number}
              {task.kind !== "NORMAL" ? (
                <KindBadge kind={task.kind} className="self-start" />
              ) : null}
            </span>
            <span role="cell" className="min-w-0 px-3" title={task.assignee.displayName}>
              <Person user={task.assignee} size="xs" />
            </span>
            <span role="cell" className="truncate px-3" title={task.process.name}>
              {task.process.name}
            </span>
            <span role="cell" className="truncate px-3" title={task.shift.name}>
              {task.shift.name}
            </span>
            <span role="cell" className="px-3 text-right tabular-nums">
              {task.qtyDone === null ? "—" : formatInteger(task.qtyDone)} /{" "}
              {formatInteger(task.qtyAssigned)}
            </span>
            <span role="cell" className="px-3 text-right tabular-nums">
              {task.errorQty === null ? "—" : formatInteger(task.errorQty)}
            </span>
            <span role="cell" className="px-3 text-right tabular-nums">
              {task.otHours === null ? "—" : formatNumber(task.otHours)}
            </span>
            <span role="cell" className="px-3 tabular-nums">
              {formatWorkDay(task.assignedAt, timeZone)}
            </span>
            <span role="cell" className="flex flex-col gap-0.5 px-3">
              <span className={cn("tabular-nums", task.isLate && "font-medium text-danger")}>
                {formatWorkDay(task.deadline, timeZone)}
              </span>
              {task.isLate ? <LateBadge className="self-start" /> : null}
            </span>
            <span
              role="cell"
              className="min-w-0 px-3"
              title={task.process.isQc ? "Dòng Checking — không có QC" : task.qc?.displayName}
            >
              {task.process.isQc ? (
                <span className="text-foreground-subtle">—</span>
              ) : (
                <Person user={task.qc} size="xs" />
              )}
            </span>
            <span role="cell" className="min-w-0 px-3">
              <StatusChip status={task.status} size="sm" />
            </span>
            <span
              role="cell"
              className="truncate px-3 text-foreground-muted"
              title={task.note ?? undefined}
            >
              {task.note ?? ""}
            </span>
            <span role="cell" className="flex justify-center px-2">
              <WorkLinkIcon value={task.workLink} />
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
            {showMoves ? (
              <span
                role="cell"
                className={cn(
                  "sticky right-0 z-[1] flex h-full items-center px-3 py-2 shadow-[-1px_0_0_var(--border)]",
                  pinnedCell
                )}
              >
                <TransitionButtons
                  task={task}
                  busy={busyTaskId === task.id}
                  onMove={(option) => onMove(task, option)}
                  size="xs"
                  max={2}
                />
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
