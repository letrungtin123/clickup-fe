import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useSessionContext } from "@/features/auth/hooks";
import { useRealtimeEvent } from "@/lib/realtime/hooks";
import { applyTaskChanges, type PendingTaskChange } from "./realtime-sync";

const batchMs = 150;

/** Always-mounted: keeps task caches live from `task:changed` events of joined project rooms. */
export const TaskRuntime = () => {
  const queryClient = useQueryClient();
  const selfId = useSessionContext().user.id;
  const pending = useRef(new Map<string, PendingTaskChange>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  useRealtimeEvent("task:changed", (event) => {
    const previous = pending.current.get(event.taskId);
    // A later event wins, but a move or deletion in the same burst is never downgraded.
    pending.current.set(event.taskId, {
      event: previous?.event.kind === "deleted" ? previous.event : event,
      moved: event.kind === "moved" || previous?.moved === true
    });
    timer.current ??= setTimeout(() => {
      timer.current = null;
      const batch = [...pending.current.values()];
      pending.current.clear();
      void applyTaskChanges(queryClient, batch, selfId);
    }, batchMs);
  });

  return null;
};
