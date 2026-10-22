import { cn } from "cn";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, CornerDownRight, FolderOpen, UserPlus, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useNavigate } from "react-router";

import { Link } from "@/components/shared/router-link";
import { EmptyState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OverviewTask, ProductionOverview } from "@/contracts/production-overview";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { formatInteger } from "../../format";
import { shortName } from "../../jobs-model";
import {
  barDetail,
  barFocus,
  dateTimeLabel,
  filterJobs,
  groupByProject,
  isFiltered,
  isTaskMode,
  jobDeadline,
  matchedLabel,
  projectFlags,
  subMenuOf,
  tableTitles,
  taskDeadline,
  type FilteredJob,
  type JobFlag,
  type OverviewFilter,
  type ProjectGroup
} from "../model";
import { OverviewJobCards } from "./job-cards";
import {
  BarRatio,
  DeadlineLabel,
  EmptyMark,
  FlagList,
  JobMeta,
  PeopleStack,
  ProgressBar,
  ProjectCode,
  StatusPill
} from "./overview-bits";
import { jobBarDetail, rowFlags, type TableView } from "./table-view";

/**
 * PD-080 / PD-082 — the job table of "Tổng quan": jobs grouped by project (most urgent first) under a project band (its
 * figures and "Chia task"), job rows (Job Code · deadline khách · tiến độ tấm · đang kẹt ở đâu · nhân viên · trạng thái),
 * and — with Đang làm / Xong / Trễ selected — the matching lines under each job.
 *
 * Every row (header, bands, jobs, lines) is laid out on ONE grid template (`--ov-cols`) with the same padding, so the
 * columns line up exactly; indentation lives inside the first cell. The header sticks to the top of the page while it
 * scrolls and each band sticks under it while its jobs pass. Narrower than the table's minimum (small tablets), the rows
 * scroll sideways inside the box with the Job Code column pinned. Phones get cards (`OverviewJobCards`).
 */

type Column = { id: string; track: string; min: number };
const columns: Column[] = [
  { id: "job", track: "minmax(9.5rem,3fr)", min: 9.5 },
  { id: "deadline", track: "7.75rem", min: 7.75 },
  { id: "bar", track: "minmax(5.5rem,1fr)", min: 5.5 },
  // "12.345 / 23.456" fits; the numbers are right-aligned, the share under them.
  { id: "ratio", track: "5.5rem", min: 5.5 },
  { id: "flags", track: "minmax(8.5rem,1.5fr)", min: 8.5 },
  { id: "people", track: "5.25rem", min: 5.25 },
  // "Đang giao client" (the longest default job status) fits.
  { id: "status", track: "8rem", min: 8 },
  { id: "open", track: "1rem", min: 1 }
];
const GAP_REM = 0.625;
const PAD_REM = 0.75;
const template = columns.map((column) => column.track).join(" ");
/** Below this width the rows scroll sideways (the tracks' minimums, the gaps and the row padding). */
const minRem = columns.reduce((sum, column) => sum + column.min, 0) + GAP_REM * (columns.length - 1) + PAD_REM * 2;

const gridRow = "grid grid-cols-(--ov-cols) items-center gap-x-2.5 px-3";
/**
 * The first cell, pinned while the rows scroll sideways: as tall as its row and reaching the row's left edge (each pinned
 * cell sets its own opaque background and left padding for that mode).
 */
const pinned =
  "group-data-[narrow=true]/ovt:sticky group-data-[narrow=true]/ovt:left-0 group-data-[narrow=true]/ovt:z-[2] group-data-[narrow=true]/ovt:-ml-3 group-data-[narrow=true]/ovt:self-stretch group-data-[narrow=true]/ovt:shadow-[1px_0_0_var(--border)]";

/** Row clicks open the job, except on the controls inside (and while text is being selected). */
const rowClick = (event: MouseEvent<HTMLElement>, open: () => void) => {
  const target = event.target as HTMLElement;
  if (!event.currentTarget.contains(target) || target.closest("a,button,[role=menu],[role=dialog],[role=listbox]")) return;
  if (window.getSelection()?.toString()) return;
  open();
};

