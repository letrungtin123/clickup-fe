import { cn } from "cn";
import { ExternalLink, FolderOpen, GitBranch, MessageSquareWarning, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "@/components/shared/router-link";
import { toast } from "sonner";

import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductionTask } from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";

import { useProductionMe } from "../../hooks";
import {
  useCachedJob,
  useProductionTask,
  useSubtaskMutations,
  useTaskMutations
} from "../../jobs-hooks";
import { canSeeTask, formatDateTime } from "../../jobs-model";
import { useProductionPeople } from "../../people";
import { taskEditErrorMessage, taskEditRights } from "../../task-edit-model";
import { ConfirmDialog } from "../settings-kit";
import { KindBadge, LateBadge } from "./job-bits";
import { InlineEditScope } from "./inline-field";
import { QtyRequestBanner } from "./qty-request";
import { TaskExtraFields, TaskFacts, TaskNoteField, TaskProcessTitle } from "./task-fields";
import { TaskScoresSection } from "./task-scores";
import { TaskSubtasks } from "./task-subtasks";
import { ProductionTimeline } from "./timeline";
import { StatusSelect } from "./transition-controls";
import { useTaskMover } from "./use-task-mover";

/**
 * Production task detail (side sheet or /production/tasks/:id): the work-log facts (PD-035), the status as a move
 * dropdown, every field the viewer may change edited in place by clicking it (PD-044 / PD-047, no dialog; rights from
 * the job permission matrix — PD-036), the task's subtasks, an open quantity request, delete (only with the task's own
 * "delete" right: staff no longer delete the tasks the Leader split, PD-047) and the task timeline.
 */
export const TaskDetailView = ({
  taskId,
  variant,
  onOpenTask,
  onDeleted
}: {
  taskId: string;
  variant: "sheet" | "page";
  onOpenTask?: (taskId: string) => void;
  /** The line was deleted (leave the sheet / page). */
  onDeleted?: (jobId: string) => void;
}) => {
  const task = useProductionTask(taskId);

  if (task.isPending) {
    return (
      <div className="flex flex-col gap-4 p-5" aria-busy="true" aria-label="Đang tải task">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-2/3" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (task.isError) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorState
          error={task.error}
          onRetry={() => void task.refetch()}
          retrying={task.isFetching}
        />
      </div>
    );
  }
  return (
    // One field in edit mode at a time; a different task starts fresh.
    <InlineEditScope key={task.data.id}>
      <TaskDetailBody
        task={task.data}
        variant={variant}
        onOpenTask={onOpenTask}
        onDeleted={onDeleted}
      />
    </InlineEditScope>
  );
};

