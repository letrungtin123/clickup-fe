import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";
import { useSessionContext } from "@/features/auth/hooks";

import { useWorkflow } from "../../hooks";
import { jobsApi } from "../../jobs-api";
import { applyTask, useTransitionTask } from "../../jobs-hooks";
import { needsInput } from "../../jobs-model";
import { productionKeys } from "../../keys";
import {
  doneQtyTargets,
  doneQtyTargetsFor,
  qtyRequiredTaskIds,
  taskEditErrorMessage
} from "../../task-edit-model";
import { DoneQtyDialog, type DoneQtyExtras, type PendingDoneQty } from "./done-qty-dialog";
import { TransitionDialog, type Extras, type PendingMove } from "./transition-dialog";

/** "Đã chuyển #5 sang Done" (+ "cùng 2 subtask": subtasks move with their line, PD-044). */
const movedMessage = (task: ProductionTask, targetName: string | undefined) => {
  const subtasks = task.subtasks?.length ?? 0;
  return `Đã chuyển #${task.code}${subtasks > 0 ? ` (cùng ${subtasks} subtask)` : ""} sang ${targetName ?? "trạng thái mới"}`;
};

/** What the Done dialog had typed, from the quantities it sent (to keep them when it reopens). */
const typedValues = (task: ProductionTask, extras: DoneQtyExtras) => ({
  ...(extras.qtyDone !== undefined ? { [task.id]: String(extras.qtyDone) } : {}),
  ...Object.fromEntries(
    (extras.subtaskQtyDone ?? []).map((item) => [item.taskId, String(item.qtyDone)])
  )
});

/** Workflow statuses by id (names, colours, flags) for labelling transition options. */
export const useStatusLookup = () => {
  const workflow = useWorkflow();
  const { data, isPending, isError, error, isFetching, refetch } = workflow;
  return useMemo(() => {
    const byId = new Map<string, ProductionStatus>(
      (data?.statuses ?? []).map((status) => [status.id, status])
    );
    return {
      byId,
      statuses: data?.statuses ?? [],
      isPending,
      /** No workflow (request failed): moves cannot be labelled; screens explain and offer a retry. */
      isError: isError && !data,
      error,
      retrying: isFetching,
      retry: () => void refetch()
    };
  }, [data, isPending, isError, error, isFetching, refetch]);
};

/**
 * State + dialogs for task moves. `start` runs a move straight away when it needs no input, or opens a dialog:
 * - PD-058 "Nhập số lượng để chuyển Done": entering Done while the line or a live subtask has no quantity yet asks each
 *   missing number first (DoneQtyDialog; lines whose numbers are all known move straight away, PD-046). When the API
 *   still answers TASK_QTY_REQUIRED (stale data), the line is fetched again and the dialog opens for the tasks it
 *   names (`details.taskIds`).
 * - the reason a move needs (QC's "Cần sửa lại", an ADMIN override: TransitionDialog).
 * Options always come from `task.capabilities.transitions` — the UI never invents moves (PD-014); a subtask has none
 * (it follows its line, PD-044).
 */
