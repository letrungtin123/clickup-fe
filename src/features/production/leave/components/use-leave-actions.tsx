import { useState } from "react";
import { toast } from "sonner";

import type { LeaveRequest } from "@/contracts/production-leave";

import { scoreErrorMessage } from "../../scores/errors";
import { useCancelLeave } from "../hooks";
import { CancelLeaveDialog, DecideDialog } from "./leave-requests";

type Decision = "APPROVED" | "REJECTED";

/** Shared dialogs for the request actions: decide (optional note) and cancel (confirmation). */
export const useLeaveActions = () => {
  const [deciding, setDeciding] = useState<{ request: LeaveRequest; decision: Decision } | null>(null);
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  const cancel = useCancelLeave();

  const dialogs = (
    <>
      <DecideDialog
        key={deciding ? `${deciding.request.id}:${deciding.decision}` : "none"}
        target={deciding}
        onClose={() => setDeciding(null)}
      />
      <CancelLeaveDialog
        request={cancelling}
        pending={cancel.isPending}
        onClose={() => setCancelling(null)}
        onConfirm={() => {
          if (!cancelling) return;
          cancel.mutate(cancelling.id, {
            onSuccess: () => {
              toast.success("Đã hủy đơn nghỉ");
              setCancelling(null);
            },
            onError: (error) => {
              toast.error(scoreErrorMessage(error));
              setCancelling(null);
            }
          });
        }}
      />
    </>
  );

  return {
    dialogs,
    decide: (request: LeaveRequest, decision: Decision) => setDeciding({ request, decision }),
    cancel: (request: LeaveRequest) => setCancelling(request)
  };
};
