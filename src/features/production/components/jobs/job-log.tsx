import { cn } from "cn";
import { ChevronsDown, History } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ProductionStatus } from "@/contracts/production-catalog";
import type { JobDetail, TaskLog } from "@/contracts/production-jobs";

import { useJobLog, useLogNames } from "../../job-log-hooks";
import {
  describeJobEdit,
  describeTaskLog,
  formatDateTime,
  jobLines,
  jobLogRows,
  logStatusChange,
  logTaskLabel,
  logTimeLabel,
  logTone,
  statusLogDetails,
  subtaskLineIds,
  type LogNames,
  type LogStatusRef,
  type Segment
} from "../../jobs-model";
import { StatusChip } from "./job-bits";
import { logIcons, logToneBorder, logToneBubble } from "./log-icons";
import { SegmentText } from "./timeline";
import { useStatusLookup } from "./use-task-mover";

/** Rows shown at first; "Xem thêm" adds a page's worth. */
export const JOB_LOG_FIRST = 10;
const JOB_LOG_STEP = 20;
const ALL = "all";

/**
 * "Nhật ký" of the job page (PD-044): who changed which line from → to, subtasks created and why, quantity requests and
 * their decisions, assignments and edits — history only, newest first, the first rows then "Xem thêm". Filterable by
 * line ("Tất cả task" or one top-level line; its subtasks' rows are on the line). A subtask's own status / assignment
 * rows are hidden: they repeat the line's. Stays live: its query sits under the job timeline's key (job-log-hooks.ts).
 */
