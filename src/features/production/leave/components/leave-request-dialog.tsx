import { cn } from "cn";
import { CalendarPlus, Info } from "lucide-react";
import { useId, useRef, useState } from "react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { leaveLimits, type LeavePart } from "@/contracts/production-leave";

import { DateField } from "../../components/date-field";
import { FormAlert } from "../../components/settings-kit";
import { scoreErrorMessage } from "../../scores/errors";
import { sheetOnPhone } from "../../ui";
import {
  draftDays,
  formatLeaveDates,
  formatLeaveSpan,
  KPI_WORKDAY_HINT,
  leaveNoteError,
  leavePartLabels,
  leaveWorkdays,
  validateLeaveDates
} from "../calendar";
import { useCreateLeave } from "../hooks";

/**
 * "Xin nghỉ" (SPEC §6.3): dates, part of day (half days only for a single day) and an optional reason
 * (PD-065; when given it goes on the payroll attendance export). Limits come from the contract's
 * leaveLimits; the server validates again. The request starts PENDING until someone holding "Duyệt lịch
 * nghỉ" decides.
 */
export const LeaveRequestDialog = ({
  open,
  onOpenChange,
  today,
  initialDay
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  /** Pre-selected day (e.g. the calendar day the dialog was opened from). */
  initialDay: string | null;
}) => {
  const ids = useId();
  const create = useCreateLeave();
  // PD-051: never in the past — a past day picked on the calendar starts the request today.
  const start = initialDay && initialDay > today ? initialDay : today;
  const [fromDate, setFromDate] = useState(start);
  const [toDate, setToDate] = useState(start);
  const [part, setPart] = useState<LeavePart>("FULL_DAY");
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);

  const singleDay = fromDate === toDate;
  const draft = { fromDate, toDate, part: singleDay ? part : "FULL_DAY", note } as const;
  const days = draftDays(draft);
  // Optional reason (PD-065): only its length can be wrong; the textarea's maxLength already caps it.
  const noteProblem = leaveNoteError(note);

  const close = (next: boolean) => {
    if (!next && create.isPending) return;
    onOpenChange(next);
  };

  const submit = () => {
    const problem = validateLeaveDates(draft, today);
    setError(problem);
    if (noteProblem) {
      if (!problem) noteRef.current?.focus();
      return;
    }
    if (problem) return;
    const reason = note.trim();
    create.mutate(
      {
        fromDate: draft.fromDate,
        toDate: draft.toDate,
        part: draft.part,
        ...(reason ? { note: reason } : {})
      },
      {
        onSuccess: (request) => {
          toast.success(
            `Đã gửi đơn nghỉ ${formatLeaveDates(request.fromDate, request.toDate)}${request.status === "PENDING" ? ", chờ duyệt" : ""}`
          );
          onOpenChange(false);
        },
        onError: (failure) => setError(scoreErrorMessage(failure))
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
        <DialogHeader>
          <DialogTitle>Xin nghỉ</DialogTitle>
          <DialogDescription>
            Đơn chờ người có quyền Duyệt lịch nghỉ duyệt; mọi người chỉ thấy tên và ngày nghỉ, không
            thấy lý do.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel id={`${ids}-from`}>Từ ngày</FieldLabel>
              <DateField
                aria-labelledby={`${ids}-from`}
                value={fromDate}
                today={today}
                minDay={today}
                onChange={(day) => {
                  if (!day) return;
                  setFromDate(day);
                  if (toDate < day) setToDate(day);
                  setError(null);
                }}
              />
            </Field>
            <Field>
              <FieldLabel id={`${ids}-to`}>Đến ngày</FieldLabel>
              <DateField
                aria-labelledby={`${ids}-to`}
                value={toDate}
                today={today}
                minDay={today}
                onChange={(day) => {
                  if (!day) return;
                  setToDate(day);
                  if (day < fromDate) setFromDate(day);
                  setError(null);
                }}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel id={`${ids}-part`}>Thời gian nghỉ</FieldLabel>
            <SegmentedControl<LeavePart>
              aria-labelledby={`${ids}-part`}
              value={draft.part}
              onChange={setPart}
              className="w-full"
              options={(singleDay
                ? (["FULL_DAY", "MORNING", "AFTERNOON"] as const)
                : (["FULL_DAY"] as const)
              ).map((value) => ({ value, label: leavePartLabels[value] }))}
            />
            {!singleDay ? (
              <span className="text-xs text-foreground-muted">
                Nghỉ nửa ngày chỉ chọn được khi nghỉ trong một ngày.
              </span>
            ) : null}
          </Field>
          <Field data-invalid={noteProblem ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-note`}>
              Lý do nghỉ <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
            </FieldLabel>
            <Textarea
              ref={noteRef}
              id={`${ids}-note`}
              rows={3}
              maxLength={leaveLimits.noteMaxLength}
              value={note}
              placeholder="Ví dụ: Việc gia đình, khám bệnh…"
              aria-invalid={noteProblem ? true : undefined}
              aria-describedby={`${ids}-note-help`}
              onChange={(event) => setNote(event.target.value)}
            />
            {noteProblem ? (
              <FieldError id={`${ids}-note-help`} className="text-xs">
                {noteProblem}
              </FieldError>
            ) : (
              <span id={`${ids}-note-help`} className="text-xs text-foreground-muted">
                Ghi vào bảng chấm công; chỉ bạn, Leader và Quản trị thấy.
              </span>
            )}
          </Field>
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-foreground-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {days > 0 ? (
                <>
                  <span className="font-medium text-foreground">
                    {formatLeaveSpan(draft, days)}
                  </span>{" "}
                  · {formatLeaveDates(fromDate, toDate)} ·{" "}
                  {leavePartLabels[draft.part].toLocaleLowerCase("vi")}.{" "}
                  {leaveWorkdays(draft) !== days ? `${KPI_WORKDAY_HINT} ` : null}
                </>
              ) : null}
              Tối đa {leaveLimits.maxRequestDays} ngày mỗi đơn; chỉ xin nghỉ từ hôm nay trở đi.
            </span>
          </p>
          <FormAlert>{error}</FormAlert>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => close(false)}
              disabled={create.isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : <CalendarPlus />}
              Gửi đơn
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
