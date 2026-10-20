import { cn } from "cn";
import { Archive, ChevronRight, CornerDownRight, Plus, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { Link } from "@/components/shared/router-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { JobPersonShare } from "@/contracts/production-jobs";

import { formatInteger } from "../../format";
import {
  jobPointsCell,
  progressLabel,
  projectLabel,
  projectTitle,
  taskPointsCell,
  taskProgress,
  type ListRow
} from "../../job-list-model";
import { formatWorkDay, shortName } from "../../jobs-model";
import { CustomFieldChips } from "../list-filters";
import { TagChips } from "../tag-picker";
import {
  KindBadge,
  LateBadge,
  MissingQtyNote,
  Person,
  ProcessTotalChips,
  QtyValue
} from "./job-bits";
import { MonthPill, PointsText, ProcessChip, ProgressCell, ShiftChip } from "./job-list-cells";
import { JobPeopleStack } from "./job-people";
import { AddTasksButton, JobRowStatus, TaskRowStatus, type ListContext } from "./job-list-parts";

const noShare: JobPersonShare = {
  processes: [],
  taskCount: 0,
  qtyAssigned: 0,
  qtyDone: 0,
  qtyChecked: 0
};

type JobBlock = { job: Extract<ListRow, { kind: "job" }>; children: ListRow[] };
type Block = Extract<ListRow, { kind: "group" | "group-footer" | "more" }> | JobBlock;

/** The flat rows as phone blocks: each job card with the rows that unfold under it. */
const toBlocks = (rows: readonly ListRow[]): Block[] => {
  const blocks: Block[] = [];
  let current: JobBlock | null = null;
  for (const row of rows) {
    if (row.kind === "job") {
      current = { job: row, children: [] };
      blocks.push(current);
    } else if (row.kind === "group" || row.kind === "group-footer" || row.kind === "more") {
      current = null;
      blocks.push(row);
    } else if (current) {
      current.children.push(row);
    }
  }
  return blocks;
};

/**
 * Phones (PD-067): the same month groups (sticky headers that fold) with job cards; a card's chevron unfolds its tasks
 * as compact cards (status dropdown, Done dialog and task sheet as on the job page), subtasks nested. No sideways scroll.
 */
export const JobListCards = ({ rows, ctx }: { rows: ListRow[]; ctx: ListContext }) => (
  <div className="flex flex-col gap-2.5 pb-4">
    {toBlocks(rows).map((block) => {
      if ("job" in block) return <JobCard key={block.job.key} block={block} ctx={ctx} />;
      switch (block.kind) {
        case "group":
          return (
            <div
              key={block.key}
              className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-canvas/95 px-4 pt-2 pb-1.5 backdrop-blur-sm"
            >
              <button
                type="button"
                aria-expanded={!block.collapsed}
                onClick={() => ctx.toggleMonth(block.month)}
                className="flex min-h-10 items-center gap-1.5 rounded-md pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    "size-4 text-foreground-muted transition-transform",
                    !block.collapsed && "rotate-90"
                  )}
                />
                <MonthPill month={block.month} />
                <span className="sr-only">{block.collapsed ? ", mở nhóm" : ", thu gọn nhóm"}</span>
              </button>
              <span className="text-xs font-medium text-foreground-muted tabular-nums">
                {formatInteger(block.count)} job
              </span>
            </div>
          );
        case "group-footer":
          return ctx.createJob ? (
            <Button
              key={block.key}
              variant="ghost"
              className="self-start text-foreground-muted"
              onClick={() => ctx.createJob?.(block.month)}
            >
              <Plus />
              Tạo job
            </Button>
          ) : null;
        case "more":
          return (
            <Button
              key={block.key}
              variant="outline"
              onClick={ctx.loadMore}
              disabled={ctx.loadingMore}
              className="self-center"
            >
              {ctx.loadingMore ? <Spinner /> : null}
              Tải thêm job
            </Button>
          );
      }
    })}
  </div>
);

