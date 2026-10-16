import { cn } from "cn";
import { motion } from "motion/react";
import { BadgeCheck, CircleX, ScanSearch, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductionTask } from "@/contracts/production-jobs";
import { RequireProductionFeature } from "@/features/production/components/production-gate";
import { Person } from "@/features/production/components/jobs/job-bits";
import { TaskCard } from "@/features/production/components/jobs/task-card";
import { useTaskMover } from "@/features/production/components/jobs/use-task-mover";
import { WorkflowUnavailable } from "@/features/production/components/jobs/workflow-unavailable";
import { ListFiltersControl } from "@/features/production/components/list-filters";
import { todayIn } from "@/features/production/format";
import { useProductionMe } from "@/features/production/hooks";
import { useQcQueue } from "@/features/production/jobs-hooks";
import { formatDateTime, qcActions } from "@/features/production/jobs-model";
import { emptyListFilters } from "@/features/production/list-filters";
import { useUrlListFilters } from "@/features/production/list-filters-hooks";
import { useOpenTask } from "@/features/production/task-link";
import { touchTargets } from "@/features/production/ui";
import { toneClass } from "@/lib/colors";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * /production/qc — my QC work (PLAN §7, PD-044), oldest Done first, in two groups: "Đang check" (lines I started
 * checking) and "Chờ QC" (Done lines waiting for me). Each card offers its quick moves — "Đang check" (start), "Đã
 * check" (pass) and "Cần sửa lại" (asks the reason, sends the line back to its worker) — and its status dropdown for
 * the rest; all come from the task's own capabilities. Without the workflow (request failed) the moves cannot be told
 * apart, so the cards stay readable, the moves are hidden and the page explains with a retry (BUG-PR-18). Opens for
 * whoever holds the "Hàng chờ QC" feature (PD-065).
 */
export const ProductionQcRoute = () => (
  <RequireProductionFeature feature="qc_queue">
    <QcQueue />
  </RequireProductionFeature>
);

