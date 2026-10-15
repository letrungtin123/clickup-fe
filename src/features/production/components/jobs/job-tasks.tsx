import { cn } from "cn";
import { CornerDownRight, FilePenLine, ListTodo, TriangleAlert } from "lucide-react";
import { Fragment, type CSSProperties } from "react";

import { EmptyState } from "@/components/shared/states";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CustomField } from "@/contracts/production-catalog";
import type {
  ProductionSubtask,
  ProductionTask,
  TaskQtyRequest,
  TaskTransitionOption
} from "@/contracts/production-jobs";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { toneClass } from "@/lib/colors";

import { formatInteger, formatNumber } from "../../format";
import { formatWorkDay, jobLines, lacksQc } from "../../jobs-model";
import { CustomFieldValue } from "../custom-field-input";
import { CustomFieldChips } from "../list-filters";
import { Fact, KindBadge, LateBadge, Person, StatusChip } from "./job-bits";
import { StatusSelect } from "./transition-controls";
import { WorkLinkIcon, WorkLinkValue } from "./work-link";

/**
 * The work-log columns (PD-035) in the owner's order: Người làm · QC (right after it, PD-045) · Công đoạn · Ca ·
 * Xong/giao · Hình lỗi · Giờ OT · Ngày nhận · Ngày giao · Ghi chú, then a narrow "Link" (Link chia việc as an icon,
 * PD-040), then the TASK custom fields marked "hiện trong bảng". "#" (the line's code, "1216" / "1216a") is pinned left
 * — with "Người làm" next to it once the table has room — and "Trạng thái" pinned right (PD-044: each line's status at
 * all times, a dropdown of the viewer's moves), so the narrow desktop column next to the timeline scrolls the middle
 * while who and where stay in view.
 */
const taskColumns = (fieldCount: number) => {
  // [track, minimum in rem]
  const columns: [string, number][] = [
    // "#": room for a subtask's arrow and code ("↳ #12345a").
    ["6rem", 6],
    ["minmax(10rem,1.2fr)", 10],
    // QC: a person, "—" on a Checking line, "Chưa gán" or the amber "Chưa gán QC" of a Done line.
    ["minmax(8.5rem,1fr)", 8.5],
    ["minmax(8rem,1fr)", 8],
    ["minmax(5.5rem,0.6fr)", 5.5],
    // Xong / giao: room for "tổng N" and a pending request badge under the numbers.
    ["7.75rem", 7.75],
    ["4.75rem", 4.75],
    ["4.75rem", 4.75],
    ["5.75rem", 5.75],
    ["6.5rem", 6.5],
    ["minmax(8rem,1fr)", 8],
    // Link chia việc: one icon.
    ["3.5rem", 3.5],
    ...Array.from({ length: fieldCount }, (): [string, number] => ["minmax(7.5rem,1fr)", 7.5]),
    // Trạng thái: the longest default name ("Đang giao client") with its chevron.
    ["10.5rem", 10.5]
  ];
  return {
    template: columns.map(([track]) => track).join(" "),
    // The table never shrinks below the minimums (it scrolls instead); wider, the fr columns share
    // the room. An explicit minimum (not max-content) keeps fr columns from inflating each other.
    minWidth: `${columns.reduce((sum, [, min]) => sum + min, 0)}rem`
  };
};

/** Pinned cells: opaque, and tinted like the row on hover / focus. */
const pinnedCell =
  "bg-surface group-hover/row:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_3%)] group-focus-visible/row:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_3%)]";
/** Pinned cells of a nested subtask row: the row's muted surface, opaque. */
const pinnedSubtaskCell =
  "bg-[color-mix(in_oklch,var(--surface),var(--foreground)_2.5%)] group-hover/row:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_5%)]";
/**
 * "Người làm" pins next to "#" once the table's box is wide enough to keep a useful scrolling middle (container
 * query on the scroller): the person and the status of a line then stay side by side at any scroll position. Rows
 * add `@min-[44rem]:z-[1]`, the header `@min-[44rem]:z-10`.
 */
const pinnedPerson =
  "@min-[44rem]:sticky @min-[44rem]:left-[6rem] @min-[44rem]:shadow-[1px_0_0_var(--border)]";

/** A line's quantity request waiting for the Leader (PD-044): "Đề nghị 10 → 12", the reason in the tooltip. */
const QtyRequestBadge = ({ request, className }: { request: TaskQtyRequest; className?: string }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <span
          className={cn(
            toneClass("amber"),
            "inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded-md bg-(--tone-soft) px-1.5 text-[11px] font-semibold whitespace-nowrap text-(--tone-text) tabular-nums",
            className
          )}
        />
      }
    >
      <FilePenLine className="size-3 shrink-0" aria-hidden="true" />
      Đề nghị {formatInteger(request.fromQty)} → {formatInteger(request.toQty)}
      <span className="sr-only">
        {" "}
        tấm, chờ Leader duyệt. Lý do: {request.reason}
      </span>
    </TooltipTrigger>
    <TooltipContent className="flex-col items-start gap-0.5 whitespace-pre-wrap">
      <span className="font-medium">
        {request.requestedBy?.displayName ?? "Người làm"} đề nghị sửa số tấm giao — chờ duyệt
      </span>
      <span>Lý do: {request.reason}</span>
    </TooltipContent>
  </Tooltip>
);

