import { ArrowLeft, Link2, X } from "lucide-react";
import { toast } from "sonner";

import { ColorDot } from "@/components/shared/color-dot";
import { ErrorState } from "@/components/shared/states";
import { PriorityFlag, StatusPill } from "@/components/shared/task-meta";
import { AvatarGroup } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRealtimeRoom } from "@/lib/realtime/hooks";

import { useTask } from "../hooks";

export type DetailPanelMode = "docked" | "overlay" | "fullscreen";

type TaskDetailPanelProps = { taskId: string; mode: DetailPanelMode; onClose: () => void };

/**
 * Task detail content for the right-hand panel. Foundation version: header + skeleton body.
 * The task-detail work replaces the body (description editor, subtasks, attachments, timeline) and
 * keeps this component's name/props — the panel container (components/layout/detail-panel.tsx) owns
 * placement, motion, focus and Escape handling.
 */
export const TaskDetailPanel = ({ taskId, mode, onClose }: TaskDetailPanelProps) => {
  const task = useTask(taskId);
  useRealtimeRoom({ type: "task", id: taskId });

  const copyLink = () => {
    void navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => toast.success("Đã sao chép liên kết công việc"))
      .catch(() => toast.error("Không sao chép được liên kết"));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        {mode === "fullscreen" ? (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Quay lại">
            <ArrowLeft />
          </Button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-foreground-muted">
          {task.data ? (
            <>
              <ColorDot color={task.data.project.color} />
              <span className="truncate">{task.data.project.name}</span>
              <span aria-hidden="true">/</span>
              <span className="truncate">{task.data.list.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{task.data.key}</span>
            </>
          ) : (
            <Skeleton className="h-3 w-40" />
          )}
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={copyLink}
                aria-label="Sao chép liên kết"
              />
            }
          >
            <Link2 />
          </TooltipTrigger>
          <TooltipContent>Sao chép liên kết</TooltipContent>
        </Tooltip>
        {mode === "fullscreen" ? null : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClose}
                  aria-label="Đóng chi tiết"
                />
              }
            >
              <X />
            </TooltipTrigger>
            <TooltipContent>
              Đóng <span className="opacity-70">Esc</span>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {task.isError ? (
          <ErrorState
            error={task.error}
            onRetry={() => void task.refetch()}
            retrying={task.isFetching}
          />
        ) : (
          <div className="flex flex-col gap-6 px-5 py-5">
            {task.data ? (
              <div className="flex flex-col gap-3">
                <h2
                  id="task-detail-title"
                  className="text-lg leading-snug font-semibold tracking-[-0.01em]"
                >
                  {task.data.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill status={task.data.status} />
                  <PriorityFlag priority={task.data.priority} showLabel />
                  {task.data.assignees.length > 0 ? (
                    <AvatarGroup users={task.data.assignees} max={4} />
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-6 w-4/5" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="size-6 rounded-full" />
                </div>
              </div>
            )}
            <DetailBodySkeleton />
          </div>
        )}
      </div>
    </div>
  );
};

const DetailBodySkeleton = () => (
  <div className="flex flex-col gap-6" aria-hidden="true">
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
