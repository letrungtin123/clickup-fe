import { ArrowLeft, ChevronRight, Hash, Link2, MoreHorizontal, Trash2, X } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "react-router";

import { ColorDot } from "@/components/shared/color-dot";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TaskDetail } from "@/contracts/work";
import { useRealtimeEvent, useRealtimeRoom } from "@/lib/realtime/hooks";
import { scheduleInvalidate } from "@/lib/realtime/socket";
import { qk } from "@/lib/query-keys";

import { useDeleteTask, useTask } from "../hooks";
import { copyText, taskUrl } from "../use-task-abilities";
import { TASK_PANEL_PARAM, useTaskPanel } from "../use-task-panel";

export type DetailPanelMode = "docked" | "overlay" | "fullscreen";

type TaskDetailPanelProps = { taskId: string; mode: DetailPanelMode; onClose: () => void };

const TaskDetailBody = lazy(() => import("./detail/task-detail-body"));

/**
 * Task detail content for the right-hand panel (the container in components/layout/detail-panel.tsx
 * owns placement, motion, focus and Escape). The header is light; the body (editor, timeline,
 * uploads) is code-split so the app shell stays small.
 */
export const TaskDetailPanel = ({ taskId, mode, onClose }: TaskDetailPanelProps) => {
  const task = useTask(taskId);
  useRealtimeRoom({ type: "task", id: taskId });
  // The task room also reports field changes (task:timeline accompanies every change), which keeps
  // the panel fresh even when its project room is not joined (e.g. opened from My tasks).
  useRealtimeEvent("task:timeline", (event) => {
    if (event.taskId === taskId) scheduleInvalidate(qk.task(taskId), true);
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader task={task.data} mode={mode} onClose={onClose} />
      <div className="relative min-h-0 flex-1">
        {task.isError ? (
          <div className="h-full overflow-y-auto">
            <ErrorState error={task.error} onRetry={() => void task.refetch()} retrying={task.isFetching} />
          </div>
        ) : task.data ? (
          <Suspense fallback={<DetailBodySkeleton />}>
            <TaskDetailBody task={task.data} />
          </Suspense>
        ) : (
          <DetailBodySkeleton />
        )}
      </div>
    </div>
  );
};

const PanelHeader = ({
  task,
  mode,
  onClose
}: {
  task: TaskDetail | undefined;
  mode: DetailPanelMode;
  onClose: () => void;
}) => {
  const { openTask } = useTaskPanel();
  const remove = useDeleteTask();
  const listHref = task ? `/p/${task.project.id}/l/${task.list.id}?${TASK_PANEL_PARAM}=${task.id}` : "#";

  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 border-b px-3">
      {mode === "fullscreen" ? (
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Quay lại">
          <ArrowLeft />
        </Button>
      ) : null}
      <nav aria-label="Vị trí công việc" className="flex min-w-0 flex-1 items-center gap-1 text-xs text-foreground-muted">
        {task ? (
          <>
            <ColorDot color={task.project.color} />
            <Link
              to={listHref}
              className="max-w-[9rem] truncate rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              title={`${task.project.name} / ${task.list.name}`}
            >
              {task.project.name}
            </Link>
            <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden="true" />
            <Link
              to={listHref}
              className="max-w-[8rem] truncate rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {task.list.name}
            </Link>
            {task.ancestors.map((ancestor) => (
              <span key={ancestor.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => openTask(ancestor.id, { replace: true })}
                  title={`${ancestor.key} ${ancestor.title}`}
                  className="max-w-[7rem] truncate rounded font-mono outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ancestor.key}
                </button>
              </span>
            ))}
            <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden="true" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => copyText(task.key, `Đã sao chép ${task.key}`)}
                    className="shrink-0 rounded px-1 font-mono font-medium text-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
                  />
                }
              >
                {task.key}
              </TooltipTrigger>
              <TooltipContent>Sao chép mã</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <Skeleton className="h-3 w-48" />
        )}
      </nav>
      {task ? (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => copyText(taskUrl(task), "Đã sao chép liên kết công việc")}
                  aria-label="Sao chép liên kết"
                />
              }
            >
              <Link2 />
            </TooltipTrigger>
            <TooltipContent>Sao chép liên kết</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Thao tác khác" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => copyText(task.key, `Đã sao chép ${task.key}`)}>
                <Hash />
                Sao chép mã {task.key}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => copyText(taskUrl(task), "Đã sao chép liên kết công việc")}>
                <Link2 />
                Sao chép liên kết
              </DropdownMenuItem>
              {task.capabilities.canDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      remove.mutate(task);
                      onClose();
                    }}
                  >
                    <Trash2 />
                    Chuyển vào thùng rác
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
      {mode === "fullscreen" ? null : (
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng chi tiết" />}>
            <X />
          </TooltipTrigger>
          <TooltipContent>
            Đóng <span className="opacity-70">Esc</span>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

const DetailBodySkeleton = () => (
  <div className="flex flex-col gap-6 px-5 py-5" aria-hidden="true">
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-4/5" />
      <Skeleton className="h-4 w-1/3" />
    </div>
    <div className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3">
      {[40, 56, 32, 48].map((width, index) => (
        <div key={index} className="contents">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
    <div className="flex flex-col gap-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-3 w-3/5" />
    </div>
    <div className="flex flex-col gap-4 border-t pt-5">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3" style={{ width: `${70 - index * 15}%` }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);
