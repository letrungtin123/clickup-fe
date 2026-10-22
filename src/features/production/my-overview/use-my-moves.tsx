import { useState } from "react";
import { toast } from "sonner";

import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";

import { useTaskMover } from "../components/jobs/use-task-mover";
import { useTransitionTask } from "../jobs-hooks";
import { doneQtyTargets, taskEditErrorMessage } from "../task-edit-model";
import { myOverviewCopy as copy } from "./copy";
import { doneOptionOf, type DonePath } from "./model";

/**
 * PD-081 quick moves of "Tổng quan của tôi", through the existing transition API and its rules (PD-014: only the task's own
 * `capabilities.transitions`; PD-058 quantities; PD-044 subtasks). Each write stores the answer everywhere the task is
 * cached and refreshes this page (its key sits under the job lists'). Anything the inline fields cannot ask — a subtask
 * without a quantity, a move that needs a note — falls back to the existing dialogs of `useTaskMover`.
 */
export const useMyMoves = () => {
  const mover = useTaskMover();
  const transition = useTransitionTask();
  const statuses = mover.lookup.statuses;
  const [busyId, setBusyId] = useState<string | null>(null);

  const guarded = async (taskId: string, run: () => Promise<boolean>) => {
    setBusyId(taskId);
    try {
      return await run();
    } catch (error) {
      toast.error(taskEditErrorMessage(error));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  /** A move that needs nothing typed (Bắt đầu, Bắt đầu check, Đạt); a note or a missing quantity opens the dialogs. */
  const simple = (task: ProductionTask, option: TaskTransitionOption, success: string) => {
    if (option.requiresNote || doneQtyTargets(task, option, statuses).length > 0) {
      mover.start(task, option);
      return Promise.resolve(false);
    }
    return guarded(task.id, async () => {
      await transition.mutateAsync({ task, input: { toStatusId: option.toStatusId } });
      toast.success(success);
      return true;
    });
  };

  /**
   * "Xác nhận Done" with the typed number of images: straight into Done, or — a line sent back — through Đang làm first.
   * Returns true when done (the inline field closes), false when the dialogs took over or it failed (it stays open).
   */
  const done = (task: ProductionTask, path: DonePath, qtyDone: number) =>
    guarded(task.id, async () => {
      let current = task;
      let option = path.option;
      if (path.via) {
        if (path.via.requiresNote) {
          mover.start(task, path.via);
          return false;
        }
        current = await transition.mutateAsync({
          task,
          input: { toStatusId: path.via.toStatusId }
        });
        option = doneOptionOf(current, statuses);
      }
      if (!option) {
        toast.error(taskEditErrorMessage(null));
        return false;
      }
      // Subtasks without a quantity (PD-058) or a note: the existing Done dialog asks for them.
      const others = doneQtyTargets(current, option, statuses).filter(
        (target) => target.taskId !== current.id
      );
      if (others.length > 0 || option.requiresNote) {
        mover.start(current, option);
        return true;
      }
      await transition.mutateAsync({
        task: current,
        input: { toStatusId: option.toStatusId, qtyDone }
      });
      toast.success(copy.actions.doneToast(task.code));
      return true;
    });

  /** "Trả cho …" with the required note (Đang check → Cần sửa lại). */
  const sendBack = (task: ProductionTask, option: TaskTransitionOption, note: string) =>
    guarded(task.id, async () => {
      await transition.mutateAsync({ task, input: { toStatusId: option.toStatusId, note } });
      toast.success(copy.qc.failToast(task.code, task.assignee.displayName));
      return true;
    });

  return {
    simple,
    done,
    sendBack,
    busyId: busyId ?? mover.pendingTaskId ?? null,
    lookup: mover.lookup,
    dialog: mover.dialog
  };
};
