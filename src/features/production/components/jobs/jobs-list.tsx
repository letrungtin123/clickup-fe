import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import {
  Archive,
  Briefcase,
  ChevronRight,
  CornerDownRight,
  FilePenLine,
  Plus,
  RotateCw
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode
} from "react";
import { useNavigate } from "react-router";

import { Link } from "@/components/shared/router-link";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { CustomField } from "@/contracts/production-catalog";
import type { JobDetail, JobPersonShare, JobSummary } from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { formatInteger } from "../../format";
import { useProductionAccess, useTags } from "../../hooks";
import {
  buildListRows,
  jobPointsCell,
  monthOf,
  progressLabel,
  readCollapsedMonths,
  readExpandedJobs,
  rowHeight,
  taskPointsCell,
  taskProgress,
  toggled,
  writeCollapsedMonths,
  writeExpandedJobs,
  type DetailState,
  type ListRow
} from "../../job-list-model";
import { useJobDetails } from "../../jobs-hooks";
import { productionKeys } from "../../keys";
import { formatWorkDay, shortName } from "../../jobs-model";
import { useOpenTask } from "../../task-link";
import { CustomFieldValue } from "../custom-field-input";
import { TagChips } from "../tag-picker";
import { KindBadge, LateBadge, MissingQtyNote, Person, QtyValue } from "./job-bits";
import { JobListCards } from "./job-list-cards";
import {
  CreatorCell,
  MonthPill,
  PointsValue,
  ProcessChip,
  ProcessTotalsInline,
  ProgressCell,
  ProjectChip,
  QcStack,
  ShiftChip
} from "./job-list-cells";
import {
  AddTasksButton,
  ExpandButton,
  JobRowStatus,
  TaskCountBadge,
  TaskRowStatus,
  type ListContext,
  type ListPerson
} from "./job-list-parts";
import { JobPeopleStack } from "./job-people";
import { QcValue } from "./job-tasks";
import { SplitTasksDialog } from "./split-tasks-dialog";
import { useTaskMover } from "./use-task-mover";
import { WorkEntryDialog } from "./work-entry-dialog";

export type { ListPerson } from "./job-list-parts";

const noShare: JobPersonShare = {
  processes: [],
  taskCount: 0,
  qtyAssigned: 0,
  qtyDone: 0,
  qtyChecked: 0
};

