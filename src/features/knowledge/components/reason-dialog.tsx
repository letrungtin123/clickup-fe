import { ShieldAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import { isValidReason, minReasonLength } from "../model/access";

export type ReasonMode = "required" | "optional" | "none";

type ReasonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** "required" for critical items (PD-031: every change needs a reason). */
  reason: ReasonMode;
  pending?: boolean;
  error?: string | null;
  /** Extra content between the description and the reason (choices, previews). */
  children?: ReactNode;
  onConfirm: (reason: string | undefined) => void;
};

/**
 * In-page confirmation with a "Lý do" field (never window.confirm). The reason is kept in the audit log;
 * it is mandatory for items marked "Rất quan trọng".
 */
export const ReasonDialog = (props: ReasonDialogProps) => (
  <Dialog open={props.open} onOpenChange={(next) => (props.pending ? undefined : props.onOpenChange(next))}>
    <DialogContent className="kb-touch gap-0 p-0 sm:max-w-md">
      {/* Mounted with the popup only, so the reason starts empty every time. */}
      <ReasonForm {...props} />
    </DialogContent>
  </Dialog>
);

const ReasonForm = ({
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  reason: mode,
  pending = false,
  error,
  children,
  onConfirm
}: ReasonDialogProps) => {
  const ids = useId();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const invalid = mode === "required" && !isValidReason(reason);

  const submit = () => {
    setTouched(true);
    if (invalid || pending) return;
    const trimmed = reason.trim();
    onConfirm(mode === "none" || !trimmed ? undefined : trimmed);
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col"
    >
      <DialogHeader className="gap-1.5 px-5 pt-5 pb-3 pr-12">
        <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
        {description ? (
          <DialogDescription className="text-[13px] leading-relaxed">{description}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{title}</DialogDescription>
        )}
      </DialogHeader>
      <div className="flex flex-col gap-4 px-5 pb-5">
        {children}
        {mode === "none" ? null : (
          <Field data-invalid={touched && invalid}>
            <FieldLabel htmlFor={`${ids}-reason`}>
              Lý do
              {mode === "optional" ? (
                <span className="font-normal text-foreground-subtle">(không bắt buộc)</span>
              ) : null}
            </FieldLabel>
            {mode === "required" ? (
              <FieldDescription className="flex items-start gap-1.5 text-xs">
                <ShieldAlert className="mt-px size-3.5 shrink-0 text-danger" aria-hidden="true" />
                Mục Rất quan trọng: mọi thay đổi cần ghi lý do, lưu trong nhật ký.
              </FieldDescription>
            ) : null}
            <Textarea
              id={`${ids}-reason`}
              autoFocus
              rows={3}
              maxLength={500}
              value={reason}
              aria-invalid={touched && invalid}
              placeholder="Ví dụ: Cập nhật theo quy định mới từ 01/11"
              onChange={(event) => setReason(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  submit();
                }
              }}
              className="min-h-20 resize-none"
            />
            {touched && invalid ? (
              <FieldError>{`Nhập lý do (ít nhất ${minReasonLength} ký tự).`}</FieldError>
            ) : null}
          </Field>
        )}
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter className="mx-0 mb-0 px-5 py-3">
        <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
          Hủy
        </Button>
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
          {pending ? <Spinner /> : null}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
};
