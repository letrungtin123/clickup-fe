import { cn } from "cn";
import { RotateCcw, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/shared/radio-controls";
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
import type { JobDetail } from "@/contracts/production-jobs";

import { productionErrorMessage } from "../../errors";
import { useCreateFeedback } from "../../jobs-hooks";
import { touchTargets } from "../../ui";
import { FormAlert } from "../settings-kit";
import { OptionSelect } from "./pickers";

type FeedbackType = "WRONG" | "EXTRA";

/**
 * "Ghi feedback" (Account, while the job is being delivered — PD-014): the delivering tasks park in
 * Feedback until the Leader's re-done work is checked.
 */
export const FeedbackDialog = ({
  open,
  job,
  onClose
}: {
  open: boolean;
  job: JobDetail;
  onClose: () => void;
}) => {
  const ids = useId();
  const create = useCreateFeedback(job.id);
  const [type, setType] = useState<FeedbackType>("WRONG");
  const [sourceTaskId, setSourceTaskId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!note.trim()) {
      setNoteError("Ghi lại khách phản hồi gì.");
      return;
    }
    create.mutate(
      { type, note: note.trim(), ...(sourceTaskId ? { sourceTaskId } : {}) },
      {
        onSuccess: () => {
          toast.success("Đã ghi feedback; Leader sẽ nhận thông báo để giao lại.");
          onClose();
        },
        onError: (failure) => setError(productionErrorMessage(failure))
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !create.isPending && onClose()}>
      {/* Already a bottom sheet on phones (DialogContent); see transition-dialog.tsx. */}
      <DialogContent className={cn("sm:max-w-lg", touchTargets)}>
        <DialogHeader className="pr-8">
          <DialogTitle>Ghi feedback của khách · {job.code}</DialogTitle>
          <DialogDescription>
            Các task đang giao khách chuyển sang Feedback cho tới khi phần làm lại được QC xong.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel id={`${ids}-type`}>Loại feedback</FieldLabel>
          <SegmentedControl<FeedbackType>
            aria-labelledby={`${ids}-type`}
            value={type}
            onChange={setType}
            className="w-full"
            options={[
              { value: "WRONG", label: "Sai — làm lại", icon: RotateCcw },
              { value: "EXTRA", label: "Yêu cầu thêm", icon: Sparkles }
            ]}
          />
          <FieldDescription className="text-xs">
            {type === "WRONG"
              ? "Task làm lại không được tính điểm (vẫn ghi để tính tỉ lệ feedback)."
              : "Task làm thêm được tính điểm như task thường theo quy trình được chọn."}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${ids}-source`}>
            Task gốc <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
          </FieldLabel>
          <OptionSelect
            id={`${ids}-source`}
            options={job.tasks.map((task) => ({
              id: task.id,
              label: `#${task.number} · ${task.process.name} · ${task.assignee.displayName}`
            }))}
            value={sourceTaskId}
            onChange={setSourceTaskId}
            placeholder="Không chọn"
            noneLabel="Không chọn task gốc"
          />
        </Field>
        <Field data-invalid={Boolean(noteError)}>
          <FieldLabel htmlFor={`${ids}-note`}>Nội dung</FieldLabel>
          <Textarea
            id={`${ids}-note`}
            autoFocus
            rows={4}
            maxLength={5000}
            value={note}
            aria-invalid={Boolean(noteError)}
            placeholder="Ví dụ: 5 tấm còn bóng đổ ở chân, khách cần cắt sát hơn…"
            onChange={(event) => {
              setNote(event.target.value);
              setNoteError(null);
            }}
          />
          {noteError ? <FieldError>{noteError}</FieldError> : null}
        </Field>
        <FormAlert>{error}</FormAlert>
        <DialogFooter className="max-sm:-bottom-4">
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? <Spinner /> : null}
            Ghi feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