type JobsListProps = {
  jobs: JobSummary[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  timeZone: string;
  /** Active JOB custom fields; the `showInTable` ones become columns (chips on phone cards). */
  fields?: readonly CustomField[] | undefined;
  /** Per-person view: the rows' `personShare` belongs to this person. */
  person?: ListPerson | null | undefined;
  filtering: boolean;
  empty: ReactNode;
  /** PD-067: jobs per month of "Ngày nhận" over every matching job (group header counts; loaded rows meanwhile). */
  monthCounts?: ReadonlyMap<string, number> | undefined;
  /** "+ Tạo job" at the end of a month group (only with the right to create jobs). */
  onCreateJob?: ((month: string) => void) | undefined;
};

/**
 * PD-067 — the job list as ClickUp's List view, same flow as before: jobs grouped by the month of their "Ngày nhận"
 * (newest first; a group folds away, remembered per user), each job row unfolding into its tasks with subtasks nested
 * under them (loaded from the job page's own query). Task rows carry the job page's status dropdown, Done-quantity
 * dialog and task sheet; job rows the job status menu where the viewer may change it. A virtualized table with a sticky
 * header and the name column pinned on tablet / desktop; grouped cards on phones. Next pages load as the end comes near.
 */
export const JobsList = (props: JobsListProps) => {
  const breakpoint = useBreakpoint();
  if (props.isPending) return <ListSkeleton cards={breakpoint === "mobile"} />;
  if (props.error) return <ErrorState error={props.error} onRetry={props.onRetry} />;
  if (props.jobs.length === 0) return <>{props.empty}</>;
  return <JobListView {...props} phone={breakpoint === "mobile"} />;
};

const ListSkeleton = ({ cards }: { cards: boolean }) => (
  <div className="flex flex-col gap-2 p-1" aria-busy="true" aria-label="Đang tải job">
    <Skeleton className="h-6 w-36 rounded-md" />
    {Array.from({ length: cards ? 4 : 8 }, (_, index) =>
      cards ? (
        <Skeleton key={index} className="h-28 rounded-xl" />
      ) : (
        <div key={index} className="flex items-center gap-4 border-b px-3 py-3">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="ml-auto h-1.5 w-32" />
        </div>
      )
    )}
  </div>
);

const JobListView = ({
  jobs,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  timeZone,
  fields = [],
  person = null,
  monthCounts,
  onCreateJob,
  phone
}: JobsListProps & { phone: boolean }) => {
  const userId = useSessionContext().user.id;
  const { jobScopes, roles } = useProductionAccess();
  const tags = useTags();
  const navigate = useNavigate();
  const client = useQueryClient();
  const mover = useTaskMover();
  const openTaskById = useOpenTask();
  const [collapsed, setCollapsed] = useState(() => readCollapsedMonths(userId));
  const [expanded, setExpanded] = useState(() => readExpandedJobs(userId));
  const [adding, setAdding] = useState<{ kind: "split" | "entry"; job: JobDetail } | null>(null);

  useEffect(() => writeCollapsedMonths(userId, collapsed), [userId, collapsed]);
  useEffect(() => writeExpandedJobs(userId, expanded), [userId, expanded]);

  // Details only for the expanded jobs that are on screen (not inside a folded month).
  const openIds = useMemo(
    () =>
      jobs
        .filter((job) => expanded.has(job.id) && !collapsed.has(monthOf(job.receivedAt, timeZone)))
        .map((job) => job.id),
    [jobs, expanded, collapsed, timeZone]
  );
  const results = useJobDetails(openIds);
  const details = new Map<string, DetailState>(
    openIds.map((jobId, index) => {
      const result = results[index];
      const state: DetailState = result?.data
        ? { status: "success", job: result.data }
        : result?.isError
          ? { status: "error", error: result.error }
          : { status: "pending" };
      return [jobId, state];
    })
  );
  const rows = buildListRows({
    jobs,
    timeZone,
    collapsed,
    expanded,
    details,
    counts: monthCounts ?? new Map(),
    canCreateJob: Boolean(onCreateJob),
    hasMore: hasNextPage
  });

  const toggleJob = useCallback(
    (jobId: string) => setExpanded((current) => toggled(current, jobId)),
    []
  );
  const toggleMonth = useCallback(
    (month: string) => setCollapsed((current) => toggled(current, month)),
    []
  );
  const ctx: ListContext = {
    timeZone,
    person,
    tags: tags.data?.items ?? [],
    fields: fields.filter((field) => field.showInTable),
    viewer: { id: userId, updateScope: jobScopes.update, roles },
    details,
    busyTaskId: mover.pendingTaskId,
    move: (task, option) => mover.start(task, option),
    // A subtask opens its line, where subtasks are edited (as on the job page).
    openTask: (task, line) => openTaskById(line?.id ?? task.id),
    openJob: (jobId) => void navigate(`/production/jobs/${jobId}`),
    toggleJob,
    toggleMonth,
    retryJob: (jobId) =>
      void client.refetchQueries({ queryKey: productionKeys.job(jobId), exact: true }),
    addTasks: (detail) =>
      setAdding({ kind: detail.capabilities.splitOwnOnly ? "entry" : "split", job: detail }),
    createJob: onCreateJob,
    loadMore: fetchNextPage,
    loadingMore: isFetchingNextPage
  };

  return (
    <>
      {phone ? (
        <JobListCards rows={rows} ctx={ctx} />
      ) : (
        <JobTable
          rows={rows}
          ctx={ctx}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
        />
      )}
      {mover.dialog}
      {adding?.kind === "split" ? (
        <SplitTasksDialog
          key={`split-${adding.job.id}`}
          open
          job={adding.job}
          onClose={() => setAdding(null)}
        />
      ) : null}
      {adding?.kind === "entry" ? (
        <WorkEntryDialog
          key={`entry-${adding.job.id}`}
          open
          // PD-038: the entry starts in this job (and its project).
          initial={{
            projectId: adding.job.project.id,
            job: {
              id: adding.job.id,
              code: adding.job.code,
              projectId: adding.job.project.id,
              deadline: adding.job.deadline,
              jobStatus: adding.job.jobStatus
            }
          }}
          onClose={() => setAdding(null)}
        />
      ) : null}
    </>
  );
};

// Desktop / tablet table -------------------------------------------------------------------------------------------------

type ColumnId =
  | "name"
  | "people"
  | "received"
  | "deadline"
  | "shift"
  | "status"
  | "qc"
  | "project"
  | "process"
  | "qty"
  | "points"
  | "progress"
  | "creator"
  | "note"
  | "tags";
type Column = {
  id: ColumnId | `cf:${string}`;
  label: string;
  /** [grid track, minimum rem]: narrower containers scroll sideways, the name column pinned. */
  track: string;
  min: number;
  right?: boolean;
  /** Per-person view: the numbers are the person's ("của Tên" under the label). */
  personal?: boolean;
  title?: string;
  field?: CustomField;
};

/**
 * The ClickUp-like columns (owner's mapping, PD-067): Tên · Người làm · Ngày nhận · Ngày giao · Ca · Trạng thái · QC ·
 * Dự án · Công đoạn · Số lượng · Điểm (PD-070) · Tiến độ · Người tạo · Ghi chú · Tag, then the JOB custom fields marked
 * "hiện trong bảng". No Priority (the app has none).
 */
const columnsFor = (fields: readonly CustomField[]): Column[] => [
  {
    id: "name",
    label: "Tên",
    track: "minmax(19rem,2.4fr)",
    min: 19,
    title: "Gói công việc / task"
  },
  { id: "people", label: "Người làm", track: "minmax(8.5rem,1fr)", min: 8.5 },
  { id: "received", label: "Ngày nhận", track: "6.25rem", min: 6.25 },
  { id: "deadline", label: "Ngày giao", track: "7.5rem", min: 7.5 },
  { id: "shift", label: "Ca", track: "7.5rem", min: 7.5, title: "Ca làm việc" },
  // Fixed: the default names ("Đang giao client") fit, longer ones end in "…".
  { id: "status", label: "Trạng thái", track: "10.5rem", min: 10.5 },
  { id: "qc", label: "QC", track: "minmax(8rem,0.9fr)", min: 8 },
  { id: "project", label: "Dự án", track: "minmax(7.5rem,0.8fr)", min: 7.5 },
  {
    id: "process",
    label: "Công đoạn",
    track: "minmax(10rem,1.2fr)",
    min: 10,
    personal: true,
    title: "Quy trình — job: Tổng tấm theo công đoạn"
  },
  {
    id: "qty",
    label: "Số lượng",
    track: "6.75rem",
    min: 6.75,
    right: true,
    personal: true,
    title: "Job: Tổng tấm · task: số lượng giao"
  },
  {
    // PD-070: official-shift points only (Khoán rows "—", never money).
    id: "points",
    label: "Điểm",
    track: "6.5rem",
    min: 6.5,
    right: true,
    personal: true,
    title: "Điểm ca chính thức — task chưa Done: dự kiến theo Bảng đơn giá (mờ)"
  },
  {
    id: "progress",
    label: "Tiến độ",
    track: "8.5rem",
    min: 8.5,
    personal: true,
    title: "Đã xong / đã kiểm trên tổng"
  },
  { id: "creator", label: "Người tạo", track: "minmax(8.5rem,1fr)", min: 8.5 },
  { id: "note", label: "Ghi chú", track: "minmax(9rem,1.4fr)", min: 9 },
  { id: "tags", label: "Tag", track: "8rem", min: 8 },
  ...fields.map((field): Column => ({
    id: `cf:${field.id}`,
    label: field.label,
    track: "minmax(7.5rem,1fr)",
    min: 7.5,
    field
  }))
];

/** Pinned name cells: opaque, tinted like the row on hover. */
const pinned =
  "sticky left-0 z-[1] bg-surface shadow-[1px_0_0_var(--border)] group-hover/row:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_3%)]";
const subtle = <span className="text-foreground-subtle">—</span>;

/** Row clicks open the job / task, except on the controls inside (and in their portaled menus). */
const rowClick = (event: MouseEvent<HTMLElement>, open: () => void) => {
  const target = event.target as HTMLElement;
  if (!event.currentTarget.contains(target)) return;
  if (
    target.closest(
      "a,button,input,textarea,[role=menu],[role=menuitem],[role=menuitemradio],[role=dialog]"
    )
  )
    return;
  open();
};

const JobTable = ({
  rows,
  ctx,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage
}: {
  rows: ListRow[];
  ctx: ListContext;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columns = columnsFor(ctx.fields);
  const template = columns.map((column) => column.track).join(" ");
  const minRem = columns.reduce((sum, column) => sum + column.min, 0);
  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer instance is read during render on purpose
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index] ? rowHeight(rows[index]) : 40),
    overscan: 12,
    getItemKey: (index) => rows[index]?.key ?? index
  });
  const items = virtualizer.getVirtualItems();
  const last = items[items.length - 1]?.index ?? -1;
  const tail = rows[rows.length - 1];
  // Next pages load by themselves near the end — unless the last month is folded (it would load every page at once).
  const autoLoad = tail?.kind === "more" && !tail.lastCollapsed;
  useEffect(() => {
    if (autoLoad && hasNextPage && !isFetchingNextPage && last >= rows.length - 10) fetchNextPage();
  }, [autoLoad, hasNextPage, isFetchingNextPage, last, rows.length, fetchNextPage]);

  // More columns to the right: a fade on the edge says "scroll".
  const [moreRight, setMoreRight] = useState(false);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const update = () =>
      setMoreRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 4);
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [columns.length, minRem]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border bg-surface shadow-xs"
        style={{ "--job-cols": template } as CSSProperties}
      >
        <div
          role="table"
          aria-label={ctx.person ? `Danh sách job của ${ctx.person.displayName}` : "Danh sách job"}
          aria-rowcount={rows.length + 1}
          style={{ minWidth: `${minRem}rem` }}
        >
          <div
            role="row"
            className="sticky top-0 z-20 grid h-9 grid-cols-(--job-cols) items-center border-b bg-surface/95 text-xs font-medium text-foreground-muted backdrop-blur-sm"
          >
            {columns.map((column) =>
              column.personal && ctx.person ? (
                <span
                  key={column.id}
                  role="columnheader"
                  title={`${column.label} của ${ctx.person.displayName}`}
                  className={cn(
                    "flex min-w-0 flex-col justify-center px-3 leading-tight",
                    column.right && "items-end"
                  )}
                >
                  <span className="truncate whitespace-nowrap">{column.label}</span>
                  <span className="truncate text-[10px] font-semibold text-brand-text">
                    của {shortName(ctx.person.displayName)}
                  </span>
                </span>
              ) : (
                <span
                  key={column.id}
                  role="columnheader"
                  title={column.title ?? column.label}
                  className={cn(
                    "truncate px-3 whitespace-nowrap",
                    column.id === "name" &&
                      cn(pinned, "z-10 flex h-full items-center bg-surface pl-9"),
                    column.right && "text-right"
                  )}
                >
                  {column.label}
                </span>
              )
            )}
          </div>
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {items.map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const style: CSSProperties = {
                height: item.size,
                transform: `translateY(${item.start}px)`
              };
              return (
                <TableRow
                  key={item.key}
                  row={row}
                  columns={columns}
                  ctx={ctx}
                  style={style}
                  index={item.index + 2}
                />
              );
            })}
          </div>
        </div>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-px right-px w-12 rounded-r-xl bg-linear-to-l from-surface to-transparent transition-opacity duration-200",
          moreRight ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
};

