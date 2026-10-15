import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";

import { useWorkflow } from "../../hooks";
import { useTransitionTask } from "../../jobs-hooks";
import { needsInput } from "../../jobs-model";
import { taskEditErrorMessage } from "../../task-edit-model";
import { TransitionDialog, type Extras, type PendingMove } from "./transition-dialog";

/** "Đã chuyển #5 sang Done" (+ "cùng 2 subtask": subtasks move with their line, PD-044). */
const movedMessage = (task: ProductionTask, targetName: string | undefined) => {
  const subtasks = task.subtasks?.length ?? 0;
  return `Đã chuyển #${task.code}${subtasks > 0 ? ` (cùng ${subtasks} subtask)` : ""} sang ${targetName ?? "trạng thái mới"}`;
};

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
 * State + dialog for task moves. `start` runs a move straight away when it needs no input, or opens
 * the dialog (Done quantity — of the line and its subtasks —, OT hours, required note, ADMIN override
 * reason). Options always come from `task.capabilities.transitions` — the UI never invents moves
 * (PD-014); a subtask has none (it follows its line, PD-044).
 */
export const useTaskMover = () => {
  const transition = useTransitionTask();
  const lookup = useStatusLookup();
  const [pending, setPending] = useState<PendingMove | null>(null);

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
          toast.error(taskEditErrorMessage(error));
          return false;
        }
      );
  };

  const start = (
    task: ProductionTask,
    option: TaskTransitionOption,
    opts: { optimistic?: boolean } = {}
  ) => {
    if (needsInput(task, option)) {
      setPending({ task, option });
      return;
    }
    void run(task, option, {}, opts.optimistic ?? false);
  };

  const dialog = (
    <TransitionDialog
      key={pending ? `${pending.task.id}:${pending.option.toStatusId}` : "none"}
      pending={pending}
      target={pending ? (lookup.byId.get(pending.option.toStatusId) ?? null) : null}
      onClose={() => setPending(null)}
      onSubmit={async (extras) => {
        if (!pending) return false;
        // Errors propagate to the dialog, which shows them inline.
        await transition.mutateAsync({
          task: pending.task,
          input: { toStatusId: pending.option.toStatusId, ...extras }
        });
        toast.success(
          movedMessage(pending.task, lookup.byId.get(pending.option.toStatusId)?.name)
        );
        setPending(null);
        return true;
      }}
    />
  );

  return {
    start,
    dialog,
    isPending: transition.isPending,
    pendingTaskId: transition.isPending ? transition.variables?.task.id : null,
    lookup
  };
};
