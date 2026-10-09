import { cn } from "cn";
import { useId, useState } from "react";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { Feedback } from "@/contracts/production-jobs";

import { productionErrorMessage } from "../../errors";
import { useCloseFeedback } from "../../jobs-hooks";
import { sheetOnPhone } from "../../ui";
import { FormAlert } from "../settings-kit";

/**
 * "Đóng feedback (không cần làm lại)" — Account / Admin close an open client feedback without
 * rework (e.g. the client withdrew it). The reason is required and kept on the feedback.
 */
export const CloseFeedbackDialog = ({
  jobId,
  feedback,
  onClose
}: {
  jobId: string;
  feedback: Feedback | null;
  onClose: () => void;
}) => {
  const ids = useId();
  const close = useCloseFeedback(jobId);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!feedback) return;
    if (!note.trim()) {
      setNoteError("Ghi lý do không cần làm lại.");
      return;
    }
    close.mutate(
      { feedbackId: feedback.id, note: note.trim() },
      {
        onSuccess: () => {
          toast.success("Đã đóng feedback, không cần làm lại.");
          onClose();
        },
        onError: (failure) => setError(productionErrorMessage(failure))
      }
    );
  };

  return (
    <Dialog
      open={feedback !== null}
      onOpenChange={(open) => !open && !close.isPending && onClose()}
    >
      <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Đóng feedback, không cần làm lại?</DialogTitle>
            <DialogDescription>
              {feedback?.type === "WRONG" ? "Feedback sai" : "Yêu cầu thêm"}: “
              {feedback?.note.slice(0, 160) ?? ""}”. Khi job không còn feedback mở, các task đang
              chờ feedback quay về Complete để giao khách lại; task làm lại đang dở vẫn tiếp tục như
              thường.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(noteError)}>
            <FieldLabel htmlFor={`${ids}-note`}>Lý do</FieldLabel>
            <Textarea
              id={`${ids}-note`}
              rows={3}
              maxLength={5000}
              value={note}
              autoFocus
              aria-invalid={Boolean(noteError)}
              placeholder="Ví dụ: khách xác nhận ảnh đúng, rút lại phản hồi."
              onChange={(event) => {
                setNote(event.target.value);
                setNoteError(null);
              }}
            />
            {noteError ? (
              <FieldError>{noteError}</FieldError>
            ) : (
              <FieldDescription className="text-xs">
                Lý do được lưu cùng feedback để Leader và nhân viên xem lại.
              </FieldDescription>
            )}
          </Field>
          <FormAlert>{error}</FormAlert>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={close.isPending}>
              Hủy
            </Button>
            <Button type="submit" disabled={close.isPending}>
              {close.isPending ? <Spinner /> : null}
              Đóng feedback
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
