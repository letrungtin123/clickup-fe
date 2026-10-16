import { cn } from "cn";
import { Check, X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { leaveLimits, type LeaveRequest } from "@/contracts/production-leave";
import { isApiError } from "@/lib/api/errors";

import { FormAlert } from "../../components/settings-kit";
import { scoreErrorMessage } from "../../scores/errors";
import { sheetOnPhone, touchTargets } from "../../ui";
import {
  formatLeaveDates,
  formatLeaveSpan,
  KPI_WORKDAY_HINT,
  leavePartLabels,
  leaveWorkdays,
  showsAdminOnlyNote
} from "../calendar";
import { useDecideLeave } from "../hooks";
import { AdminOnlyDecisionNote, LeaveStatusBadge } from "./leave-bits";

// "10:05 06/10/2026": full dates like the rest of the module (dateStyle short gives "6/10/26").
const dateTime = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh"
});

type Decision = "APPROVED" | "REJECTED";

/**
 * One leave request with the actions the API allows (`canCancel`, `canDecide`). Notes are only
 * present when the caller may read them (owner, LEADER/ADMIN). In the approval queue a pending
 * request the viewer may not decide shows ADMIN_ONLY_DECISION instead (PD-057, PD-065).
 */
export const LeaveRequestRow = ({
  request,
  showUser,
  inQueue = false,
  onDecide,
  onCancel
}: {
  request: LeaveRequest;
  showUser: boolean;
  /** Rendered in the “Chờ duyệt” queue. */
  inQueue?: boolean;
  onDecide: (request: LeaveRequest, decision: Decision) => void;
  onCancel: (request: LeaveRequest) => void;
}) => (
  <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {showUser ? <UserAvatar user={request.user} size="md" /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {showUser ? (
            <span className="font-medium">
              {request.user.displayName}
              {request.team ? (
                <span className="font-normal text-foreground-muted"> · {request.team.name}</span>
              ) : null}
            </span>
          ) : null}
          <span className={cn("tabular-nums", !showUser && "font-medium")}>
            {formatLeaveDates(request.fromDate, request.toDate)}
          </span>
          <span className="text-xs text-foreground-muted">
            {leavePartLabels[request.part]} · {formatLeaveSpan(request, request.days)}
          </span>
          <LeaveStatusBadge status={request.status} />
        </p>
        {leaveWorkdays(request) !== request.days ? (
          <p className="text-[11px] text-foreground-subtle">{KPI_WORKDAY_HINT}</p>
        ) : null}
        {request.note ? (
          <p className="text-xs break-words whitespace-pre-line text-foreground-muted">
            {request.note}
          </p>
        ) : null}
        {request.status === "CANCELLED" && request.cancelledAt ? (
          <p className="text-[11px] text-foreground-subtle">
            Đã hủy · {dateTime.format(new Date(request.cancelledAt))}
          </p>
        ) : request.decidedBy && request.decidedAt ? (
          <p className="text-[11px] text-foreground-subtle">
            {request.status === "REJECTED" ? "Từ chối" : "Duyệt"} bởi{" "}
            {request.decidedBy.displayName} · {dateTime.format(new Date(request.decidedAt))}
            {request.decisionNote ? ` · “${request.decisionNote}”` : ""}
          </p>
        ) : (
          <p className="text-[11px] text-foreground-subtle">
            Gửi lúc {dateTime.format(new Date(request.createdAt))}
          </p>
        )}
      </div>
    </div>
    {request.canDecide || request.canCancel || showsAdminOnlyNote(request, inQueue) ? (
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {showsAdminOnlyNote(request, inQueue) ? <AdminOnlyDecisionNote /> : null}
        {request.canDecide ? (
          <>
            <Button size="sm" variant="outline" onClick={() => onDecide(request, "REJECTED")}>
              <X />
              Từ chối
            </Button>
            <Button size="sm" onClick={() => onDecide(request, "APPROVED")}>
              <Check />
              Duyệt
            </Button>
          </>
        ) : null}
        {request.canCancel ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:text-danger"
            onClick={() => onCancel(request)}
          >
            Hủy đơn
          </Button>
        ) : null}
      </div>
    ) : null}
  </li>
);

/** Approve / reject one request with an optional note for the requester. */
export const DecideDialog = ({
  target,
  onClose
}: {
  target: { request: LeaveRequest; decision: Decision } | null;
  onClose: () => void;
}) => {
  const ids = useId();
  const decide = useDecideLeave();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const approve = target?.decision === "APPROVED";

  const submit = () => {
    if (!target) return;
    setError(null);
    decide.mutate(
      {
        leaveId: target.request.id,
        input: { decision: target.decision, note: note.trim() ? note.trim() : null }
      },
      {
        onSuccess: () => {
          toast.success(
            `${approve ? "Đã duyệt" : "Đã từ chối"} đơn nghỉ của ${target.request.user.displayName}`
          );
          onClose();
        },
        // PD-057 / PD-065: only "Duyệt lịch nghỉ" decides (a permission changed since the page loaded).
        onError: (failure) =>
          setError(
            isApiError(failure) && failure.status === 403
              ? "Bạn không có quyền Duyệt lịch nghỉ nên không duyệt được đơn nghỉ."
              : scoreErrorMessage(failure)
          )
      }
    );
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !decide.isPending && onClose()}>
      <DialogContent className={cn("sm:max-w-md", sheetOnPhone)}>
        <DialogHeader>
          <DialogTitle>{approve ? "Duyệt đơn nghỉ" : "Từ chối đơn nghỉ"}</DialogTitle>
          <DialogDescription>
            {target
              ? `${target.request.user.displayName} · ${formatLeaveDates(target.request.fromDate, target.request.toDate)} · ${leavePartLabels[target.request.part].toLocaleLowerCase("vi")} (${formatLeaveSpan(target.request, target.request.days)}).`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {target?.request.note ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-[13px] whitespace-pre-line text-foreground-muted">
            {target.request.note}
          </p>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${ids}-note`}>
            Ghi chú cho người xin nghỉ {approve ? "(không bắt buộc)" : "(nên ghi lý do)"}
          </FieldLabel>
          <Textarea
            id={`${ids}-note`}
            rows={3}
            maxLength={leaveLimits.noteMaxLength}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <FormAlert>{error}</FormAlert>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={decide.isPending}>
            Hủy
          </Button>
          <Button
            variant={approve ? "default" : "destructive"}
            onClick={submit}
            disabled={decide.isPending}
          >
            {decide.isPending ? <Spinner /> : approve ? <Check /> : <X />}
            {approve ? "Duyệt" : "Từ chối"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Confirmation before withdrawing a request ("Giữ đơn" keeps it). */
export const CancelLeaveDialog = ({
  request,
  pending,
  onConfirm,
  onClose
}: {
  request: LeaveRequest | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => (
  <AlertDialog open={request !== null} onOpenChange={(open) => !open && !pending && onClose()}>
    <AlertDialogContent className={touchTargets}>
      <AlertDialogHeader>
        <AlertDialogTitle>Hủy đơn nghỉ này?</AlertDialogTitle>
        <AlertDialogDescription>
          {request
            ? `Đơn nghỉ ${formatLeaveDates(request.fromDate, request.toDate)} (${leavePartLabels[request.part].toLocaleLowerCase("vi")}) sẽ bị hủy và gỡ khỏi lịch chung.`
            : ""}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Giữ đơn</AlertDialogCancel>
        <Button variant="destructive" disabled={pending} onClick={onConfirm}>
          {pending ? <Spinner /> : null}
          Hủy đơn
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
