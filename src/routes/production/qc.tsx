import { cn } from "cn";
import { motion } from "motion/react";
import { BadgeCheck, CircleX, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireProductionRole } from "@/features/production/components/production-gate";
import { Person } from "@/features/production/components/jobs/job-bits";
import { TaskCard } from "@/features/production/components/jobs/task-card";
import { TransitionButtons } from "@/features/production/components/jobs/transition-controls";
import { useTaskMover } from "@/features/production/components/jobs/use-task-mover";
import { useProductionMe } from "@/features/production/hooks";
import { useQcQueue } from "@/features/production/jobs-hooks";
import { formatDateTime, qcActions } from "@/features/production/jobs-model";
import { useOpenTask } from "@/features/production/task-link";
import { touchTargets } from "@/features/production/ui";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * /production/qc — tasks waiting for my QC, oldest Done first (PLAN §7). "Đạt" moves to Checked,
 * "Không đạt" asks for the reason and returns the task to its worker; both come from the task's
 * own capabilities.
 */
export const ProductionQcRoute = () => (
  <RequireProductionRole roles={["QC"]}>
    <QcQueue />
  </RequireProductionRole>
);

const QcQueue = () => {
  const me = useProductionMe();
  const queue = useQcQueue();
  const mover = useTaskMover();
  const openTask = useOpenTask();
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const items = queue.data?.items ?? [];

  return (
    <div className={cn("flex h-full min-h-0 flex-col", touchTargets)}>
      <PageHeader
        eyebrow="Sản xuất"
        title="Hàng chờ QC"
        description="Task đã Done đang chờ bạn kiểm tra, cũ nhất trước."
        actions={
          queue.data ? (
            <span className="text-sm text-foreground-muted tabular-nums">{items.length} task</span>
          ) : null
        }
      />
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
        ) : items.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Không có task chờ QC"
            description="Khi người làm bấm Done một task bạn được gán QC, task sẽ hiện ở đây."
          />
        ) : (
          <motion.ul
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease }}
            className="mx-auto flex max-w-3xl flex-col gap-3"
          >
            {items.map((task) => {
              const { pass, fail } = qcActions(task, mover.lookup.statuses);
              const busy = mover.pendingTaskId === task.id;
              return (
                <li key={task.id}>
                  <TaskCard
                    task={task}
                    timeZone={timeZone}
                    onOpen={openTask}
                    meta={
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
                        <Person user={task.assignee} size="xs" />
                        <span>Done lúc {formatDateTime(task.doneAt, timeZone)}</span>
                        {task.note ? (
                          <span className="max-w-full truncate">“{task.note}”</span>
                        ) : null}
                      </div>
                    }
                    footer={
                      <div
                        className="flex flex-wrap items-center gap-2 pt-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {pass ? (
                          <Button size="sm" disabled={busy} onClick={() => mover.start(task, pass)}>
                            <BadgeCheck />
                            Đạt
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
                            Không đạt
                          </Button>
                        ) : null}
                        <TransitionButtons
                          task={{
                            ...task,
                            capabilities: {
                              ...task.capabilities,
                              transitions: task.capabilities.transitions.filter(
                                (option) =>
                                  option.toStatusId !== pass?.toStatusId &&
                                  option.toStatusId !== fail?.toStatusId
                              )
                            }
                          }}
                          busy={busy}
                          max={0}
                          onMove={(option) => mover.start(task, option)}
                          className="ml-auto"
                        />
                      </div>
                    }
                  />
                </li>
              );
            })}
          </motion.ul>
        )}
      </div>
      {mover.dialog}
    </div>
  );
};