const TaskDetailBody = ({
  task,
  variant,
  onOpenTask,
  onDeleted
}: {
  task: ProductionTask;
  variant: "sheet" | "page";
  onOpenTask?: ((taskId: string) => void) | undefined;
  onDeleted?: ((jobId: string) => void) | undefined;
}) => {
  const me = useProductionMe();
  const myId = useSessionContext().user.id;
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const people = useProductionPeople([task.assignee, task.qc]);
  const mover = useTaskMover();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mutations = useTaskMutations();
  const subtaskMutations = useSubtaskMutations();
  const job = useCachedJob(task.jobId);
  // A subtask names its task ("Subtask của task #N").
  const parent = useProductionTask(task.isSubtask ? task.parentTaskId : null);
  // Tasks of an archived job are read-only (the API refuses changes too).
  const archived = task.jobArchived || (job?.archived ?? false);
  const rights = taskEditRights(task, { archived });
  const canDelete = !archived && task.capabilities.canDelete;
  const checking = task.process.isQc;
  const jobLeaderId = job?.leader?.id ?? null;
  const deleting = mutations.remove.isPending || subtaskMutations.remove.isPending;
  const noun = task.isSubtask ? "subtask" : "task";

  const removeTask = () => {
    const done = (result: { jobId: string; reversedEntries: number }) => {
      toast.success(
        result.reversedEntries > 0
          ? `Đã xoá ${noun} #${task.code} và trừ lại điểm đã ghi`
          : `Đã xoá ${noun} #${task.code}`
      );
      setConfirmDelete(false);
      // A deleted subtask leads back to its line (its images went back there).
      if (task.isSubtask && task.parentTaskId && onOpenTask) onOpenTask(task.parentTaskId);
      else onDeleted?.(result.jobId);
    };
    const failed = (failure: unknown) => toast.error(taskEditErrorMessage(failure));
    if (task.isSubtask && task.parentTaskId) {
      subtaskMutations.remove.mutate(
        { subtaskId: task.id, lineId: task.parentTaskId },
        { onSuccess: done, onError: failed }
      );
    } else {
      mutations.remove.mutate(task.id, { onSuccess: done, onError: failed });
    }
  };
  const mentionable = (personId: string) =>
    canSeeTask(personId, people.roles.get(personId), task, jobLeaderId);
  const openParent = () => {
    if (task.parentTaskId) onOpenTask?.(task.parentTaskId);
  };
  const parentLabel = `task #${parent.data?.code ?? "…"}`;

  return (
    <div className={cn("flex flex-col gap-5", variant === "sheet" ? "px-4 pt-1 pb-6 md:px-5" : "")}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
          <Link
            to={`/production/jobs/${task.jobId}`}
            className="inline-flex items-center gap-1 rounded font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10"
          >
            <FolderOpen className="size-3.5" aria-hidden="true" />
            {task.jobCode}
          </Link>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{task.project.code}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TaskProcessTitle task={task} rights={rights} />
          <KindBadge kind={task.kind} />
          {task.isLate ? <LateBadge /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* PD-044: the status chip is the move menu (the viewer's moves; none on an archived job or a subtask). */}
          <StatusSelect
            task={
              archived ? { ...task, capabilities: { ...task.capabilities, transitions: [] } } : task
            }
            busy={mover.isPending}
            onMove={(option) => mover.start(task, option)}
          />
          {task.qcFailCount > 0 ? (
            <span className="text-xs text-danger">QC yêu cầu sửa lại {task.qcFailCount} lần</span>
          ) : null}
        </div>
        {task.isSubtask && task.parentTaskId ? (
          <div className="flex flex-col gap-1 rounded-lg bg-muted/60 px-3 py-2 text-[13px]">
            <p className="flex flex-wrap items-center gap-x-1 text-foreground-muted">
              <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Subtask của</span>
              {onOpenTask ? (
                <button
                  type="button"
                  onClick={openParent}
                  className="rounded font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10"
                >
                  {parentLabel}
                </button>
              ) : (
                <Link
                  to={`/production/tasks/${task.parentTaskId}`}
                  className="rounded font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:inline-flex max-sm:min-h-10 max-sm:items-center"
                >
                  {parentLabel}
                </Link>
              )}
              <span>— trạng thái đi theo task gốc</span>
            </p>
            {task.splitReason ? (
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                <span className="font-medium">Lý do tách:</span> {task.splitReason}
              </p>
            ) : null}
          </div>
        ) : null}
        {archived ? (
          <p className="text-xs text-foreground-muted">Job đã lưu trữ — task chỉ xem được.</p>
        ) : null}
        {task.lastQcFail ? (
          // PLAN §7 "xem note QC": the latest send-back ("Cần sửa lại"), who and when (history keeps every one).
          <div
            className={cn(
              "flex gap-2 rounded-lg px-3 py-2 text-[13px]",
              task.checkedAt === null ? "bg-danger-soft" : "bg-muted/60"
            )}
          >
            <MessageSquareWarning
              className={cn(
                "mt-0.5 size-4 shrink-0",
                task.checkedAt === null ? "text-danger" : "text-foreground-muted"
              )}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  "text-xs font-medium",
                  task.checkedAt === null ? "text-danger" : "text-foreground-muted"
                )}
              >
                {task.checkedAt === null ? "QC yêu cầu sửa lại" : "Lần QC yêu cầu sửa lại gần nhất"}
                <span className="font-normal text-foreground-muted">
                  {" · "}
                  {task.lastQcFail.by?.displayName ?? "QC"},{" "}
                  {formatDateTime(task.lastQcFail.at, timeZone)}
                </span>
              </span>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                {task.lastQcFail.note ?? "Không ghi lý do."}
              </p>
            </div>
          </div>
        ) : null}
        {task.pendingQtyRequest ? (
          <QtyRequestBanner
            task={task}
            request={task.pendingQtyRequest}
            myId={myId}
            archived={archived}
            timeZone={timeZone}
          />
        ) : null}
      </header>

      <TaskFacts task={task} rights={rights} timeZone={timeZone} myId={myId} />

      <TaskNoteField task={task} rights={rights} />

      <TaskExtraFields task={task} rights={rights} timeZone={timeZone} />

      {!task.isSubtask && !checking ? (
        <TaskSubtasks task={task} archived={archived} timeZone={timeZone} onOpenTask={onOpenTask} />
      ) : null}

      <TaskScoresSection task={task} />

      {canDelete || variant === "sheet" ? (
        <div className="flex flex-wrap gap-2">
          {canDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              {task.isSubtask ? "Xoá subtask" : "Xoá task"}
            </Button>
          ) : null}
          {variant === "sheet" ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-foreground-muted max-sm:min-h-10"
              render={<Link to={`/production/tasks/${task.id}`} />}
              nativeButton={false}
            >
              <ExternalLink />
              Mở trang riêng
            </Button>
          ) : null}
        </div>
      ) : null}

      <ProductionTimeline
        entity="tasks"
        id={task.id}
        people={people}
        mentionable={mentionable}
        readOnly={archived}
        onOpenTask={onOpenTask}
        className="border-t pt-4"
      />

      {mover.dialog}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(next) => !next && !deleting && setConfirmDelete(false)}
        title={`Xoá ${noun} #${task.code}?`}
        description={
          task.isSubtask
            ? `${task.qtyAssigned} tấm của subtask trả về task gốc. Việc xoá được ghi vào lịch sử của task.`
            : task.doneAt
              ? "Task bị ẩn khỏi mọi danh sách nhưng vẫn giữ trong lịch sử. Điểm / tiền đã ghi cho task này được trừ lại bằng dòng điều chỉnh (sổ điểm không bị sửa)."
              : "Task bị ẩn khỏi mọi danh sách nhưng vẫn giữ trong lịch sử của job."
        }
        confirmLabel={task.isSubtask ? "Xoá subtask" : "Xoá task"}
        destructive
        pending={deleting}
        onConfirm={removeTask}
      />
    </div>
  );
};
