import { cn } from "cn";
import { CornerDownRight, ImageUp } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";

import {
  doneQtyExtras,
  requiredQtyProblem,
  taskEditErrorMessage,
  type DoneQtyTarget
} from "../../task-edit-model";
import { touchTargets } from "../../ui";
import { FormAlert } from "../settings-kit";

/** A move into Done that needs quantities first (PD-058): the line, the move and what to ask. */
export type PendingDoneQty = {
  task: ProductionTask;
  option: TaskTransitionOption;
  targets: DoneQtyTarget[];
  /** Typed before (kept when the dialog is reopened after a stale TASK_QTY_REQUIRED). */
  values?: Readonly<Record<string, string>> | undefined;
  /** Why it is (re)opened, e.g. the server's "Nhập số lượng trước khi chuyển Done.". */
  notice?: string | null | undefined;
};

export type DoneQtyExtras = ReturnType<typeof doneQtyExtras> & { note?: string };

/**
 * "Nhập số lượng để chuyển Done" (PD-058): the quantity was optional until now, so moving a line into Done while it —
 * or one of its live subtasks — has none asks for each missing number right here (whole number ≥ 1; it becomes both
 * its quantities), then the move goes through. Tasks that already have numbers are not asked. Compact: one row per
 * task (code, process, number), the first focused, Enter submits; a bottom sheet on phones (DialogContent). An ADMIN
 * override or a noted move into Done also asks its reason.
 */
export const DoneQtyDialog = ({
  pending,
  target,
  onClose,
  onSubmit
}: {
  pending: PendingDoneQty | null;
  target: ProductionStatus | null;
  onClose: () => void;
  /** Sends the move; a rejection shows inline. */
  onSubmit: (extras: DoneQtyExtras) => Promise<unknown>;
}) => {
  const ids = useId();
  const option = pending?.option;
  const task = pending?.task;
  const targets = pending?.targets ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...pending?.values }));
  const [showErrors, setShowErrors] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(pending?.notice ?? null);
  const [busy, setBusy] = useState(false);
  const needsNote = Boolean(option?.requiresNote || option?.override);
  const targetName = target?.name ?? "Done";
  const problems = Object.fromEntries(
    targets.map((item) => [item.taskId, requiredQtyProblem(values[item.taskId] ?? "")])
  );
  const inputId = (taskId: string) => `${ids}-qty-${taskId}`;

  const submit = async () => {
    if (!task || !option) return;
    setShowErrors(true);
    const firstInvalid = targets.find((item) => problems[item.taskId]);
    if (firstInvalid) {
      document.getElementById(inputId(firstInvalid.taskId))?.focus();
      return;
    }
    if (needsNote && !note.trim()) {
      setNoteError(option.override ? "Nhập lý do chuyển ngoài luồng." : "Nhập ghi chú.");
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      await onSubmit({
        ...doneQtyExtras(task.id, targets, values),
        ...(note.trim() ? { note: note.trim() } : {})
      });
    } catch (error) {
      setFormError(taskEditErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      {/* DialogContent is already a keyboard- and safe-area-aware bottom sheet on phones. */}
      <DialogContent className={cn("sm:max-w-md", touchTargets)}>
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader className="pr-8">
            <DialogTitle>Nhập số lượng để chuyển {targetName}</DialogTitle>
            <DialogDescription>
              {targets.length > 1
                ? `${targets.length} task chưa có số lượng. Nhập số tấm thực tế đã làm của từng task để chuyển #${task?.code ?? ""} sang ${targetName}.`
                : `Task chưa có số lượng. Nhập số tấm thực tế đã làm để chuyển #${task?.code ?? ""} sang ${targetName}.`}
            </DialogDescription>
          </DialogHeader>

          <ul
            aria-label="Task chưa có số lượng"
            className="flex flex-col divide-y overflow-hidden rounded-xl border bg-surface"
          >
            {targets.map((item, index) => {
              const problem = showErrors ? problems[item.taskId] : null;
              const id = inputId(item.taskId);
              return (
                <li key={item.taskId} className="flex flex-col gap-1 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2">
                      {item.subtask ? (
                        <CornerDownRight
                          aria-hidden="true"
                          className="size-4 shrink-0 text-foreground-subtle"
                        />
                      ) : (
                        <ImageUp aria-hidden="true" className="size-4 shrink-0 text-brand-text" />
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[13px] font-semibold tabular-nums">
                          #{item.code}
                          {item.subtask ? (
                            <span className="ml-1.5 text-[11px] font-medium text-foreground-subtle">
                              subtask
                            </span>
                          ) : null}
                        </span>
                        <span
                          className="truncate text-xs text-foreground-muted"
                          title={item.processName}
                        >
                          {item.processName}
                        </span>
                      </span>
                    </label>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Input
                        id={id}
                        // The first missing number takes the focus as the dialog opens.
                        autoFocus={index === 0}
                        inputMode="numeric"
                        autoComplete="off"
                        enterKeyHint="done"
                        placeholder="Số tấm"
                        value={values[item.taskId] ?? ""}
                        disabled={busy}
                        aria-invalid={Boolean(problem)}
                        aria-describedby={problem ? `${id}-error` : undefined}
                        onChange={(event) => {
                          const next = event.target.value;
                          setValues((current) => ({ ...current, [item.taskId]: next }));
                        }}
                        className="w-24 text-right tabular-nums"
                      />
                      <span aria-hidden="true" className="text-xs text-foreground-muted">
                        tấm
                      </span>
                    </span>
                  </div>
                  {problem ? (
                    <FieldError id={`${id}-error`} className="text-right text-xs">
                      {problem}
                    </FieldError>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {needsNote ? (
            <Field data-invalid={Boolean(noteError)}>
              <FieldLabel htmlFor={`${ids}-note`}>{option?.override ? "Lý do" : "Ghi chú"}</FieldLabel>
              <Textarea
                id={`${ids}-note`}
                rows={2}
                maxLength={5000}
                value={note}
                disabled={busy}
                aria-invalid={Boolean(noteError)}
                onChange={(event) => {
                  setNote(event.target.value);
                  if (noteError) setNoteError(null);
                }}
              />
              {noteError ? <FieldError>{noteError}</FieldError> : null}
            </Field>
          ) : null}

          <FormAlert>{formError}</FormAlert>
          <DialogFooter className="max-sm:-bottom-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Hủy
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null}
              Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
