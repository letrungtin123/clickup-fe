import { useEffect, useId } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

import { registerConfirmHost, settleConfirm, useConfirmStore } from "../confirm-store";

/** Renders pending `confirmAction()` requests. Mount where task actions happen (views, panel). */
export const ConfirmHost = () => {
  const id = useId();
  useEffect(() => registerConfirmHost(id), [id]);
  const leader = useConfirmStore((state) => state.hosts[0] === id);
  const request = useConfirmStore((state) => state.request);
  if (!leader) return null;

  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && settleConfirm(false)}>
      <AlertDialogContent onKeyDown={(event) => event.key === "Escape" && event.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription>{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{request?.cancelLabel ?? "Hủy"}</AlertDialogCancel>
          <AlertDialogAction
            autoFocus
            variant={request?.destructive ? "destructive" : "default"}
            onClick={() => settleConfirm(true)}
          >
            {request?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