const JobCard = ({ block, ctx }: { block: JobBlock; ctx: ListContext }) => {
  const { job, expanded } = block.job;
  const late = job.lateTaskCount > 0;
  const share = job.personShare ?? noShare;
  const person = ctx.person;
  return (
    <div className="flex flex-col gap-2">
      <article
        aria-label={job.code}
        className={cn(
          "relative flex flex-col gap-2.5 rounded-xl border bg-surface p-3.5 shadow-xs has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring",
          job.archived && "opacity-70"
        )}
      >
        <div className="flex items-start gap-2">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* The whole card opens the job; the controls below sit above this link. */}
            <Link
              to={`/production/jobs/${job.id}`}
              className="line-clamp-2 text-sm font-semibold outline-none [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-xl after:content-['']"
              title={job.code}
            >
              {job.archived ? (
                <Archive
                  className="mr-1 inline size-3.5 align-[-2px] text-foreground-subtle"
                  aria-label="Đã lưu trữ"
                />
              ) : null}
              {job.code}
            </Link>
            <span
              className="truncate text-xs text-foreground-muted"
              title={projectTitle(job.project)}
            >
              {projectLabel(job.project)}
              {job.name ? ` · ${job.name}` : ""}
            </span>
          </span>
          <span className="relative z-[1] flex max-w-[50%] shrink-0 justify-end">
            <JobRowStatus job={job} ctx={ctx} align="end" />
          </span>
        </div>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
          <span className="tabular-nums">
            Nhận {formatWorkDay(job.receivedAt, ctx.timeZone)} → Giao{" "}
            <span className={cn(late && "font-medium text-danger")}>
              {formatWorkDay(job.deadline, ctx.timeZone)}
            </span>
          </span>
          {late ? <LateBadge label={`${job.lateTaskCount} trễ`} /> : null}
          {job.createdBy ? (
            <span className="min-w-0 truncate">Tạo bởi {job.createdBy.displayName}</span>
          ) : null}
        </span>
        {person ? (
          <span className="flex flex-col gap-1.5 rounded-lg bg-brand-soft px-2.5 py-2 text-xs">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="font-semibold text-brand-text">
                Phần của {shortName(person.displayName)}
              </span>
              <span className="text-foreground-muted">
                {" · "}
                {share.processes.join(", ") || "—"} · {formatInteger(share.qtyAssigned)} tấm
              </span>
              {/* PD-070: the person's official-shift points in this job. */}
              {job.pointsOfficial ? (
                <>
                  <span className="text-foreground-muted"> · </span>
                  <PointsText cell={jobPointsCell(job.pointsOfficial)} />
                </>
              ) : null}
            </span>
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
          </span>
        ) : (
          <>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              {job.people.workers.length > 0 ? (
                <JobPeopleStack people={job.people} showCount className="relative z-[1] -my-1" />
              ) : null}
              <span className="text-foreground-muted">
                Tổng tấm{" "}
                <b className="font-semibold text-foreground tabular-nums">
                  {formatInteger(job.totalImages)}
                </b>
              </span>
              {/* PD-070: official-shift points of the job. */}
              <PointsText cell={jobPointsCell(job.pointsOfficial)} />
            </span>
            {/* PD-058: the totals count known numbers only. */}
            <MissingQtyNote count={job.tasksWithoutQty} className="-mt-1 text-xs" />
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
            {/* PD-048 "Tổng tấm" per process. */}
            <ProcessTotalChips totals={job.processTotals} max={3} />
          </>
        )}
        <CustomFieldChips fields={ctx.fields} values={job.customValues} />
        {job.tagIds.length > 0 ? <TagChips tags={ctx.tags} tagIds={job.tagIds} max={4} /> : null}
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Thu gọn" : "Mở"} task của job ${job.code}`}
          onClick={() => ctx.toggleJob(job.id)}
          className="relative z-[1] -my-1.5 -ml-1.5 flex min-h-10 items-center gap-1 self-start rounded-md px-1.5 text-xs font-medium text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn("size-4 transition-transform duration-150", expanded && "rotate-90")}
          />
          {expanded ? "Ẩn task" : job.taskCount > 0 ? `Xem ${job.taskCount} task` : "Xem task"}
        </button>
      </article>
      {expanded && block.children.length > 0 ? (
        <ul
          aria-label={`Task của job ${job.code}`}
          className="ml-3 flex flex-col gap-1.5 border-l pl-3"
        >
          {block.children.map((row) => (
            <li key={row.key}>
              <ChildRow row={row} ctx={ctx} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const ChildRow = ({ row, ctx }: { row: ListRow; ctx: ListContext }): ReactNode => {
  switch (row.kind) {
    case "task":
      return <TaskCard row={row} ctx={ctx} />;
    case "tasks-loading":
      return <Skeleton className="h-16 rounded-lg" aria-label="Đang tải task" />;
    case "tasks-error":
      return (
        <p className="flex flex-wrap items-center gap-2 py-1 text-[13px] text-danger">
          Không tải được task của job.
          <Button variant="outline" size="sm" onClick={() => ctx.retryJob(row.jobId)}>
            <RotateCw />
            Thử lại
          </Button>
        </p>
      );
    case "tasks-empty":
      return (
        <p className="py-1 text-[13px] text-foreground-muted">
          Chưa có task
          {row.detail.capabilities.canSplit && !row.detail.archived
            ? ""
            : " — Leader của job sẽ chia task."}
        </p>
      );
    case "job-footer":
      return <AddTasksButton detail={row.detail} ctx={ctx} className="-ml-2" />;
    default:
      return null;
  }
};

const TaskCard = ({ row, ctx }: { row: Extract<ListRow, { kind: "task" }>; ctx: ListContext }) => {
  const { task, line, detail } = row;
  const sub = line !== null;
  const progress = taskProgress(task);
  const open = () => ctx.openTask(task, line);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${sub ? "Subtask" : "Task"} #${task.code} ${task.process.name}`}
      onClick={(event) => {
        // The status dropdown (and its portaled menu) handles its own clicks.
        if (!event.currentTarget.contains(event.target as Node)) return;
        open();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) open();
      }}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border bg-surface p-2.5 outline-none active:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring",
        sub && "ml-4 bg-[color-mix(in_oklch,var(--surface),var(--foreground)_2.5%)] py-2"
      )}
    >
      <div className="flex items-start gap-2">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[13px]">
          {sub ? (
            <CornerDownRight
              className="size-3.5 shrink-0 text-foreground-subtle"
              aria-hidden="true"
            />
          ) : null}
          <span className={cn("tabular-nums", sub ? "font-medium" : "font-semibold")}>
            #{task.code}
          </span>
          <ProcessChip process={task.process} />
          {task.kind !== "NORMAL" ? <KindBadge kind={task.kind} /> : null}
          {task.isLate ? <LateBadge /> : null}
        </span>
        <span
          className="flex max-w-[55%] shrink-0 justify-end"
          onClick={(event) => event.stopPropagation()}
        >
          <TaskRowStatus task={task} line={line} detail={detail} ctx={ctx} align="end" />
        </span>
      </div>
      {sub ? (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-muted">
          {task.qtyAssigned === null ? (
            <QtyValue value={null} />
          ) : (
            <span>
              <QtyValue value={task.qtyAssigned} className="font-medium text-foreground" /> tấm
            </span>
          )}
          <PointsText cell={taskPointsCell(task)} />
          {task.splitReason ? (
            <span className="min-w-0 truncate">Lý do: {task.splitReason}</span>
          ) : null}
        </span>
      ) : (
        <>
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-foreground-muted">
            <Person user={task.assignee} size="xs" className="max-w-[10rem]" />
            <ShiftChip shift={task.shift} />
            <span className="tabular-nums">
              {formatWorkDay(task.assignedAt, ctx.timeZone)} →{" "}
              <span className={cn(task.isLate && "font-medium text-danger")}>
                {formatWorkDay(task.deadline, ctx.timeZone)}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <QtyValue value={task.qtyAssigned} className="font-medium text-foreground" />
              {task.qtyAssigned !== null ? "tấm" : null}
            </span>
            {/* PD-070: official shift only (a Khoán task shows nothing — never money). */}
            <PointsText cell={taskPointsCell(task)} />
          </span>
          {task.qtyAssigned !== null && task.doneAt ? (
            <ProgressCell
              done={progress.done}
              checked={progress.checked}
              total={progress.total}
              label={progressLabel(progress)}
            />
          ) : null}
          {task.note ? (
            <p
              className="line-clamp-2 text-xs text-foreground-muted [overflow-wrap:anywhere]"
              title={task.note}
            >
              {task.note}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};
