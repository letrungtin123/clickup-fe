import { cn } from "cn";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";

import { isQcSendBack, taskEditErrorMessage } from "../../task-edit-model";
import { touchTargets } from "../../ui";
import { FormAlert } from "../settings-kit";

export type PendingMove = { task: ProductionTask; option: TaskTransitionOption };

export type Extras = { note?: string };

/**
 * Asks the reason a move needs: QC sending the line back ("Cần sửa lại", PD-044) or an ADMIN override. Done asks
 * nothing any more (owner, 2026-10-15): the line and its subtasks are Done with the quantities they already show
 * (corrected in place on the line page until "Đã check"), and the subtasks follow the line.
 */
export const TransitionDialog = ({
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
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // QC sends the line back to its worker: a noted move out of "Chờ QC" / "Đang check" (PD-044 "Cần sửa lại").
  const goingBack = Boolean(option && isQcSendBack(task?.status.code, option, target?.code));

  const submit = async () => {
    if (!option || !task) return;
    const extras: Extras = {};
    if (option.requiresNote || option.override) {
      if (!note.trim()) {
        setNoteError(
          option.override
            ? "Nhập lý do chuyển ngoài luồng."
            : goingBack
              ? "Nhập lý do cần sửa để người làm biết phải sửa gì."
              : "Nhập ghi chú."
        );
        return;
      }
      extras.note = note.trim();
    } else if (note.trim()) {
      extras.note = note.trim();
    }
    setNoteError(null);
    setBusy(true);
    try {
      await onSubmit(extras);
    } catch (error) {
      setFormError(taskEditErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const title = option?.override
    ? `Chuyển ngoài luồng sang ${target?.name ?? "…"}`
    : goingBack
      ? `Cần sửa lại · #${task?.code ?? ""}`
      : `Chuyển #${task?.code ?? ""} sang ${target?.name ?? "…"}`;
  const required = Boolean(option?.requiresNote || option?.override);

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      {/* DialogContent is already a keyboard- and safe-area-aware bottom sheet on phones. */}
      <DialogContent className={cn("sm:max-w-md", touchTargets)}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader className="pr-8">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {task
                ? goingBack
                  ? `QC trả về ${task.assignee.displayName} để sửa · ${task.jobCode} · ${task.process.name}`
                  : `${task.jobCode} · ${task.process.name}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(noteError)}>
            <FieldLabel htmlFor={`${ids}-note`}>
              {option?.override ? "Lý do" : goingBack ? "Cần sửa lại — lý do" : "Ghi chú"}
              {required ? null : (
                <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
              )}
            </FieldLabel>
            <Textarea
              id={`${ids}-note`}
              autoFocus
              rows={3}
              maxLength={5000}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                if (noteError) setNoteError(null);
              }}
              aria-invalid={Boolean(noteError)}
              placeholder={goingBack ? "Ví dụ: 3 tấm còn bóng đổ, viền tóc chưa sạch…" : undefined}
            />
            {noteError ? <FieldError>{noteError}</FieldError> : null}
          </Field>
          <FormAlert>{formError}</FormAlert>
          <DialogFooter className="max-sm:-bottom-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Hủy
            </Button>
            <Button type="submit" variant={goingBack ? "destructive" : "default"} disabled={busy}>
              {busy ? <Spinner /> : null}
              {goingBack ? "Trả về người làm" : `Chuyển sang ${target?.name ?? "…"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
