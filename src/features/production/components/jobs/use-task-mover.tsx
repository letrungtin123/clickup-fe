import { cn } from "cn";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";
import { toneClass } from "@/lib/colors";

import { productionErrorMessage } from "../../errors";
import { useWorkflow } from "../../hooks";
import { useTransitionTask } from "../../jobs-hooks";
import { needsInput, splitTransitions } from "../../jobs-model";
import { sheetOnPhone } from "../../ui";
import { FormAlert } from "../settings-kit";

/** Workflow statuses by id (names, colours, flags) for labelling transition options. */
export const useStatusLookup = () => {
  const workflow = useWorkflow();
  return useMemo(() => {
    const byId = new Map<string, ProductionStatus>((workflow.data?.statuses ?? []).map((status) => [status.id, status]));
    return { byId, statuses: workflow.data?.statuses ?? [], isPending: workflow.isPending };
  }, [workflow.data, workflow.isPending]);
};

type PendingMove = { task: ProductionTask; option: TaskTransitionOption };

/**
 * State + dialog for task moves. `start` runs a move straight away when it needs no input, or opens
 * the dialog (Done quantity, OT hours, required note, ADMIN override reason). Options always come
 * from `task.capabilities.transitions` — the UI never invents moves (PD-014).
 */
export const useTaskMover = () => {
  const transition = useTransitionTask();
  const lookup = useStatusLookup();
  const [pending, setPending] = useState<PendingMove | null>(null);

  const run = (task: ProductionTask, option: TaskTransitionOption, extras: { note?: string; qtyDone?: number; otHours?: number } = {}, optimistic = false) => {
    const target = lookup.byId.get(option.toStatusId);
    const optimisticStatus =
      optimistic && target ? { id: target.id, code: target.code, name: target.name, color: target.color } : undefined;
    return transition.mutateAsync({ task, input: { toStatusId: option.toStatusId, ...extras }, ...(optimisticStatus ? { optimisticStatus } : {}) }).then(
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

  const start = (task: ProductionTask, option: TaskTransitionOption, opts: { optimistic?: boolean } = {}) => {
    if (needsInput(option)) {
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
        await transition.mutateAsync({ task: pending.task, input: { toStatusId: pending.option.toStatusId, ...extras } });
        toast.success(`Đã chuyển #${pending.task.number} sang ${lookup.byId.get(pending.option.toStatusId)?.name ?? "trạng thái mới"}`);
        setPending(null);
        return true;
      }}
    />
  );

  return { start, dialog, isPending: transition.isPending, pendingTaskId: transition.isPending ? transition.variables?.task.id : null, lookup };
};

type Extras = { note?: string; qtyDone?: number; otHours?: number };

const TransitionDialog = ({
  pending,
  target,
  onClose,
  onSubmit
}: {
  pending: PendingMove | null;
  target: ProductionStatus | null;
  onClose: () => void;
  onSubmit: (extras: Extras) => Promise<boolean>;
}) => {
  const ids = useId();
  const option = pending?.option;
  const task = pending?.task;
  const [qty, setQty] = useState(String(task?.qtyDone ?? task?.qtyAssigned ?? ""));
  const [ot, setOt] = useState(task?.otHours !== null && task?.otHours !== undefined ? String(task.otHours) : "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ qty?: string | undefined; ot?: string | undefined; note?: string | undefined }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A noted move out of "Chờ QC" (system code, PD-014) is the QC fail.
  const goingBack = Boolean(option?.requiresNote && !option.override && task?.status.code === "WAITING_QC");

  const submit = async () => {
    if (!option || !task) return;
    const problems: typeof errors = {};
    const extras: Extras = {};
    if (option.asksQty) {
      const value = Number(qty);
      if (!/^\d+$/.test(qty.trim()) || value > 1_000_000) problems.qty = "Nhập số tấm nguyên ≥ 0.";
      else extras.qtyDone = value;
    }
    if (option.asksOtHours) {
      const value = Number(ot.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0 || value > 24 || Math.round(value * 10) !== value * 10) {
        problems.ot = "Giờ OT từ 0,1 đến 24 (một chữ số thập phân).";
      } else extras.otHours = value;
    }
    if (option.requiresNote) {
      if (!note.trim()) problems.note = option.override ? "Nhập lý do chuyển ngoài luồng." : "Nhập ghi chú.";
      else extras.note = note.trim();
    } else if (note.trim()) {
      extras.note = note.trim();
    }
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      await onSubmit(extras);
    } catch (error) {
      setFormError(productionErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const title = option?.override
    ? `Chuyển ngoài luồng sang ${target?.name ?? "…"}`
    : goingBack
      ? `QC không đạt — trả #${task?.number ?? ""} về ${target?.name ?? "…"}`
      : `Chuyển #${task?.number ?? ""} sang ${target?.name ?? "…"}`;

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {task ? `${task.jobCode} · ${task.process.name} · giao ${task.qtyAssigned} tấm` : null}
            </DialogDescription>
          </DialogHeader>
          {option?.asksQty ? (
            <Field data-invalid={Boolean(errors.qty)}>
              <FieldLabel htmlFor={`${ids}-qty`}>Số tấm hoàn thành</FieldLabel>
              <Input
                id={`${ids}-qty`}
                autoFocus
                inputMode="numeric"
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                aria-invalid={Boolean(errors.qty)}
                className="tabular-nums"
              />
              {errors.qty ? (
                <FieldError>{errors.qty}</FieldError>
              ) : (
                <FieldDescription className="text-xs">
                  Mặc định bằng số tấm được giao; sửa nếu thực tế khác. Điểm tính theo số này.
                </FieldDescription>
              )}
            </Field>
          ) : null}
          {option?.asksOtHours ? (
            <Field data-invalid={Boolean(errors.ot)}>
              <FieldLabel htmlFor={`${ids}-ot`}>Số giờ OT</FieldLabel>
              <Input
                id={`${ids}-ot`}
                inputMode="decimal"
                value={ot}
                placeholder="Ví dụ 2,5"
                onChange={(event) => setOt(event.target.value)}
                aria-invalid={Boolean(errors.ot)}
                className="tabular-nums"
              />
              {errors.ot ? <FieldError>{errors.ot}</FieldError> : null}
            </Field>
          ) : null}
          <Field data-invalid={Boolean(errors.note)}>
            <FieldLabel htmlFor={`${ids}-note`}>
              {option?.override ? "Lý do" : goingBack ? "Lý do không đạt" : "Ghi chú"}
              {option?.requiresNote ? null : <span className="font-normal text-foreground-subtle">(tùy chọn)</span>}
            </FieldLabel>
            <Textarea
              id={`${ids}-note`}
              autoFocus={!option?.asksQty}
              rows={3}
              maxLength={5000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-invalid={Boolean(errors.note)}
              placeholder={goingBack ? "Ví dụ: còn bụi ở 3 tấm, viền tóc chưa sạch…" : undefined}
            />
            {errors.note ? <FieldError>{errors.note}</FieldError> : null}
          </Field>
          <FormAlert>{formError}</FormAlert>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Hủy
            </Button>
            <Button type="submit" variant={goingBack ? "destructive" : "default"} disabled={busy}>
              {busy ? <Spinner /> : null}
              {goingBack ? "Trả lại cho người làm" : `Chuyển sang ${target?.name ?? "…"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