const rowBase = "absolute inset-x-0 top-0";
const gridRow =
  "group/row grid grid-cols-(--job-cols) items-center border-b border-border/60 text-[13px]";

/** A full-width row (group header, footers, loading): its content pinned to the left edge. */
const WideRow = ({
  style,
  index,
  className,
  cellClassName,
  children,
  label
}: {
  style: CSSProperties;
  index: number;
  className?: string;
  /** e.g. the group header sits at the bottom of its taller row (room above each month). */
  cellClassName?: string;
  children: ReactNode;
  label?: string;
}) => (
  <div
    role="row"
    aria-rowindex={index}
    aria-label={label}
    className={cn(rowBase, "flex", className)}
    style={style}
  >
    <div
      role="cell"
      className={cn(
        "sticky left-0 flex h-full max-w-[min(100%,48rem)] min-w-0 items-center",
        cellClassName
      )}
    >
      {children}
    </div>
  </div>
);

const TableRow = ({
  row,
  columns,
  ctx,
  style,
  index
}: {
  row: ListRow;
  columns: Column[];
  ctx: ListContext;
  style: CSSProperties;
  index: number;
}) => {
  switch (row.kind) {
    case "group":
      return (
        <WideRow style={style} index={index} cellClassName="items-end">
          <div className="flex items-center gap-2 px-2 pb-1.5">
            <button
              type="button"
              aria-expanded={!row.collapsed}
              onClick={() => ctx.toggleMonth(row.month)}
              className="flex items-center gap-1.5 rounded-md p-0.5 pr-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  "size-4 text-foreground-muted transition-transform duration-150",
                  !row.collapsed && "rotate-90"
                )}
              />
              <MonthPill month={row.month} />
              <span className="sr-only">{row.collapsed ? ", mở nhóm" : ", thu gọn nhóm"}</span>
            </button>
            <span
              className="text-xs font-medium text-foreground-muted tabular-nums"
              title={`${row.count} job`}
            >
              {formatInteger(row.count)}
            </span>
          </div>
        </WideRow>
      );
    case "job":
      return <JobRow row={row} columns={columns} ctx={ctx} style={style} index={index} />;
    case "task":
      return <TaskRow row={row} columns={columns} ctx={ctx} style={style} index={index} />;
    case "tasks-loading":
      return (
        <div
          role="row"
          aria-rowindex={index}
          aria-busy="true"
          className={cn(rowBase, gridRow)}
          style={style}
        >
          <span role="cell" className={cn(pinned, "flex h-full items-center gap-2 pr-3 pl-10")}>
            <Skeleton className="size-2.5 rounded-full" />
            <Skeleton className="h-3.5 w-40" />
          </span>
          {columns.slice(1, 7).map((column) => (
            <span key={column.id} role="cell" className="px-3">
              <Skeleton className="h-3 w-3/4" />
            </span>
          ))}
        </div>
      );
    case "tasks-error":
      return (
        <WideRow style={style} index={index}>
          <span className="flex items-center gap-2 pl-10 text-[13px] text-danger">
            Không tải được task của job.
            <Button variant="ghost" size="xs" onClick={() => ctx.retryJob(row.jobId)}>
              <RotateCw />
              Thử lại
            </Button>
          </span>
        </WideRow>
      );
    case "tasks-empty":
      return (
        <WideRow style={style} index={index} className="border-b border-border/60">
          <span className="pl-10 text-[13px] text-foreground-muted">
            Chưa có task
            {row.detail.capabilities.canSplit && !row.detail.archived
              ? ""
              : " — Leader của job sẽ chia task."}
          </span>
        </WideRow>
      );
    case "job-footer":
      return (
        <WideRow style={style} index={index} className="border-b border-border/60">
          <AddTasksButton detail={row.detail} ctx={ctx} className="ml-8" />
        </WideRow>
      );
    case "group-footer":
      return (
        <WideRow style={style} index={index}>
          {ctx.createJob ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-3 text-foreground-muted hover:text-foreground"
              onClick={() => ctx.createJob?.(row.month)}
            >
              <Plus />
              Tạo job
            </Button>
          ) : null}
        </WideRow>
      );
    case "more":
      return (
        <WideRow style={style} index={index} className="justify-center">
          <span className="flex w-full items-center justify-center py-2">
            {ctx.loadingMore ? (
              <Spinner className="text-foreground-muted" />
            ) : (
              <Button variant="outline" size="sm" onClick={ctx.loadMore}>
                Tải thêm job
              </Button>
            )}
          </span>
        </WideRow>
      );
  }
};