export const JobLog = ({
  job,
  nameOf,
  timeZone,
  onOpenTask,
  className
}: {
  job: JobDetail;
  nameOf: (id: string) => string | undefined;
  timeZone: string;
  onOpenTask: (taskId: string) => void;
  className?: string | undefined;
}) => {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [shown, setShown] = useState(JOB_LOG_FIRST);
  const log = useJobLog(job.id, taskId);
  const names = useLogNames(nameOf, timeZone);
  const lookup = useStatusLookup();
  const lineOf = useMemo(() => subtaskLineIds(job.tasks), [job.tasks]);
  const rows = useMemo(
    () => jobLogRows(log.data?.pages, new Set(lineOf.keys())),
    [log.data, lineOf]
  );
  const lines = useMemo(
    () =>
      jobLines(job.tasks)
        .map(({ line }) => line)
        .sort((a, b) => a.number - b.number),
    [job.tasks]
  );
  const lineLabel = (id: string | null) => {
    if (id === null) return "Tất cả task";
    const line = lines.find((item) => item.id === id);
    return line
      ? `#${line.code} · ${line.assignee.displayName} · ${line.process.name}`
      : "Task đã xoá";
  };
  const visible = rows.slice(0, shown);
  const hasMore = rows.length > shown || log.hasNextPage;

  const showMore = () => {
    const next = shown + JOB_LOG_STEP;
    setShown(next);
    if (log.hasNextPage && !log.isFetchingNextPage && rows.length < next) {
      void log.fetchNextPage();
    }
  };

  return (
    <section aria-labelledby="job-log" className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <h2 id="job-log" className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-3.5 text-foreground-muted" aria-hidden="true" />
          Nhật ký
        </h2>
        {log.isFetching && !log.isPending ? (
          <Spinner className="size-3 text-foreground-subtle" />
        ) : null}
        <Select
          value={taskId ?? ALL}
          onValueChange={(next: string | null) => {
            setTaskId(!next || next === ALL ? null : next);
            setShown(JOB_LOG_FIRST);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Lọc nhật ký theo task"
            className="min-w-0 max-sm:w-full sm:ml-auto sm:max-w-80"
          >
            <SelectValue>{lineLabel(taskId)}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={ALL}>Tất cả task</SelectItem>
            {lines.map((line) => (
              <SelectItem key={line.id} value={line.id}>
                {lineLabel(line.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border bg-surface px-3 shadow-xs">
        {log.isPending ? (
          <div className="flex flex-col gap-4 py-3" aria-busy="true" aria-label="Đang tải nhật ký">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="size-6 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3" style={{ width: `${80 - index * 15}%` }} />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : log.isError ? (
          <div role="alert" className="flex items-center gap-2 py-3 text-[13px] text-foreground-muted">
            Không tải được nhật ký.
            <Button variant="ghost" size="xs" onClick={() => void log.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-4 text-[13px] text-foreground-subtle">
            {taskId ? "Task này chưa có hoạt động." : "Chưa có hoạt động."}
          </p>
        ) : (
          <JobLogList
            logs={visible}
            names={names}
            statuses={lookup.byId}
            lineOf={lineOf}
            onOpenTask={onOpenTask}
          />
        )}
        {hasMore && !log.isPending && !log.isError ? (
          <div className="border-t py-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="text-foreground-muted"
              onClick={showMore}
              disabled={log.isFetchingNextPage}
            >
              {log.isFetchingNextPage ? <Spinner className="size-3" /> : <ChevronsDown />}
              Xem thêm
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
};

/**
 * The rows of the log (presentational; JobLog loads them). `lineOf` maps a subtask to its line, so "#1216a" of a
 * subtask row opens the line; `statuses` colours the from → to chips of status rows.
 */
export const JobLogList = ({
  logs,
  names,
  statuses,
  lineOf,
  onOpenTask,
  now
}: {
  logs: readonly TaskLog[];
  names: LogNames;
  statuses: ReadonlyMap<string, Pick<ProductionStatus, "color">>;
  lineOf: ReadonlyMap<string, string>;
  onOpenTask: (taskId: string) => void;
  /** Fixed clock for tests. */
  now?: Date;
}) => (
  <ol className="flex flex-col divide-y divide-border/70">
    {logs.map((log) => (
      <JobLogRow
        key={log.id}
        log={log}
        names={names}
        statuses={statuses}
        lineOf={lineOf}
        onOpenTask={onOpenTask}
        now={now}
      />
    ))}
  </ol>
);

const JobLogRow = ({
  log,
  names,
  statuses,
  lineOf,
  onOpenTask,
  now
}: {
  log: TaskLog;
  names: LogNames;
  statuses: ReadonlyMap<string, Pick<ProductionStatus, "color">>;
  lineOf: ReadonlyMap<string, string>;
  onOpenTask: (taskId: string) => void;
  now?: Date | undefined;
}) => {
  const Icon = logIcons[log.action];
  const tone = logTone(log);
  const taskLabel = logTaskLabel(log);
  // A deleted line cannot be opened any more; a subtask opens its line.
  const openId =
    log.taskId && log.action !== "DELETE" ? (lineOf.get(log.taskId) ?? log.taskId) : null;
  const taskButton = (key?: number) =>
    taskLabel !== null && openId ? (
      <button
        key={key}
        type="button"
        onClick={() => onOpenTask(openId)}
        // Inline in a sentence: exempt from the phone min-height of `touchTargets`, which would otherwise push the
        // following line 40px down.
        className="rounded font-semibold text-brand-text underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-0!"
      >
        {taskLabel}
      </button>
    ) : (
      <span key={key} className="font-medium text-foreground">
        {taskLabel ?? ""}
      </span>
    );
  const jobEdit = log.action === "JOB" ? describeJobEdit(log, names) : null;
  const status = logStatusChange(log);
  let sentence: ReactNode;
  if (status) {
    const qcFail = log.toValue?.qcFail === true;
    sentence = (
      <>
        {qcFail ? "yêu cầu sửa lại " : "chuyển "}
        {taskButton()}{" "}
        <LogStatusChip status={status.from} statuses={statuses} />
        <span aria-hidden="true" className="mx-1 text-foreground-subtle">
          →
        </span>
        <span className="sr-only"> sang </span>
        <LogStatusChip status={status.to} statuses={statuses} />
        {statusLogDetails(log.toValue ?? {}, { withQcFail: false, from: log.fromValue }).map(
          (segment, index) => (
            <SegmentText key={index} segment={segment} />
          )
        )}
      </>
    );
  } else if (jobEdit && jobEdit.changes.length > 1) {
    sentence = (
      <>
        {jobEdit.verb}:
        <span className="mt-0.5 flex flex-col gap-0.5 text-foreground">
          {jobEdit.changes.map((change) => (
            <span key={change} className="flex gap-1.5">
              <span aria-hidden="true" className="text-foreground-subtle">
                ·
              </span>
              <span className="min-w-0">{change}</span>
            </span>
          ))}
        </span>
      </>
    );
  } else {
    sentence = describeTaskLog(log, names).map((segment: Segment, index) =>
      taskLabel !== null && segment.text === taskLabel ? (
        taskButton(index)
      ) : (
        <SegmentText key={index} segment={segment} />
      )
    );
  }
  return (
    <li className="flex gap-3 py-2.5">
      {log.user ? (
        <UserAvatar user={log.user} size="sm" className="mt-0.5" />
      ) : (
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-muted"
        >
          <Icon className="size-3.5" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] leading-relaxed text-foreground-muted [overflow-wrap:anywhere]">
          <span className="font-medium text-foreground">{log.user?.displayName ?? "Hệ thống"}</span>{" "}
          {sentence}
        </p>
        {log.note ? (
          <p
            className={cn(
              "rounded-lg border-l-2 bg-muted/60 px-2.5 py-1.5 text-[13px] whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]",
              logToneBorder[tone ?? "none"]
            )}
          >
            “{log.note}”
          </p>
        ) : null}
        <p className="flex items-center gap-1.5 text-[11px] text-foreground-subtle">
          <span
            aria-hidden="true"
            className={cn("flex size-4 items-center justify-center rounded-full", logToneBubble[tone ?? "none"])}
          >
            <Icon className="size-3" />
          </span>
          <time dateTime={log.createdAt} title={formatDateTime(log.createdAt, names.timeZone, true)}>
            {logTimeLabel(log.createdAt, names.timeZone, now)}
          </time>
        </p>
      </div>
    </li>
  );
};

/** A status of a STATUS row as its chip, coloured from the workflow (grey when the status is gone). */
const LogStatusChip = ({
  status,
  statuses
}: {
  status: LogStatusRef;
  statuses: ReadonlyMap<string, Pick<ProductionStatus, "color">>;
}) => (
  <StatusChip
    status={{
      name: status.name,
      color: (status.id ? statuses.get(status.id)?.color : undefined) ?? "gray"
    }}
    size="sm"
    className="align-middle"
  />
);
