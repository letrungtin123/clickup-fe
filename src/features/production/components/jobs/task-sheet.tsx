import { useSearchParams } from "react-router";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { TASK_PARAM, useOpenTask } from "../../task-link";
import { touchTargets } from "../../ui";
import { TaskDetailView } from "./task-detail";

/**
 * `?ptask=<id>` on any production page opens the task in a side sheet (full screen on phones), so
 * jobs, my tasks and the QC queue keep their context. /production/tasks/:id is the shareable page.
 */
export const ProductionTaskSheet = () => {
  const [params, setParams] = useSearchParams();
  const breakpoint = useBreakpoint();
  const taskId = params.get(TASK_PARAM);
  const close = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(TASK_PARAM);
        return next;
      },
      { replace: true }
    );
  const open = useOpenTask();

  return (
    <Sheet open={Boolean(taskId)} onOpenChange={(next) => !next && close()}>
      <SheetContent
        side={breakpoint === "mobile" ? "bottom" : "right"}
        className={
          breakpoint === "mobile"
            ? `data-[side=bottom]:h-[94dvh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] ${touchTargets}`
            : "w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-xl"
        }
      >
        <SheetTitle className="sr-only">Chi tiết task</SheetTitle>
        <SheetDescription className="sr-only">
          Thông tin, chuyển trạng thái và bình luận của task.
        </SheetDescription>
        <div className="pt-12">
          {taskId ? <TaskDetailView taskId={taskId} variant="sheet" onOpenTask={open} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};