/** A Done work line without QC and not a Checking line: nobody can check it, so the job cannot be "Đã xong" (PD-045). */
const NoQcBadge = ({ className }: { className?: string }) => (
  <span
    title="Task đã Done nhưng chưa có QC — gán QC để chuyển sang Chờ QC."
    className={cn(
      toneClass("amber"),
      "inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-(--tone-soft) px-1.5 text-[11px] font-semibold whitespace-nowrap text-(--tone-text)",
      className
    )}
  >
    <TriangleAlert className="size-3" aria-hidden="true" />
    Chưa gán QC
  </span>
);

/**
 * The QC of a line (PD-045: its own column right after "Người làm"): the person; "—" on a Checking line (it is the QC's
 * own work); the amber "Chưa gán QC" on a Done line nobody can check; otherwise a muted "Chưa gán".
 */
const QcValue = ({ task }: { task: ProductionTask }) =>
  task.process.isQc ? (
    <span className="text-foreground-subtle" title="Task Checking — không có QC">
      —<span className="sr-only">Task Checking — không có QC</span>
    </span>
  ) : lacksQc(task) ? (
    <NoQcBadge />
  ) : task.qc ? (
    <Person user={task.qc} size="xs" />
  ) : (
    <span className="text-foreground-subtle">Chưa gán</span>
  );

const SubtaskBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 text-[11px] font-medium text-foreground-muted",
      className
    )}
  >
    Subtask
  </span>
);

/** "Xong / giao" of a line: its own numbers; with subtasks, the total the Leader gave below. */
const QtyCell = ({ task }: { task: ProductionTask }) => (
  <>
    <span className="whitespace-nowrap">
      {task.qtyDone === null ? "—" : formatInteger(task.qtyDone)} /{" "}
      {formatInteger(task.qtyAssigned)}
    </span>
    {task.subtasks.length > 0 ? (
      <span
        className="text-[11px] whitespace-nowrap text-foreground-muted"
        title="Số lượng Leader giao: task này cộng các subtask"
      >
        tổng {formatInteger(task.allocatedQty)}
      </span>
    ) : null}
    {task.pendingQtyRequest ? <QtyRequestBadge request={task.pendingQtyRequest} /> : null}
  </>
);

/** The status column / chip: the viewer's moves as a dropdown, a plain chip on an archived job. */
const LineStatus = ({
  task,
  readOnly,
  busy,
  onMove,
  align
}: {
  task: ProductionTask;
  readOnly: boolean;
  busy: boolean;
  onMove: (option: TaskTransitionOption) => void;
  align: "start" | "end";
}) => (
  <StatusSelect
    task={
      readOnly ? { ...task, capabilities: { ...task.capabilities, transitions: [] } } : task
    }
    onMove={onMove}
    busy={busy}
    size="sm"
    align={align}
  />
);

const subtaskQty = (subtask: ProductionSubtask) =>
  `${subtask.qtyDone === null ? "—" : formatInteger(subtask.qtyDone)}/${formatInteger(subtask.qtyAssigned)}`;

/**
 * Tasks of a job: a table with pinned "#" (and "Người làm") and "Trạng thái" columns (scrolls inside its card) on
 * tablet/desktop, cards on phones (worker, QC, process and shift as labelled facts, the status dropdown at the top
 * right). A line's subtasks (PD-044) sit right under it, muted, their status following the line's. Lines and subtasks
 * show their code ("#1216", "#1216a", PD-045). Row click opens the line (a subtask row opens its line).
 */