export const OverviewJobTable = ({
  overview,
  filter,
  now,
  canAssign,
  onSub,
  onClear,
  onAssign
}: {
  overview: ProductionOverview;
  filter: OverviewFilter;
  now: Date;
  canAssign: boolean;
  onSub: (sub: string | null) => void;
  onClear: () => void;
  onAssign: (group: ProjectGroup) => void;
}) => {
  const phone = useBreakpoint() === "mobile";
  const taskMode = isTaskMode(filter);
  const rows = filterJobs(overview.jobs, filter);
  const groups = groupByProject(rows, overview.jobs);
  const menu = subMenuOf(overview, filter.card);
  const titles = tableTitles(filter, overview.clock.alertHours);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const allCollapsed = groups.length > 0 && groups.every((group) => collapsed.has(group.project.id));
  const view: TableView = {
    taskMode,
    focus: barFocus(filter),
    now,
    timeZone: overview.timeZone,
    alertHours: overview.clock.alertHours,
    clientFilter: filter.card === "overdue",
    canAssign: canAssign && !taskMode,
    collapsed,
    toggle: (projectId) =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(projectId)) next.delete(projectId);
        else next.add(projectId);
        return next;
      }),
    onAssign
  };
  return (
    <section
      aria-label="Tiến độ job"
      className={cn("min-w-0", phone ? "flex flex-col gap-3" : "overflow-clip rounded-xl border bg-surface shadow-xs")}
    >
      <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", phone ? "" : "border-b px-4 py-3")}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex min-w-0 items-center gap-2 text-[15px] leading-6 font-semibold">
            <span className="truncate">{titles.title}</span>
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-2 text-[11px] font-semibold text-foreground-muted tabular-nums">
              {formatInteger(rows.length)} job
            </span>
          </h2>
          <p className="text-xs text-foreground-muted">{titles.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          {menu ? (
            <SubMenuSelect title={menu.title} value={filter.sub} all={menu.all} options={menu.options} onChange={onSub} />
          ) : null}
          {groups.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-foreground-muted"
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((group) => group.project.id)))}
            >
              {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
              {allCollapsed ? "Mở tất cả" : "Thu gọn tất cả"}
            </Button>
          ) : null}
          {isFiltered(filter) ? (
            <Button variant="outline" size="sm" onClick={onClear}>
              <X />
              Bỏ lọc
            </Button>
          ) : null}
        </div>
      </div>
      {groups.length === 0 ? (
        <EmptyState
          size="sm"
          icon={FolderOpen}
          className={phone ? "w-full max-w-none rounded-xl border bg-surface" : undefined}
          title={isFiltered(filter) ? "Không có gì trong nhóm này" : "Không có job nào trong khoảng này"}
          description={
            isFiltered(filter)
              ? "Bỏ lọc để xem mọi job của khoảng thời gian."
              : "Không job nào đến hạn khách, có task đến hạn hay đang trễ trong khoảng đã chọn."
          }
        />
      ) : phone ? (
        <OverviewJobCards groups={groups} view={view} />
      ) : (
        <JobGrid groups={groups} view={view} />
      )}
    </section>
  );
};

/** Line flags of a task row: who is on leave. */
const taskFlags = (task: OverviewTask): JobFlag[] => [
  ...(task.qcOnLeave && task.stage === "WAITING_QC" ? [{ key: "qcLeave", label: "QC đang nghỉ — đổi QC", tone: "danger" as const }] : []),
  ...(task.assigneeOnLeave ? [{ key: "staffLeave", label: "Nhân viên đang nghỉ", tone: "warning" as const }] : [])
];