const QcQueue = () => {
  const me = useProductionMe();
  // TASK tags / custom fields, kept in the URL (?tag=…&cf.<key>=…).
  const listFilters = useUrlListFilters("TASK");
  const filtering = listFilters.count > 0;
  const queue = useQcQueue(listFilters.ready, listFilters.query);
  const mover = useTaskMover();
  const openTask = useOpenTask();
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  // Subtasks are checked with their line (PD-044), never cards of their own.
  const items = (queue.data?.items ?? []).filter((task) => !task.isSubtask);
  const checking = items.filter((task) => task.status.code === "QC_CHECKING");
  const waiting = items.filter((task) => task.status.code !== "QC_CHECKING");
  const filterControl = (
    <ListFiltersControl
      fields={listFilters.fields}
      tags={listFilters.tags}
      filters={listFilters.filters}
      onChange={listFilters.setFilters}
      today={todayIn(timeZone)}
      title="Lọc hàng chờ theo trường và tag"
    />
  );
  const statusName = (code: string, fallback: string) =>
    mover.lookup.statuses.find((status) => status.code === code)?.name ?? fallback;

  const card = (task: ProductionTask) => {
    const { pass, fail, start } = qcActions(task, mover.lookup.statuses);
    const busy = mover.pendingTaskId === task.id;
    const name = (statusId: string, fallback: string) =>
      mover.lookup.byId.get(statusId)?.name ?? fallback;
    return (
      <li key={task.id}>
        <TaskCard
          task={task}
          timeZone={timeZone}
          fields={listFilters.fields}
          onOpen={openTask}
          showStatus
          onMove={mover.lookup.isError ? undefined : (moved, option) => mover.start(moved, option)}
          busy={busy}
          meta={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
              <Person user={task.assignee} size="xs" />
              <span>Xong lúc {formatDateTime(task.doneAt, timeZone)}</span>
              {task.note ? <span className="max-w-full truncate">“{task.note}”</span> : null}
            </div>
          }
          footer={
            mover.lookup.isError || (!pass && !fail && !start) ? undefined : (
              <div
                className="flex flex-wrap items-center gap-2 pt-1"
                onClick={(event) => event.stopPropagation()}
              >
                {start ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => mover.start(task, start)}
                  >
                    <ScanSearch />
                    {name(start.toStatusId, "Đang check")}
                  </Button>
                ) : null}
                {pass ? (
                  <Button size="sm" disabled={busy} onClick={() => mover.start(task, pass)}>
                    <BadgeCheck />
                    {name(pass.toStatusId, "Đã check")}
                  </Button>
                ) : null}
                {fail ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => mover.start(task, fail)}
                  >
                    <CircleX />
                    {name(fail.toStatusId, "Cần sửa lại")}
                  </Button>
                ) : null}
              </div>
            )
          }
        />
      </li>
    );
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", touchTargets)}>
      <PageHeader
        eyebrow="Photo Retouch"
        title="Hàng chờ QC"
        description="Task đã xong chờ bạn kiểm tra và task bạn đang check, cũ nhất trước."
        actions={
          queue.data ? (
            <span className="text-sm text-foreground-muted tabular-nums" aria-live="polite">
              {filtering ? "Phù hợp: " : ""}
              {waiting.length} chờ · {checking.length} đang check
            </span>
          ) : null
        }
      >
        {filterControl}
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {queue.isPending || mover.lookup.isPending ? (
          <div
            className="mx-auto flex max-w-3xl flex-col gap-3"
            aria-busy="true"
            aria-label="Đang tải hàng chờ"
          >
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : queue.isError ? (
          <ErrorState
            error={queue.error}
            onRetry={() => void queue.refetch()}
            retrying={queue.isFetching}
          />
        ) : items.length === 0 && filtering ? (
          <EmptyState
            icon={ShieldCheck}
            title="Không có task phù hợp bộ lọc"
            description="Thử bỏ bớt tag hoặc trường đang lọc."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => listFilters.setFilters(emptyListFilters)}
              >
                Xóa bộ lọc
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Không có task chờ QC"
            description="Khi người làm báo xong một task bạn được gán QC, task sẽ hiện ở đây."
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease }}
            className="mx-auto flex max-w-3xl flex-col gap-5"
          >
            {mover.lookup.isError ? (
              <WorkflowUnavailable onRetry={mover.lookup.retry} retrying={mover.lookup.retrying}>
                Không tải được luồng trạng thái nên chưa hiện nút Đã check / Cần sửa lại. Thử lại,
                hoặc mở task để xem chi tiết.
              </WorkflowUnavailable>
            ) : null}
            {checking.length > 0 ? (
              <QueueGroup
                id="qc-checking"
                title={statusName("QC_CHECKING", "Đang check")}
                color={
                  mover.lookup.statuses.find((status) => status.code === "QC_CHECKING")?.color ??
                  "purple"
                }
                count={checking.length}
              >
                {checking.map(card)}
              </QueueGroup>
            ) : null}
            {waiting.length > 0 ? (
              <QueueGroup
                id="qc-waiting"
                title={statusName("WAITING_QC", "Chờ QC")}
                color={
                  mover.lookup.statuses.find((status) => status.code === "WAITING_QC")?.color ??
                  "amber"
                }
                count={waiting.length}
              >
                {waiting.map(card)}
              </QueueGroup>
            ) : null}
          </motion.div>
        )}
      </div>
      {mover.dialog}
    </div>
  );
};

/** One group of the queue: its status as a coloured heading with the count, then the cards. */
const QueueGroup = ({
  id,
  title,
  color,
  count,
  children
}: {
  id: string;
  title: string;
  color: string;
  count: number;
  children: ReactNode;
}) => (
  <section aria-labelledby={id} className="flex flex-col gap-2.5">
    <h2
      id={id}
      className={cn(toneClass(color), "flex items-center gap-2 text-[13px] font-semibold")}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-(--tone)" />
      {title}
      <span className="text-xs font-normal text-foreground-muted tabular-nums">{count}</span>
    </h2>
    <ul className="flex flex-col gap-3">{children}</ul>
  </section>
);
