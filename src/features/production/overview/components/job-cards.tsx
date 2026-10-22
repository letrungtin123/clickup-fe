import { cn } from "cn";
import { CalendarClock, ChevronRight, CornerDownRight, UserPlus } from "lucide-react";
import type { MouseEvent } from "react";
import { useNavigate } from "react-router";

import { Link } from "@/components/shared/router-link";
import { Button } from "@/components/ui/button";
import type { OverviewTask } from "@/contracts/production-overview";

import { formatInteger } from "../../format";
import { shortName } from "../../jobs-model";
import {
  barRatio,
  dateTimeLabel,
  jobDeadline,
  matchedLabel,
  percentOf,
  projectFlags,
  taskDeadline,
  type Bar,
  type BarFocus,
  type FilteredJob,
  type ProjectGroup
} from "../model";
import { DeadlineLabel, FlagList, JobMeta, PeopleStack, ProgressBar, ProjectCode, StatusPill } from "./overview-bits";
import { jobBarDetail, rowFlags, type TableView } from "./table-view";

/**
 * PD-082 — "Tổng quan" on phones: no table. Each project is a header (sticky while its jobs pass, folds away) with its
 * figures and "Chia task", then one card per job in the same order and with the same information as the desktop row:
 * Job Code · Leader / nhận / cập nhật · trạng thái, deadline khách, nhân viên, tiến độ, đang kẹt ở đâu (and the matched
 * lines when a task filter is on). Nothing is wider than the screen.
 */
export const OverviewJobCards = ({ groups, view }: { groups: ProjectGroup[]; view: TableView }) => (
  <div className="flex min-w-0 flex-col gap-4">
    {groups.map((group) => (
      <ProjectCards key={group.project.id} group={group} view={view} />
    ))}
  </div>
);

/** "20 / 39 · 51%" on one line. */
const RatioInline = ({ bar, focus }: { bar: Bar; focus: BarFocus }) => {
  if (bar.total <= 0) return <span className="shrink-0 text-xs text-foreground-subtle">Chưa có số tấm</span>;
  const [part, total] = barRatio(bar, focus).split(" / ");
  return (
    <span className="shrink-0 text-[13px] whitespace-nowrap tabular-nums">
      <b className="font-semibold text-foreground">{part}</b>
      <span className="text-foreground-subtle"> / {total}</span>
      <span className="ml-1.5 text-xs text-foreground-muted">{percentOf(focus ? bar[focus] : bar.done, bar.total)}%</span>
    </span>
  );
};

const ProjectCards = ({ group, view }: { group: ProjectGroup; view: TableView }) => {
  const open = !view.collapsed.has(group.project.id);
  const matched = group.rows.flatMap((row) => row.tasks);
  const flags = projectFlags(group);
  return (
    <section aria-label={`Project ${group.project.code}`} className="flex min-w-0 flex-col gap-2">
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 border-y bg-[color-mix(in_oklab,var(--background),var(--foreground)_4%)] px-4 py-2.5 shadow-[0_1px_0_var(--border)]">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => view.toggle(group.project.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn("size-4 shrink-0 text-foreground-muted transition-transform duration-150", open && "rotate-90")}
            />
            <ProjectCode project={group.project} />
            <span className="min-w-0 truncate text-[13.5px] font-semibold">{group.project.name}</span>
          </button>
          {view.canAssign && group.noTaskJobs.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 bg-surface text-brand-text hover:text-brand-text"
              onClick={() => view.onAssign(group)}
              aria-label={`Chia task cho Project ${group.project.code}`}
            >
              <UserPlus />
              Chia task
            </Button>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <ProgressBar bar={group.bar} focus={view.focus} className="flex-1" />
          <RatioInline bar={group.bar} focus={view.focus} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-foreground-muted tabular-nums">
          <span>
            {view.taskMode
              ? matchedLabel(matched)
              : `${formatInteger(group.openJobs)} job đang mở · ${formatInteger(group.bar.total)} tấm`}
          </span>
          {group.nextDeadline && group.openJobs > 0 ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock aria-hidden="true" className="size-3.5" />
              Gần nhất {dateTimeLabel(group.nextDeadline, view.timeZone)}
            </span>
          ) : null}
          {flags.length > 0 ? <FlagList flags={flags} className="basis-full" /> : null}
        </div>
      </div>
      {open ? (
        <ul className="flex min-w-0 flex-col gap-2" aria-label={`Job của Project ${group.project.code}`}>
          {group.rows.map((row) => (
            <JobCard key={row.job.id} row={row} view={view} />
          ))}
        </ul>
      ) : null}
    </section>
  );
};

