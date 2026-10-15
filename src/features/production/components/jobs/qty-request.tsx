import { Check, Hourglass, X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ProductionTask, TaskQtyRequest } from "@/contracts/production-jobs";

import { useQtyRequestMutations } from "../../jobs-hooks";
import { formatDateTime } from "../../jobs-model";
import { qtyChangeLabel, qtyRequestActions, taskEditErrorMessage } from "../../task-edit-model";

/**
 * PD-044 "Số lượng giao" requests. A worker without a direct right asks the Leader for a new total (with a reason) —
 * in place, in the "Số lượng giao" field itself (PD-047, task-fields.tsx; no dialog); until the Leader approves, the
 * task keeps its quantity. The banner shows the open request on the task page: the worker may cancel it, the Leader
 * (or "update: all") approves or rejects it with an optional note.
 */

/**
 * The open quantity request of a task (amber): who asked, from → to, the reason and when. The requester can cancel
 * it; the Leader approves it or rejects it (an optional note tells the worker why).
 */
export const QtyRequestBanner = ({
  task,
  request,
  myId,
  archived,
  timeZone
}: {
  task: Pick<ProductionTask, "id" | "code" | "capabilities">;
  request: TaskQtyRequest;
  myId: string | null;
  archived: boolean;
  timeZone: string;
}) => {
  const ids = useId();
  const mutations = useQtyRequestMutations();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const actions = qtyRequestActions(request, {
    myId,
    canDecide: task.capabilities.canDecideQtyRequest,
    archived
  });
  const change = qtyChangeLabel(request);
  const busy =
    mutations.decide.isPending || mutations.cancel.isPending;
  const requester = request.requestedBy?.displayName ?? "Người làm";
  const mine = request.requestedBy?.id === myId && myId !== null;

  const decide = (approve: boolean) =>
    mutations.decide.mutate(
      {
        requestId: request.id,
        input: { approve, ...(note.trim() && !approve ? { note: note.trim() } : {}) }
      },
      {
        onSuccess: () => {
          toast.success(
            approve
              ? `Đã duyệt: số tấm giao của #${task.code} ${change}`
              : `Đã từ chối đề nghị sửa số tấm của #${task.code}`
          );
          setRejecting(false);
          setNote("");
        },
        onError: (failure) => setError(taskEditErrorMessage(failure))
      }
    );

  const cancel = () =>
    mutations.cancel.mutate(request.id, {
      onSuccess: () => toast.success(`Đã huỷ đề nghị sửa số tấm của #${task.code}`),
      onError: (failure) => setError(taskEditErrorMessage(failure))
    });

  return (
    <section
      aria-label="Đề nghị sửa số tấm giao"
      className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-foreground"
    >
      <Hourglass className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {actions.canDecide && !mine ? (
          <p>
            <span className="font-medium">{requester}</span> đề nghị sửa số tấm giao{" "}
            <span className="font-semibold tabular-nums">{change}</span>
          </p>
        ) : mine ? (
          <p>
            Đang chờ duyệt: <span className="font-semibold tabular-nums">{change}</span>
            <span className="text-foreground-muted"> · Leader sẽ duyệt đề nghị của bạn</span>
          </p>
        ) : (
          <p>
            {requester} đề nghị sửa số tấm giao{" "}
            <span className="font-semibold tabular-nums">{change}</span>
            <span className="text-foreground-muted"> · đang chờ Leader duyệt</span>
          </p>
        )}
        <p className="whitespace-pre-wrap text-foreground-muted [overflow-wrap:anywhere]">
          <span className="font-medium text-foreground">Lý do:</span> {request.reason}
        </p>
        <p className="text-xs text-foreground-muted">{formatDateTime(request.createdAt, timeZone)}</p>

        {rejecting ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={`${ids}-note`} className="text-xs font-medium">
              Lý do từ chối <span className="font-normal text-foreground-muted">(tùy chọn)</span>
            </label>
            <Input
              id={`${ids}-note`}
              autoFocus
              maxLength={2000}
              value={note}
              disabled={busy}
              placeholder="Người làm sẽ thấy lý do này"
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setRejecting(false);
                } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  decide(false);
                }
              }}
              className="bg-background"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setRejecting(false)}
              >
                Thôi
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => decide(false)}
              >
                {mutations.decide.isPending ? <Spinner /> : <X aria-hidden="true" />}
                Xác nhận từ chối
              </Button>
            </div>
          </div>
        ) : actions.canDecide || actions.canCancel ? (
          <div className="flex flex-wrap gap-2">
            {actions.canDecide ? (
              <>
                <Button type="button" size="sm" disabled={busy} onClick={() => decide(true)}>
                  {mutations.decide.isPending ? <Spinner /> : <Check aria-hidden="true" />}
                  Duyệt
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setRejecting(true);
                  }}
                  className="bg-background"
                >
                  Từ chối
                </Button>
              </>
            ) : null}
            {actions.canCancel ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={cancel}
                className="bg-background"
              >
                {mutations.cancel.isPending ? <Spinner /> : null}
                Huỷ đề nghị
              </Button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
};
