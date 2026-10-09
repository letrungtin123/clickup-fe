import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";

import { productionErrorMessage } from "../../errors";
import { useWorkflow } from "../../hooks";
import { useTransitionTask } from "../../jobs-hooks";
import { needsInput } from "../../jobs-model";
import { TransitionDialog, type PendingMove } from "./transition-dialog";

/** Workflow statuses by id (names, colours, flags) for labelling transition options. */
export const useStatusLookup = () => {
  const workflow = useWorkflow();
  return useMemo(() => {
    const byId = new Map<string, ProductionStatus>(
      (workflow.data?.statuses ?? []).map((status) => [status.id, status])
    );
    return { byId, statuses: workflow.data?.statuses ?? [], isPending: workflow.isPending };
  }, [workflow.data, workflow.isPending]);
};

/**
 * State + dialog for task moves. `start` runs a move straight away when it needs no input, or opens
 * the dialog (Done quantity, OT hours, required note, ADMIN override reason). Options always come
 * from `task.capabilities.transitions` — the UI never invents moves (PD-014).
 */
export const useTaskMover = () => {
  const transition = useTransitionTask();
  const lookup = useStatusLookup();
  const [pending, setPending] = useState<PendingMove | null>(null);

  const run = (
    task: ProductionTask,
    option: TaskTransitionOption,
    extras: { note?: string; qtyDone?: number; otHours?: number } = {},
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
          toast.success(`Đã chuyển #${task.number} sang ${target?.name ?? "trạng thái mới"}`);
          return true;
        },
        (error: unknown) => {
          toast.error(productionErrorMessage(error));
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
          `Đã chuyển #${pending.task.number} sang ${lookup.byId.get(pending.option.toStatusId)?.name ?? "trạng thái mới"}`
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