const JobGrid = ({ groups, view }: { groups: ProjectGroup[]; view: TableView }) => {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return undefined;
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const update = () => setNarrow(element.clientWidth > 0 && element.clientWidth < minRem * rem - 1);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const inner: CSSProperties = { minWidth: `${minRem}rem` };
  return (
    <div
      role="table"
      aria-label="Job theo Project"
      data-narrow={narrow}
      className="group/ovt relative text-[13px]"
      style={{ "--ov-cols": template } as CSSProperties}
    >
      <div ref={headRef} className="sticky top-0 z-20 overflow-hidden border-b bg-surface">
        <div
          role="row"
          style={inner}
          className={cn(gridRow, "h-9 text-[11px] font-semibold tracking-[0.06em] text-foreground-subtle uppercase")}
        >
          <span
            role="columnheader"
            data-col="job"
            className={cn(
              "truncate bg-surface pl-6",
              pinned,
              "group-data-[narrow=true]/ovt:flex group-data-[narrow=true]/ovt:items-center group-data-[narrow=true]/ovt:pl-9"
            )}
          >
            {view.taskMode ? "Job Code / task" : "Job Code"}
          </span>
          <span role="columnheader" data-col="deadline" className="truncate">
            {view.taskMode ? "Deadline" : "Deadline khách"}
          </span>
          <span role="columnheader" data-col="bar" className="col-span-2 truncate">
            Tiến độ (tấm)
          </span>
          <span role="columnheader" data-col="flags" className="truncate">
            {view.taskMode ? "Ghi chú" : "Đang kẹt ở đâu"}
          </span>
          <span role="columnheader" data-col="people" className="truncate">
            Nhân viên
          </span>
          <span role="columnheader" data-col="status" className="truncate">
            Trạng thái
          </span>
          <span role="columnheader" data-col="open">
            <span className="sr-only">Mở job</span>
          </span>
        </div>
      </div>
      <div
        ref={bodyRef}
        className={cn(narrow && "overflow-x-auto overscroll-x-contain")}
        onScroll={(event) => {
          if (headRef.current) headRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
      >
        <div style={inner}>
          {groups.map((group) => {
            const open = !view.collapsed.has(group.project.id);
            return (
              <div key={group.project.id} role="rowgroup" aria-label={`Project ${group.project.code}`} className="group/rg">
                <ProjectBand group={group} view={view} open={open} />
                {open ? group.rows.map((row) => <JobRows key={row.job.id} row={row} view={view} />) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** Opaque tints (a pinned cell must match its row exactly). */
const bandBg = "bg-[color-mix(in_oklab,var(--surface),var(--foreground)_5%)]";

/** The project band: a group header with the project's figures, sticky under the table header. */
const ProjectBand = ({ group, view, open }: { group: ProjectGroup; view: TableView; open: boolean }) => {
  const matched = group.rows.flatMap((row) => row.tasks);
  const late = group.nextDeadline !== null && group.clientLateJobs > 0 && Date.parse(group.nextDeadline) < view.now.getTime();
  const detail = barDetail(group.bar) || "Chưa có số tấm";
  return (
    <div
      role="row"
      aria-label={`Project ${group.project.code} — ${group.project.name}`}
      className={cn(
        gridRow,
        bandBg,
        "min-h-14 border-t border-border py-2 group-first/rg:border-t-0",
        "group-data-[narrow=false]/ovt:sticky group-data-[narrow=false]/ovt:top-9 group-data-[narrow=false]/ovt:z-10"
      )}
    >
      <div
        role="cell"
        data-col="job"
        className={cn("flex min-w-0 flex-col justify-center", pinned, bandBg, "group-data-[narrow=true]/ovt:pl-3")}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => view.toggle(group.project.id)}
          className="group/band flex w-full min-w-0 items-center gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-5 shrink-0 rounded p-0.5 text-foreground-muted transition-transform duration-150 group-hover/band:bg-muted group-hover/band:text-foreground",
              open && "rotate-90"
            )}
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <ProjectCode project={group.project} />
              <span className="min-w-0 truncate font-semibold text-foreground" title={group.project.name}>
                {group.project.name}
              </span>
            </span>
            <span className="truncate text-xs text-foreground-muted tabular-nums">
              {view.taskMode
                ? matchedLabel(matched)
                : `${formatInteger(group.openJobs)} job đang mở · ${formatInteger(group.bar.total)} tấm`}
              {open ? null : ` · ${formatInteger(group.rows.length)} job đã thu gọn`}
            </span>
          </span>
        </button>
      </div>
      <div role="cell" data-col="deadline" className="flex min-w-0 flex-col items-start gap-0.5">
        {group.nextDeadline && group.openJobs > 0 ? (
          <>
            <span className={cn("font-medium tabular-nums", late ? "text-danger" : "text-foreground")}>
              {dateTimeLabel(group.nextDeadline, view.timeZone)}
            </span>
            <span className="truncate text-xs text-foreground-muted">Deadline gần nhất</span>
          </>
        ) : (
          <>
            <EmptyMark label="Không còn job đang mở" />
            <span className="truncate text-xs text-foreground-muted">Đã giao hết</span>
          </>
        )}
      </div>
      <div role="cell" data-col="bar" className="flex min-w-0 flex-col gap-1.5">
        <ProgressBar bar={group.bar} focus={view.focus} />
        <span className="truncate text-[11.5px] text-foreground-muted tabular-nums" title={detail}>
          {detail}
        </span>
      </div>
      <div role="cell" data-col="ratio">
        <BarRatio bar={group.bar} focus={view.focus} />
      </div>
      <div role="cell" data-col="flags" className="min-w-0">
        <FlagList flags={projectFlags(group)} lines={2} />
      </div>
      <div role="cell" data-col="people" />
      <div role="cell" data-col="status" className="col-span-2 flex justify-end">
        {view.canAssign && group.noTaskJobs.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="bg-surface text-brand-text shadow-xs hover:text-brand-text"
            onClick={() => view.onAssign(group)}
            aria-label={`Chia task cho Project ${group.project.code}`}
          >
            <UserPlus />
            Chia task
          </Button>
        ) : null}
      </div>
    </div>
  );
};

const JobRows = ({ row, view }: { row: FilteredJob; view: TableView }) => {
  const navigate = useNavigate();
  const { job, tasks } = row;
  const deadline = jobDeadline(job, view.now);
  const detail = jobBarDetail(job);
  return (
    <>
      <div
        role="row"
        aria-label={`Job ${job.code}`}
        onClick={(event) => rowClick(event, () => void navigate(`/production/jobs/${job.id}`))}
        className={cn(
          gridRow,
          "group/row min-h-16 cursor-pointer border-t border-border/70 bg-surface py-2.5 transition-colors",
          "hover:bg-[color-mix(in_oklab,var(--surface),var(--foreground)_3%)] has-[a:focus-visible]:bg-[color-mix(in_oklab,var(--surface),var(--foreground)_3%)]"
        )}
      >
        <div
          role="cell"
          data-col="job"
          className={cn(
            "flex min-w-0 flex-col justify-center gap-0.5 pl-6",
            pinned,
            "group-data-[narrow=true]/ovt:bg-surface group-data-[narrow=true]/ovt:pl-9 group-data-[narrow=true]/ovt:group-hover/row:bg-[color-mix(in_oklab,var(--surface),var(--foreground)_3%)]"
          )}
        >
          <span className="flex min-w-0 items-baseline gap-1.5" title={job.name ? `${job.code} — ${job.name}` : job.code}>
            <Link
              to={`/production/jobs/${job.id}`}
              className="min-w-0 truncate rounded-sm font-semibold text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {job.code}
            </Link>
            {job.name ? <span className="max-w-[45%] shrink-0 truncate text-xs text-foreground-muted">{job.name}</span> : null}
          </span>
          <JobMeta job={job} now={view.now} timeZone={view.timeZone} />
        </div>
        <div role="cell" data-col="deadline" className="flex min-w-0 flex-col items-start gap-0.5">
          <span className={cn("font-medium tabular-nums", deadline.tone === "done" ? "text-foreground-muted" : "text-foreground")}>
            {dateTimeLabel(job.deadline, view.timeZone)}
          </span>
          <DeadlineLabel state={deadline} />
        </div>
        <div role="cell" data-col="bar" className="flex min-w-0 flex-col gap-1.5">
          <ProgressBar bar={job.images} focus={view.focus} />
          <span className="truncate text-[11.5px] text-foreground-muted tabular-nums" title={detail}>
            {detail}
          </span>
        </div>
        <div role="cell" data-col="ratio">
          <BarRatio bar={job.images} focus={view.focus} />
        </div>
        <div role="cell" data-col="flags" className="min-w-0">
          <FlagList flags={rowFlags(row, view)} lines={2} empty={<EmptyMark label="Không vướng gì" />} />
        </div>
        <div role="cell" data-col="people" className="min-w-0">
          <PeopleStack people={job.people} />
        </div>
        <div role="cell" data-col="status" className="flex min-w-0">
          <StatusPill name={job.status.name} color={job.status.color} />
        </div>
        <div role="cell" data-col="open" className="flex justify-end">
          <ChevronRight
            aria-hidden="true"
            className="size-4 text-foreground-subtle opacity-60 transition group-hover/row:translate-x-0.5 group-hover/row:text-foreground group-hover/row:opacity-100"
          />
        </div>
      </div>
      {view.taskMode ? tasks.map((task) => <TaskRow key={task.id} task={task} view={view} />) : null}
    </>
  );
};

const TaskRow = ({ task, view }: { task: OverviewTask; view: TableView }) => {
  const deadline = taskDeadline(task, view.now);
  const flags = taskFlags(task);
  return (
    <div
      role="row"
      aria-label={`Task #${task.code}`}
      className={cn(
        gridRow,
        "min-h-12 border-t border-dashed border-border/70 bg-[color-mix(in_oklab,var(--surface),var(--foreground)_1.5%)] py-2 text-[12.5px]"
      )}
    >
      <div
        role="cell"
        data-col="job"
        className={cn(
          "flex min-w-0 items-center gap-1.5 pl-6",
          pinned,
          "group-data-[narrow=true]/ovt:bg-[color-mix(in_oklab,var(--surface),var(--foreground)_1.5%)] group-data-[narrow=true]/ovt:pl-9"
        )}
      >
        <CornerDownRight aria-hidden="true" className="size-3.5 shrink-0 text-foreground-subtle" />
        <span className="shrink-0 font-semibold tabular-nums">#{task.code}</span>
        <span className="min-w-0 truncate text-foreground-muted" title={task.process.name}>
          {task.process.name}
        </span>
      </div>
      <div role="cell" data-col="deadline" className="flex min-w-0 flex-col items-start gap-0.5">
        <span className={cn("tabular-nums", task.overdue ? "font-medium text-danger" : "text-foreground")}>
          {dateTimeLabel(task.deadline, view.timeZone)}
        </span>
        <DeadlineLabel state={deadline} />
      </div>
      <div role="cell" data-col="bar" className="col-span-2 text-right tabular-nums">
        {task.images === null ? (
          <span className="text-foreground-subtle">Chưa có SL</span>
        ) : (
          <span>
            <b className="font-semibold">{formatInteger(task.images)}</b> <span className="text-foreground-muted">tấm</span>
          </span>
        )}
      </div>
      <div role="cell" data-col="flags" className="flex min-w-0 items-center gap-1.5">
        {flags.length > 0 ? <FlagList flags={flags} lines={1} /> : null}
        {task.note ? (
          <span className="min-w-0 truncate text-xs text-foreground-muted" title={task.note}>
            {task.note}
          </span>
        ) : flags.length === 0 ? (
          <EmptyMark label="Không có ghi chú" />
        ) : null}
      </div>
      <div role="cell" data-col="people" className="flex min-w-0 items-center gap-1.5" title={task.assignee.displayName}>
        <UserAvatar user={task.assignee} size="xs" />
        <span className="truncate text-xs">{shortName(task.assignee.displayName)}</span>
      </div>
      <div role="cell" data-col="status" className="flex min-w-0">
        <StatusPill name={task.status.name} color={task.status.color} />
      </div>
      <div role="cell" data-col="open" />
    </div>
  );
};

const ALL = "__all__";

const SubMenuSelect = ({
  title,
  value,
  all,
  options,
  onChange
}: {
  title: string;
  value: string | null;
  all: number;
  options: { key: string; label: string; count: number }[];
  onChange: (sub: string | null) => void;
}) => {
  const items = [
    { value: ALL, label: `Tất cả (${formatInteger(all)})` },
    ...options.map((option) => ({ value: option.key, label: `${option.label} (${formatInteger(option.count)})` }))
  ];
  const current = items.find((item) => item.value === (value ?? ALL)) ?? items[0]!;
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground-muted max-sm:w-full">
      <span className="shrink-0">{title}</span>
      <Select items={items} value={current.value} onValueChange={(next: string | null) => onChange(!next || next === ALL ? null : next)}>
        <SelectTrigger
          aria-label={title}
          className={cn("min-w-44 max-sm:min-w-0 max-sm:flex-1", value ? "border-brand/60 bg-brand-soft/50 text-foreground" : "")}
        >
          <SelectValue>{current.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
};