const cardClick = (event: MouseEvent<HTMLElement>, open: () => void) => {
  const target = event.target as HTMLElement;
  if (target.closest("a,button,[role=dialog]")) return;
  open();
};

const JobCard = ({ row, view }: { row: FilteredJob; view: TableView }) => {
  const navigate = useNavigate();
  const { job, tasks } = row;
  const deadline = jobDeadline(job, view.now);
  const flags = rowFlags(row, view);
  return (
    <li
      aria-label={`Job ${job.code}`}
      onClick={(event) => cardClick(event, () => void navigate(`/production/jobs/${job.id}`))}
      className="flex min-w-0 cursor-pointer flex-col gap-2.5 rounded-xl border bg-surface p-3 shadow-xs transition-colors active:bg-surface-hover"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={`/production/jobs/${job.id}`}
            className="min-w-0 flex-1 truncate rounded-sm text-[14px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={job.name ? `${job.code} — ${job.name}` : job.code}
          >
            {job.code}
          </Link>
          <StatusPill name={job.status.name} color={job.status.color} className="max-w-[45%] shrink-0" />
        </div>
        {job.name ? <span className="truncate text-xs text-foreground-muted">{job.name}</span> : null}
        <JobMeta job={job} now={view.now} timeZone={view.timeZone} />
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
          <span className={cn("inline-flex items-center gap-1 font-medium tabular-nums", deadline.tone === "done" && "text-foreground-muted")}>
            <CalendarClock aria-hidden="true" className="size-3.5 text-foreground-subtle" />
            <span className="sr-only">Deadline khách </span>
            {dateTimeLabel(job.deadline, view.timeZone)}
          </span>
          <DeadlineLabel state={deadline} />
        </div>
        <PeopleStack people={job.people} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-3">
          <ProgressBar bar={job.images} focus={view.focus} className="flex-1" />
          <RatioInline bar={job.images} focus={view.focus} />
        </div>
        {job.images.total > 0 || job.tasksWithoutQty > 0 ? (
          <span className="truncate text-[11.5px] text-foreground-muted tabular-nums">{jobBarDetail(job)}</span>
        ) : null}
      </div>
      {flags.length > 0 ? <FlagList flags={flags} /> : null}
      {view.taskMode && tasks.length > 0 ? (
        <ul className="-mx-1 flex flex-col divide-y divide-dashed rounded-lg border bg-[color-mix(in_oklab,var(--surface),var(--foreground)_2%)]">
          {tasks.map((task) => (
            <TaskLine key={task.id} task={task} view={view} />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

const TaskLine = ({ task, view }: { task: OverviewTask; view: TableView }) => (
  <li aria-label={`Task #${task.code}`} className="flex min-w-0 items-center gap-2 px-2.5 py-2 text-[12.5px]">
    <CornerDownRight aria-hidden="true" className="size-3.5 shrink-0 text-foreground-subtle" />
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-1.5">
        <b className="shrink-0 font-semibold tabular-nums">#{task.code}</b>
        <span className="min-w-0 truncate text-foreground-muted">{task.process.name}</span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs">
        <span className={cn("tabular-nums", task.overdue && "font-medium text-danger")}>{dateTimeLabel(task.deadline, view.timeZone)}</span>
        <DeadlineLabel state={taskDeadline(task, view.now)} />
      </span>
    </div>
    <div className="flex shrink-0 flex-col items-end gap-1">
      <StatusPill name={task.status.name} color={task.status.color} />
      <span className="text-[11.5px] text-foreground-muted tabular-nums">
        {task.images === null ? "Chưa có SL" : `${formatInteger(task.images)} tấm`} · {shortName(task.assignee.displayName)}
      </span>
    </div>
  </li>
);

