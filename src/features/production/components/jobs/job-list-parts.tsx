import { cn } from "cn";
import { ChevronRight, ListPlus, ListTree, Split } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CustomField, JobScopes, ProductionRole } from "@/contracts/production-catalog";
import type {
  JobDetail,
  JobSummary,
  ProductionTask,
  TaskTransitionOption
} from "@/contracts/production-jobs";

import { jobStatusEditable, type DetailState } from "../../job-list-model";
import type { Tag } from "../../types";
import { StatusChip } from "./job-bits";
import { JobStatusMenu } from "./job-status-menu";
import { StatusSelect } from "./transition-controls";

/**
 * Pieces shared by the job List view's table and phone cards (PD-067): the view's state, the job / task status controls
 * (the job page's own), the expand chevron, the task count and "+ Chia task" / "+ Nhập Task".
 */

/** The person of the per-person view ("Mọi nhân viên", PD-034): their part of each job is shown. */
export type ListPerson = { id: string; displayName: string };

export type ListContext = {
  timeZone: string;
  person: ListPerson | null;
  tags: Tag[];
  /** JOB custom fields shown as columns. */
  fields: CustomField[];
  viewer: { id: string; updateScope: JobScopes["update"]; roles: readonly ProductionRole[] };
  details: ReadonlyMap<string, DetailState>;
  busyTaskId: string | null | undefined;
  move: (task: ProductionTask, option: TaskTransitionOption) => void;
  openTask: (task: ProductionTask, line: ProductionTask | null) => void;
  openJob: (jobId: string) => void;
  toggleJob: (jobId: string) => void;
  toggleMonth: (month: string) => void;
  retryJob: (jobId: string) => void;
  addTasks: (detail: JobDetail) => void;
  createJob: ((month: string) => void) | undefined;
  loadMore: () => void;
  loadingMore: boolean;
};

/** The job's status chip: the job page's menu where the viewer may change it (PD-038), else the plain chip. */
export const JobRowStatus = ({
  job,
  ctx,
  align = "start"
}: {
  job: JobSummary;
  ctx: ListContext;
  align?: "start" | "end";
}) => {
  const detail = ctx.details.get(job.id);
  return (
    <JobStatusMenu
      jobId={job.id}
      status={job.jobStatus}
      readiness={job}
      editable={jobStatusEditable(
        job,
        ctx.viewer,
        detail?.status === "success" ? detail.job : null
      )}
      align={align}
      className="max-w-full"
    />
  );
};

/** A task's status: its moves as the job page's dropdown; a subtask follows its line (plain chip). */
export const TaskRowStatus = ({
  task,
  line,
  detail,
  ctx,
  align = "start"
}: {
  task: ProductionTask;
  line: ProductionTask | null;
  detail: JobDetail;
  ctx: ListContext;
  align?: "start" | "end";
}) =>
  line ? (
    <span title={`Theo task #${line.code}`} className="inline-flex min-w-0">
      <StatusChip status={line.status} size="sm" className="opacity-80" />
      <span className="sr-only">, theo task #{line.code}</span>
    </span>
  ) : (
    <StatusSelect
      // An archived job is read-only (the job page does the same).
      task={
        detail.archived
          ? { ...task, capabilities: { ...task.capabilities, transitions: [] } }
          : task
      }
      onMove={(option) => ctx.move(task, option)}
      busy={ctx.busyTaskId === task.id}
      size="sm"
      align={align}
    />
  );

/** "+ Chia task" (or "+ Nhập Task" with "create: own", PD-036) under an expanded job — the job page's dialogs. */
export const AddTasksButton = ({
  detail,
  ctx,
  className
}: {
  detail: JobDetail;
  ctx: ListContext;
  className?: string;
}) => (
  <Button
    variant="ghost"
    size="sm"
    className={cn("text-foreground-muted hover:text-foreground", className)}
    onClick={() => ctx.addTasks(detail)}
  >
    {detail.capabilities.splitOwnOnly ? <ListPlus /> : <Split />}
    {detail.capabilities.splitOwnOnly ? "Nhập Task" : "Chia task"}
  </Button>
);

/** The expand chevron of a job row / card. */
export const ExpandButton = ({
  job,
  expanded,
  onToggle,
  className
}: {
  job: JobSummary;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) => (
  <button
    type="button"
    aria-expanded={expanded}
    aria-label={`${expanded ? "Thu gọn" : "Mở"} task của job ${job.code}`}
    onClick={onToggle}
    className={cn(
      "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
      className
    )}
  >
    <ChevronRight
      aria-hidden="true"
      className={cn("size-4 transition-transform duration-150", expanded && "rotate-90")}
    />
  </button>
);

/** "≡ 5": the job's task count (lines), like ClickUp's subtask count. */
export const TaskCountBadge = ({ count, className }: { count: number; className?: string }) =>
  count > 0 ? (
    <span
      title={`${count} task`}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-[11px] font-medium text-foreground-muted tabular-nums",
        className
      )}
    >
      <ListTree aria-hidden="true" className="size-3.5" />
      {count}
      <span className="sr-only"> task</span>
    </span>
  ) : null;