export const useTaskMover = () => {
  const transition = useTransitionTask();
  const lookup = useStatusLookup();
  const client = useQueryClient();
  const myId = useSessionContext().user.id;
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [qtyPending, setQtyPending] = useState<PendingDoneQty | null>(null);
  // Bumped each time the Done dialog (re)opens, so it starts from its new targets.
  const [qtyRound, setQtyRound] = useState(0);

  const openQtyDialog = (next: PendingDoneQty) => {
    setQtyRound((round) => round + 1);
    setQtyPending(next);
  };

  /**
   * TASK_QTY_REQUIRED although the cached line looked complete (someone added a subtask, or the list is old): fetch the
   * line again (stored everywhere it is cached) and ask for what the API named.
   */
  const askAgain = async (
    task: ProductionTask,
    option: TaskTransitionOption,
    error: unknown,
    values?: Readonly<Record<string, string>>
  ) => {
    const ids = qtyRequiredTaskIds(error);
    let fresh = task;
    try {
      fresh = await client.fetchQuery({
        queryKey: productionKeys.task(task.id),
        queryFn: ({ signal }) => jobsApi.task(task.id, signal),
        staleTime: 0
      });
      applyTask(client, fresh, myId);
    } catch {
      // Offline or gone: ask with what we have; the API checks again.
    }
    const targets = doneQtyTargetsFor(fresh, ids);
    openQtyDialog({
      task: fresh,
      option,
      targets,
      values,
      notice: taskEditErrorMessage(error)
    });
  };

  const run = (
    task: ProductionTask,
    option: TaskTransitionOption,
    extras: Extras = {},
    optimistic = false
  ) => {
    const target = lookup.byId.get(option.toStatusId);
    const optimisticStatus =
      optimistic && target
        ? { id: target.id, code: target.code, name: target.name, color: target.color }
        : undefined;
    return transition
      .mutateAsync({
        task,
        input: { toStatusId: option.toStatusId, ...extras },
        ...(optimisticStatus ? { optimisticStatus } : {})
      })
      .then(
        () => {
          toast.success(movedMessage(task, target?.name));
          return true;
        },
        (error: unknown) => {
          if (qtyRequiredTaskIds(error) !== null) void askAgain(task, option, error);
          else toast.error(taskEditErrorMessage(error));
          return false;
        }
      );
  };

  const start = (
    task: ProductionTask,
    option: TaskTransitionOption,
    opts: { optimistic?: boolean } = {}
  ) => {
    // PD-058: Done needs every quantity of the line and its subtasks (a reason, if the move needs one, is asked there too).
    const targets = doneQtyTargets(task, option, lookup.statuses);
    if (targets.length > 0) {
      openQtyDialog({ task, option, targets });
      return;
    }
    if (needsInput(task, option)) {
      setPending({ task, option });
      return;
    }
    void run(task, option, {}, opts.optimistic ?? false);
  };

  const dialog = (
    <>
      <TransitionDialog
        key={pending ? `${pending.task.id}:${pending.option.toStatusId}` : "transition-closed"}
        pending={pending}
        target={pending ? (lookup.byId.get(pending.option.toStatusId) ?? null) : null}
        onClose={() => setPending(null)}
        onSubmit={async (extras) => {
          if (!pending) return false;
          try {
            // Other errors propagate to the dialog, which shows them inline.
            await transition.mutateAsync({
              task: pending.task,
              input: { toStatusId: pending.option.toStatusId, ...extras }
            });
          } catch (error) {
            if (qtyRequiredTaskIds(error) === null) throw error;
            setPending(null);
            await askAgain(pending.task, pending.option, error);
            return false;
          }
          toast.success(
            movedMessage(pending.task, lookup.byId.get(pending.option.toStatusId)?.name)
          );
          setPending(null);
          return true;
        }}
      />
      <DoneQtyDialog
        key={qtyPending ? `qty:${qtyPending.task.id}:${qtyPending.option.toStatusId}:${qtyRound}` : "qty-closed"}
        pending={qtyPending}
        target={qtyPending ? (lookup.byId.get(qtyPending.option.toStatusId) ?? null) : null}
        onClose={() => setQtyPending(null)}
        onSubmit={async (extras) => {
          if (!qtyPending) return;
          const { task, option } = qtyPending;
          try {
            await transition.mutateAsync({
              task,
              input: { toStatusId: option.toStatusId, ...extras }
            });
          } catch (error) {
            // Stale: the API names more tasks — fetch the line again and ask for them (typed numbers kept).
            if (qtyRequiredTaskIds(error) === null) throw error;
            await askAgain(task, option, error, typedValues(task, extras));
            return;
          }
          toast.success(movedMessage(task, lookup.byId.get(option.toStatusId)?.name));
          setQtyPending(null);
        }}
      />
    </>
  );

  return {
    start,
    dialog,
    isPending: transition.isPending,
    pendingTaskId: transition.isPending ? transition.variables?.task.id : null,
    lookup
  };
};