export const JobTasks = ({
  tasks,
  fields = [],
  timeZone,
  onOpen,
  onMove,
  busyTaskId,
  readOnly = false,
  canAdd = true
}: {
  tasks: ProductionTask[];
  /** Active TASK custom fields: `showInTable` ones become columns (chips on phone cards). */
  fields?: readonly CustomField[];
  timeZone: string;
  onOpen: (taskId: string) => void;
  onMove: (task: ProductionTask, option: TaskTransitionOption) => void;
  busyTaskId: string | null | undefined;
  /** Archived job: no moves. */
  readOnly?: boolean;
  /** The viewer may add tasks ("Chia task" / "Nhập công việc"); staff may not since PD-047. */
  canAdd?: boolean;
}) => {
  const breakpoint = useBreakpoint();
  const lines = jobLines(tasks);
  if (lines.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={ListTodo}
        title="Chưa có task"
        description={
          canAdd
            ? "Bấm “Chia task” hoặc “Nhập công việc” để thêm task: người làm, quy trình, QC, ca, số lượng, ngày nhận / giao."
            : "Leader của job sẽ chia task."
        }
      />
    );
  }

  if (breakpoint === "mobile") {
    return (
      <ul className="flex flex-col gap-2.5">
        {lines.map(({ line: task, subtasks }) => (
          <li key={task.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(task.id)}
              onKeyDown={(event) => {
                // Enter on the status dropdown inside must not also open the line.
                if (event.key === "Enter" && event.target === event.currentTarget) onOpen(task.id);
              }}
              className="flex flex-col gap-2 rounded-xl border bg-surface p-3 shadow-xs outline-none active:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start gap-2">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    #{task.code}
                    <KindBadge kind={task.kind} />
                    {task.isSubtask ? <SubtaskBadge /> : null}
                    {task.isLate ? <LateBadge /> : null}
                  </span>
                  <span className="text-xs text-foreground-muted">
                    <span className="whitespace-nowrap tabular-nums">
                      {task.qtyDone !== null ? `${formatInteger(task.qtyDone)}/` : ""}
                      {formatInteger(task.qtyAssigned)} tấm
                      {task.subtasks.length > 0
                        ? ` · tổng ${formatInteger(task.allocatedQty)}`
                        : ""}
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
                <span className="flex max-w-[55%] shrink-0 justify-end">
                  <LineStatus
                    task={task}
                    readOnly={readOnly}
                    busy={busyTaskId === task.id}
                    onMove={(option) => onMove(task, option)}
                    align="end"
                  />
                </span>
              </div>
              {task.pendingQtyRequest ? (
                <QtyRequestBadge request={task.pendingQtyRequest} className="self-start" />
              ) : null}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Fact label="Người làm">
                  <Person user={task.assignee} size="xs" />
                </Fact>
                <Fact label="QC">
                  <QcValue task={task} />
                </Fact>
                <Fact label="Công đoạn">
                  <span className="block truncate">{task.process.name}</span>
                </Fact>
                <Fact label="Ca">
                  <span className="block truncate">{task.shift.name}</span>
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
              {subtasks.length > 0 ? (
                <ul
                  aria-label={`Subtask của #${task.code}`}
                  className="flex flex-col gap-1 rounded-lg bg-muted/60 px-2.5 py-2 text-xs"
                >
                  {subtasks.map((subtask) => (
                    <li
                      key={subtask.id}
                      className="flex min-w-0 items-center gap-1.5 text-foreground-muted"
                      title={subtask.reason ? `Lý do: ${subtask.reason}` : undefined}
                    >
                      <CornerDownRight
                        className="size-3.5 shrink-0 text-foreground-subtle"
                        aria-hidden="true"
                      />
                      <span className="font-medium text-foreground tabular-nums">
                        #{subtask.code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="min-w-0 truncate">{subtask.process.name}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0 tabular-nums">{subtaskQty(subtask)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
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
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const columns = fields.filter((field) => field.showInTable);
  const layout = taskColumns(columns.length);
  const rowClass =
    "group/row grid grid-cols-(--task-cols) items-center border-b border-border/70 text-[13px] outline-none last:border-b-0";
  return (
    <div
      // relative: keeps any absolutely positioned descendant inside this scroller. @container: "Người làm" pins
      // once the box is wide enough (pinnedPerson).
      className="@container relative overflow-x-auto overscroll-x-contain rounded-xl border bg-surface shadow-xs"
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
          <span
            role="columnheader"
            className={cn("flex h-full items-center bg-surface px-3", pinnedPerson, "@min-[44rem]:z-10")}
          >
            Người làm
          </span>
          <span role="columnheader" className="px-3">
            QC
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
          <span
            role="columnheader"
            className="sticky right-0 z-10 flex h-full items-center bg-surface px-3 shadow-[-1px_0_0_var(--border)]"
          >
            Trạng thái
          </span>
        </div>
        {lines.map(({ line: task, subtasks }) => (
          <Fragment key={task.id}>
            <div
              role="row"
              tabIndex={0}
              onClick={() => onOpen(task.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.target === event.currentTarget) onOpen(task.id);
              }}
              className={cn(
                rowClass,
                "min-h-14 cursor-pointer hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              )}
            >
              <span
                role="cell"
                className={cn(
                  "sticky left-0 z-[1] flex h-full flex-col justify-center gap-1 px-3 font-semibold tabular-nums shadow-[1px_0_0_var(--border)]",
                  pinnedCell
                )}
              >
                #{task.code}
                {task.kind !== "NORMAL" ? (
                  <KindBadge kind={task.kind} className="self-start" />
                ) : null}
                {task.isSubtask ? <SubtaskBadge className="self-start" /> : null}
              </span>
              <span
                role="cell"
                className={cn(
                  "flex h-full min-w-0 items-center px-3 @min-[44rem]:z-[1]",
                  pinnedPerson,
                  pinnedCell
                )}
                title={task.assignee.displayName}
              >
                <Person user={task.assignee} size="xs" />
              </span>
              <span
                role="cell"
                className="flex min-w-0 items-center px-3"
                title={task.process.isQc ? undefined : (task.qc?.displayName ?? undefined)}
              >
                <QcValue task={task} />
              </span>
              <span role="cell" className="truncate px-3" title={task.process.name}>
                {task.process.name}
              </span>
              <span role="cell" className="truncate px-3" title={task.shift.name}>
                {task.shift.name}
              </span>
              <span
                role="cell"
                className="flex flex-col items-end gap-0.5 px-3 py-2 text-right tabular-nums"
              >
                <QtyCell task={task} />
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
              <span
                role="cell"
                className={cn(
                  "sticky right-0 z-[1] flex h-full min-w-0 items-center px-3 py-2 shadow-[-1px_0_0_var(--border)]",
                  pinnedCell
                )}
              >
                <LineStatus
                  task={task}
                  readOnly={readOnly}
                  busy={busyTaskId === task.id}
                  onMove={(option) => onMove(task, option)}
                  align="end"
                />
              </span>
            </div>
            {subtasks.map((subtask) => (
              <SubtaskRow
                key={subtask.id}
                subtask={subtask}
                line={task}
                fieldCount={columns.length}
                rowClass={rowClass}
                onOpen={onOpen}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
};

/**
 * A subtask nested under its line (PD-044): its process, quantity and reason; the status chip follows the line (no
 * moves of its own). Clicking it opens the line, where subtasks are edited.
 */
const SubtaskRow = ({
  subtask,
  line,
  fieldCount,
  rowClass,
  onOpen
}: {
  subtask: ProductionSubtask;
  line: ProductionTask;
  fieldCount: number;
  rowClass: string;
  onOpen: (taskId: string) => void;
}) => (
  <div
    role="row"
    tabIndex={0}
    aria-label={`Subtask #${subtask.code} của task #${line.code}: ${subtask.process.name}, ${subtaskQty(subtask)} tấm`}
    onClick={() => onOpen(line.id)}
    onKeyDown={(event) => {
      if (event.key === "Enter" && event.target === event.currentTarget) onOpen(line.id);
    }}
    className={cn(
      rowClass,
      "min-h-10 cursor-pointer bg-[color-mix(in_oklch,var(--surface),var(--foreground)_2.5%)] text-xs text-foreground-muted hover:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_5%)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    )}
  >
    <span
      role="cell"
      className={cn(
        "sticky left-0 z-[1] flex h-full items-center gap-1 py-1.5 pr-2 pl-3 font-medium whitespace-nowrap text-foreground tabular-nums shadow-[1px_0_0_var(--border)]",
        pinnedSubtaskCell
      )}
    >
      <CornerDownRight className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />#
      {subtask.code}
    </span>
    <span
      role="cell"
      className={cn(
        "flex h-full min-w-0 items-center px-3 @min-[44rem]:z-[1]",
        pinnedPerson,
        pinnedSubtaskCell
      )}
    >
      <SubtaskBadge />
    </span>
    {/* QC: the line's (a subtask keeps its line's QC). */}
    <span role="cell" />
    <span role="cell" className="truncate px-3 text-foreground" title={subtask.process.name}>
      {subtask.process.name}
    </span>
    <span role="cell" />
    <span role="cell" className="px-3 text-right text-foreground tabular-nums">
      {subtask.qtyDone === null ? "—" : formatInteger(subtask.qtyDone)} /{" "}
      {formatInteger(subtask.qtyAssigned)}
    </span>
    <span role="cell" />
    <span role="cell" />
    <span role="cell" />
    <span role="cell" />
    <span role="cell" className="truncate px-3" title={subtask.reason ?? undefined}>
      {subtask.reason ? `Lý do: ${subtask.reason}` : ""}
    </span>
    <span role="cell" />
    {Array.from({ length: fieldCount }, (_, index) => (
      <span key={index} role="cell" />
    ))}
    <span
      role="cell"
      className={cn(
        "sticky right-0 z-[1] flex h-full min-w-0 items-center px-3 py-1.5 shadow-[-1px_0_0_var(--border)]",
        pinnedSubtaskCell
      )}
      title={`Theo task #${line.code}`}
    >
      <StatusChip status={line.status} size="sm" className="opacity-80" />
      <span className="sr-only">, theo task #{line.code}</span>
    </span>
  </div>
);
