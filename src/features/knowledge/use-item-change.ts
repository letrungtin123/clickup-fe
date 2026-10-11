import { useState } from "react";
import { toast } from "sonner";

import type { KnowledgeItemDetail, UpdateKnowledgeItemRequest } from "@/contracts/knowledge";

import { isReasonRequired, knowledgeErrorMessage } from "./errors";
import { useUpdateItem } from "./hooks";
import { reasonRequired } from "./model/access";

type FieldPatch = Omit<UpdateKnowledgeItemRequest, "reason" | "expectedVersion" | "versionNote" | "title" | "summary" | "body">;

type ChangeRequest = {
  patch: FieldPatch;
  /** Dialog title when a reason is needed ("Đổi trạng thái?"). */
  title: string;
  description?: string;
  confirmLabel: string;
  /** Toast after success. */
  success: string;
};

/**
 * Field changes from the item page (status, importance, pin, review date). Critical items — before or
 * after the change — ask for a reason in an in-page dialog first (PD-031: every change needs one).
 * Returns `change(request)` and the props for <ReasonDialog>.
 */
export const useItemFieldChange = (item: Pick<KnowledgeItemDetail, "id" | "spaceId" | "importance">) => {
  const update = useUpdateItem(item.id, item.spaceId);
  const [asking, setAsking] = useState<ChangeRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = (request: ChangeRequest, reason?: string) => {
    setError(null);
    update.mutate(
      { ...request.patch, ...(reason ? { reason } : {}) },
      {
        onSuccess: () => {
          setAsking(null);
          toast.success(request.success);
        },
        onError: (failure) => {
          // The server knows best (e.g. the item became critical meanwhile): ask for the reason.
          if (isReasonRequired(failure) && !reason) {
            setAsking(request);
            return;
          }
          const message = knowledgeErrorMessage(failure, "Không lưu được thay đổi.");
          if (asking || reason) setError(message);
          else toast.error(message);
        }
      }
    );
  };

  const change = (request: ChangeRequest) => {
    if (reasonRequired(item.importance, request.patch.importance)) {
      setError(null);
      setAsking(request);
      return;
    }
    send(request);
  };

  return {
    change,
    pending: update.isPending,
    dialog: {
      open: asking !== null,
      onOpenChange: (open: boolean) => {
        if (!open) {
          setAsking(null);
          setError(null);
        }
      },
      title: asking?.title ?? "",
      description: asking?.description ?? "Mục Rất quan trọng: thay đổi được ghi vào nhật ký kèm lý do.",
      confirmLabel: asking?.confirmLabel ?? "Lưu",
      reason: "required" as const,
      pending: update.isPending,
      error,
      onConfirm: (reason: string | undefined) => {
        if (asking) send(asking, reason);
      }
    }
  };
};