const JobRow = ({
  row,
  columns,
  ctx,
  style,
  index
}: {
  row: Extract<ListRow, { kind: "job" }>;
  columns: Column[];
  ctx: ListContext;
  style: CSSProperties;
  index: number;
}) => {
  const { job } = row;
  const late = job.lateTaskCount > 0;
  const share = job.personShare ?? noShare;
  const person = ctx.person;
  const cell = (column: Column): ReactNode => {
    switch (column.id) {
      case "name":
        return (
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <ExpandButton
              job={job}
              expanded={row.expanded}
              onToggle={() => ctx.toggleJob(job.id)}
            />
            {job.archived ? (
              <Archive
                className="size-3.5 shrink-0 text-foreground-subtle"
                aria-label="Đã lưu trữ"
              />
            ) : null}
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span
                className="shrink-0 font-mono text-[11px] text-foreground-subtle"
                title={job.project.name}
              >
                {job.project.code} ·
              </span>
              <Link
                to={`/production/jobs/${job.id}`}
                title={job.name ? `${job.code} — ${job.name}` : job.code}
                className="truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {job.code}
              </Link>
            </span>
            <TaskCountBadge count={job.taskCount} />
          </span>
        );
      case "people":
        return <JobPeopleStack people={job.people} />;
      case "received":
        return <span className="tabular-nums">{formatWorkDay(job.receivedAt, ctx.timeZone)}</span>;
      case "deadline":
        return (
          <span
            className="flex min-w-0 items-center gap-1.5"
            title={late ? `${job.lateTaskCount} task trễ` : undefined}
          >
            <span className={cn("tabular-nums", late && "font-medium text-danger")}>
              {formatWorkDay(job.deadline, ctx.timeZone)}
            </span>
            {late ? <LateBadge label={`${job.lateTaskCount}`} className="px-1" /> : null}
          </span>
        );
      case "shift":
        return subtle;
      case "status":
        return <JobRowStatus job={job} ctx={ctx} />;
      case "qc":
        return <QcStack people={job.people.qc} />;
      case "project":
        return <ProjectChip project={job.project} />;
      case "process":
        return person ? (
          share.processes.length > 0 ? (
            <span className="truncate" title={share.processes.join(", ")}>
              {share.processes.join(", ")}
            </span>
          ) : (
            subtle
          )
        ) : job.processTotals.length > 0 ? (
          <ProcessTotalsInline totals={job.processTotals} />
        ) : (
          subtle
        );
      case "qty":
        return person ? (
          <span
            className="tabular-nums"
            title={`Giao cho ${person.displayName} / Tổng tấm ${job.totalImages}`}
          >
            {formatInteger(share.qtyAssigned)}
          </span>
        ) : (
          <span className="flex min-w-0 flex-col items-end leading-tight">
            <span className="tabular-nums" title="Tổng tấm">
              {formatInteger(job.totalImages)}
            </span>
            {/* PD-058: the totals count known numbers only. */}
            <MissingQtyNote count={job.tasksWithoutQty} short />
          </span>
        );
      case "points":
        // PD-070: the official-shift rows' total (the person's in the per-person view).
        return <PointsValue cell={jobPointsCell(job.pointsOfficial)} />;
      case "progress":
        return person ? (
          <ProgressCell
            done={share.qtyDone}
            checked={share.qtyChecked}
            total={share.qtyAssigned}
            label={progressLabel({
              done: share.qtyDone,
              checked: share.qtyChecked,
              total: share.qtyAssigned
            })}
          />
        ) : (
          <ProgressCell
            done={job.qtyDone}
            checked={job.qtyChecked}
            total={job.totalImages}
            label={progressLabel({
              assigned: job.qtyAssigned,
              done: job.qtyDone,
              checked: job.qtyChecked,
              total: job.totalImages
            })}
          />
        );
      case "creator":
        return <CreatorCell creator={job.createdBy} />;
      case "note":
        // A job has no note; an older job's optional free name stands in.
        return job.name ? (
          <span className="truncate text-foreground-muted" title={job.name}>
            {job.name}
          </span>
        ) : (
          subtle
        );
      case "tags":
        return <TagChips tags={ctx.tags} tagIds={job.tagIds} max={1} className="flex-nowrap" />;
      default:
        return column.field ? (
          <CustomFieldValue
            field={column.field}
            value={job.customValues[column.field.key]}
            className="min-w-0"
          />
        ) : null;
    }
  };
  return (
    <div
      role="row"
      aria-rowindex={index}
      aria-label={job.code}
      className={cn(
        rowBase,
        gridRow,
        "cursor-pointer hover:bg-surface-hover",
        row.expanded && "bg-[color-mix(in_oklch,var(--surface),var(--foreground)_1.5%)]",
        job.archived && "text-foreground-muted"
      )}
      style={style}
      onClick={(event) => rowClick(event, () => ctx.openJob(job.id))}
    >
      {columns.map((column) => (
        <span
          key={column.id}
          role="cell"
          className={cn(
            "flex h-full min-w-0 items-center px-3",
            column.id === "name" && cn(pinned, "pl-2"),
            column.right && "justify-end text-right",
            // The status menu's own clicks never open the job.
            column.id === "status" && "cursor-default"
          )}
          onClick={column.id === "status" ? (event) => event.stopPropagation() : undefined}
        >
          {cell(column)}
        </span>
      ))}
    </div>
  );
};

