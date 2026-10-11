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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";
import { isApiError } from "@/lib/api/errors";

import { productionErrorMessage } from "../../errors";
import { formatInteger, formatNumber } from "../../format";
import { maxDeclaredDoneQty, transitionAsks } from "../../jobs-model";
import { touchTargets } from "../../ui";
import { FormAlert } from "../settings-kit";

export type PendingMove = { task: ProductionTask; option: TaskTransitionOption };

export type Extras = { note?: string; qtyDone?: number; otHours?: number };

/** Asks what a move needs: Done quantity, OT hours, the QC-fail note or the override reason. */
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
  const asks = option && task ? transitionAsks(task, option) : null;
  const [qty, setQty] = useState(String(task?.qtyDone ?? task?.qtyAssigned ?? ""));
  const [ot, setOt] = useState(
    task?.otHours !== null && task?.otHours !== undefined ? formatNumber(task.otHours) : ""
  );
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{
    qty?: string | undefined;
    ot?: string | undefined;
    note?: string | undefined;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A noted move out of "Chờ QC" (system code, PD-014) is the QC fail.
  const goingBack = Boolean(
    option?.requiresNote && !option.override && task?.status.code === "WAITING_QC"
  );
  // SEC2-03: the first Done may declare at most max(2 × assigned, assigned + 10) images (the API
  // answers QTY_DONE_TOO_HIGH above that); more than assigned is allowed but flagged as an anomaly.
  const maxDone = task ? maxDeclaredDoneQty(task.qtyAssigned) : null;
  const qtyValue = /^\d+$/.test(qty.trim()) ? Number(qty) : null;
  const overAssigned =
    task &&
    qtyValue !== null &&
    qtyValue > task.qtyAssigned &&
    maxDone !== null &&
    qtyValue <= maxDone;

  const submit = async () => {
    if (!option || !task) return;
    const problems: typeof errors = {};
    const extras: Extras = {};
    if (asks?.qty) {
      const value = Number(qty);
      if (!/^\d+$/.test(qty.trim()) || value > 1_000_000) problems.qty = "Nhập số tấm nguyên ≥ 0.";
      else if (maxDone !== null && value > maxDone)
        problems.qty = `Tối đa ${formatInteger(maxDone)} tấm cho ${formatInteger(task.qtyAssigned)} tấm được giao. Nếu thực tế làm nhiều hơn, hãy báo Leader của job sửa số lượng sau khi Done.`;
      else extras.qtyDone = value;
    }
    if (asks?.otHours) {
      const value = Number(ot.replace(",", "."));
      if (
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 24 ||
        Math.round(value * 10) !== value * 10
      ) {
        problems.ot = "Giờ OT từ 0,1 đến 24 (một chữ số thập phân).";
      } else extras.otHours = value;
    }
    if (option.requiresNote) {
      if (!note.trim())
        problems.note = option.override
          ? "Nhập lý do chuyển ngoài luồng."
          : goingBack
            ? "Nhập lý do không đạt để người làm biết cần sửa gì."
            : "Nhập ghi chú.";
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
      const message = productionErrorMessage(error);
      // The server's cap message belongs under the quantity it is about.
      if (isApiError(error) && error.code === "QTY_DONE_TOO_HIGH" && asks?.qty) {
        setErrors((current) => ({ ...current, qty: message }));
      } else {
        setFormError(message);
      }
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
      {/* DialogContent is already a keyboard- and safe-area-aware bottom sheet on phones;
          `sheetOnPhone` zeroed its bottom padding, so the footer overflowed and the autofocused
          field scrolled the title out of view. */}
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
                ? `${task.jobCode} · ${task.process.name} · ${
                    task.qtyDone !== null
                      ? `xong ${task.qtyDone}/${task.qtyAssigned}`
                      : `giao ${task.qtyAssigned}`
                  } tấm`
                : null}
            </DialogDescription>
          </DialogHeader>
          {asks?.qty ? (
            <Field data-invalid={Boolean(errors.qty)}>
              <FieldLabel htmlFor={`${ids}-qty`}>Số tấm hoàn thành</FieldLabel>
              <Input
                id={`${ids}-qty`}
                autoFocus
                inputMode="numeric"
                value={qty}
                onChange={(event) => {
                  setQty(event.target.value);
                  if (errors.qty) setErrors((current) => ({ ...current, qty: undefined }));
                }}
                aria-invalid={Boolean(errors.qty)}
                aria-describedby={`${ids}-qty-hint`}
                className="tabular-nums"
              />
              {errors.qty ? (
                <FieldError id={`${ids}-qty-hint`}>{errors.qty}</FieldError>
              ) : overAssigned ? (
                <FieldDescription id={`${ids}-qty-hint`} className="text-xs text-warning">
                  Nhiều hơn {formatInteger(task.qtyAssigned)} tấm được giao — vẫn lưu được nhưng sẽ
                  hiện trong báo cáo bất thường. Tối đa {formatInteger(maxDone)} tấm.
                </FieldDescription>
              ) : (
                <FieldDescription id={`${ids}-qty-hint`} className="text-xs">
                  Mặc định bằng số tấm được giao; sửa nếu thực tế khác. Điểm tính theo số này
                  {maxDone !== null ? ` (tối đa ${formatInteger(maxDone)} tấm)` : ""}.
                </FieldDescription>
              )}
            </Field>
          ) : null}
          {asks?.otHours ? (
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
              {option?.requiresNote ? null : (
                <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
              )}
            </FieldLabel>
            <Textarea
              id={`${ids}-note`}
              autoFocus={!asks?.qty}
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
          <DialogFooter className="max-sm:-bottom-4">
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
