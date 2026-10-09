import { useEffect, useRef } from "react";

import { roomName } from "@/contracts/realtime";
import { retainRoom, useRealtimeStore } from "@/lib/realtime/socket";

/**
 * Keeps the socket in the `channel:<id>` room of every conversation the viewer belongs to, so
 * sidebar badges and caches stay live without polling.
 *
 * - The gateway allows 300 rooms per socket (projects/tasks need some): we hold at most `max`,
 *   most recently active first.
 * - Joins are paced (the gateway token bucket refills ~15 events/s).
 * - Transient join failures (RATE_LIMITED, UNAVAILABLE, ack timeouts) are retried by the socket
 *   client itself; a real denial (e.g. access revoked, then restored) is retried here with backoff
 *   while the channel is still in the sidebar.
 */
const BATCH = 6;
const BATCH_INTERVAL_MS = 600;
const MAX_RETRIES = 4;

export const useChannelRooms = (channelIds: readonly string[] | undefined) => {
  const held = useRef(new Map<string, () => void>());
  const queue = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(new Map<string, number>());
  const retryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const desired = useRef(new Set<string>());

  useEffect(() => {
    const heldMap = held.current;
    const retryTimerMap = retryTimers.current;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const handle of retryTimerMap.values()) clearTimeout(handle);
      retryTimerMap.clear();
      for (const release of heldMap.values()) release();
      heldMap.clear();
      queue.current = [];
    };
  }, []);

  const pump = () => {
    if (timer.current) return;
    const step = () => {
      timer.current = null;
      const batch = queue.current.splice(0, BATCH);
      for (const id of batch) {
        if (!desired.current.has(id) || held.current.has(id)) continue;
        held.current.set(id, retainRoom({ type: "channel", id }));
      }
      if (queue.current.length > 0) {
        timer.current = setTimeout(step, BATCH_INTERVAL_MS);
      }
    };
    step();
  };

  // Reconcile the held set with the wanted channels (order = priority).
  const key = channelIds?.join(",") ?? "";
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    desired.current = new Set(ids);
    for (const [id, release] of held.current) {
      if (!desired.current.has(id)) {
        release();
        held.current.delete(id);
        retries.current.delete(id);
      }
    }
    queue.current = ids.filter((id) => !held.current.has(id));
    if (queue.current.length > 0) pump();
    // pump only touches refs
  }, [key]);

  // Retry denied joins (access changed back while the channel stays in the sidebar).
  useEffect(
    () =>
      useRealtimeStore.subscribe((state) => {
        if (state.status !== "connected") return;
        for (const [id] of held.current) {
          const status = state.rooms[roomName({ type: "channel", id })];
          if (status !== "denied" && status !== undefined) {
            if (status === "joined") retries.current.delete(id);
            continue;
          }
          if (retryTimers.current.has(id)) continue;
          const attempt = (retries.current.get(id) ?? 0) + 1;
          if (attempt > MAX_RETRIES) continue;
          retries.current.set(id, attempt);
          const delay = Math.min(15_000, 800 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
          retryTimers.current.set(
            id,
            setTimeout(() => {
              retryTimers.current.delete(id);
              if (!desired.current.has(id)) return;
              held.current.get(id)?.();
              held.current.delete(id);
              queue.current.push(id);
              pump();
            }, delay)
          );
        }
      }),
    // pump only touches refs
    []
  );
};