const TaskRow = ({
  row,
  columns,
  ctx,
  style,
  index
}: {
  row: Extract<ListRow, { kind: "task" }>;
  columns: Column[];
  ctx: ListContext;
  style: CSSProperties;
  index: number;
}) => {
  const { task, line, detail } = row;
  const sub = line !== null;
  const mine = ctx.person !== null && task.assignee.id === ctx.person.id;
  const progress = taskProgress(task);
  const cell = (column: Column): ReactNode => {
    switch (column.id) {
      case "name":
        return (
          <span className={cn("flex min-w-0 flex-1 items-center gap-1.5", sub ? "pl-12" : "pl-8")}>
            {/* The tree guide under the job's chevron. */}
            <span aria-hidden="true" className="absolute inset-y-0 left-5 w-px bg-border" />
            {sub ? (
              <CornerDownRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-foreground-subtle"
              />
            ) : null}
            <button
              type="button"
              onClick={() => ctx.openTask(task, line)}
              title={
                sub ? `Subtask #${task.code} — mở task #${line.code}` : `Mở task #${task.code}`
              }
              className="flex min-w-0 items-baseline gap-1.5 rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("shrink-0 tabular-nums", sub ? "font-medium" : "font-semibold")}>
                #{task.code}
              </span>
              <span className={cn("truncate", sub ? "text-foreground-muted" : "text-foreground")}>
                {task.process.name}
              </span>
            </button>
            {task.kind !== "NORMAL" ? <KindBadge kind={task.kind} /> : null}
            {sub ? (
              <span className="inline-flex h-4 shrink-0 items-center rounded bg-muted px-1 text-[10px] font-medium text-foreground-muted">
                Subtask
              </span>
            ) : null}
            {task.pendingQtyRequest ? (
              <FilePenLine
                className="size-3.5 shrink-0 text-warning"
                aria-label={`Đề nghị sửa số lượng ${task.pendingQtyRequest.fromQty} → ${task.pendingQtyRequest.toQty}, chờ duyệt`}
              />
            ) : null}
          </span>
        );
      case "people":
        return <Person user={task.assignee} size="xs" />;
      case "received":
        return <span className="tabular-nums">{formatWorkDay(task.assignedAt, ctx.timeZone)}</span>;
      case "deadline":
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("tabular-nums", task.isLate && "font-medium text-danger")}>
              {formatWorkDay(task.deadline, ctx.timeZone)}
            </span>
            {task.isLate ? <LateBadge className="px-1" /> : null}
          </span>
        );
      case "shift":
        return <ShiftChip shift={task.shift} />;
      case "status":
        return <TaskRowStatus task={task} line={line} detail={detail} ctx={ctx} />;
      case "qc":
        return <QcValue task={task} />;
      case "process":
        return <ProcessChip process={task.process} />;
      case "qty":
        return <QtyValue value={task.qtyAssigned} />;
      case "points":
        return <PointsValue cell={taskPointsCell(task)} />;
      case "progress":
        return task.qtyAssigned === null ? (
          subtle
        ) : (
          <ProgressCell
            done={progress.done}
            checked={progress.checked}
            total={progress.total}
            label={progressLabel(progress)}
          />
        );
      case "note": {
        const text = sub ? (task.splitReason ? `Lý do: ${task.splitReason}` : null) : task.note;
        return text ? (
          <span className="truncate text-foreground-muted" title={text}>
            {text}
          </span>
        ) : null;
      }
      case "tags":
        return <TagChips tags={ctx.tags} tagIds={task.tagIds} max={1} className="flex-nowrap" />;
      default:
        return null;
    }
  };
  return (
    <div
      role="row"
      aria-rowindex={index}
      aria-label={`${sub ? "Subtask" : "Task"} #${task.code} ${task.process.name}`}
      className={cn(
        rowBase,
        gridRow,
        "cursor-pointer border-border/40 hover:bg-surface-hover",
        sub && "text-[12.5px]"
      )}
      style={style}
      onClick={(event) => rowClick(event, () => ctx.openTask(task, line))}
    >
      {columns.map((column) => (
        <span
          key={column.id}
          role="cell"
          className={cn(
            "flex h-full min-w-0 items-center px-3",
            column.id === "name" && cn(pinned, "pl-2"),
            column.id === "name" &&
              mine &&
              "shadow-[inset_2px_0_0_var(--brand),1px_0_0_var(--border)]",
            column.right && "justify-end text-right",
            column.id === "status" && "cursor-default"
          )}
          onClick={column.id === "status" ? (event) => event.stopPropagation() : undefined}
        >
          {cell(column)}
        </span>
      ))}
    </div>
  );
};

/** Empty states for the list (no jobs vs. nothing matches the filters). */
export const JobsEmpty = ({
  filtering,
  onReset,
  onCreate
}: {
  filtering: boolean;
  onReset: () => void;
  onCreate?: (() => void) | undefined;
}) =>
  filtering ? (
    <EmptyState
      icon={Briefcase}
      title="Không có job phù hợp"
      description="Thử bỏ bớt bộ lọc hoặc tìm theo mã khác."
      action={
        <Button variant="outline" size="sm" onClick={onReset}>
          Xóa bộ lọc
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Briefcase}
      title="Chưa có job"
      description="Mỗi job là một gói công việc của dự án. Tạo job, hoặc “Nhập Task” để thêm task — gói mới tự thành job."
      action={
        onCreate ? (
          <Button size="sm" onClick={onCreate}>
            Tạo job
          </Button>
        ) : undefined
      }
    />
  );
