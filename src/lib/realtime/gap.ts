/**
 * Realtime coverage tracker (no dependencies, so the query client can read it without pulling in the
 * socket). The socket client reports when the connection goes up / down; readers ask whether data
 * fetched at some point may have missed events since (PERF-02 / PERF-16).
 */

let live = false;
/** Epoch ms of the last time the connection was lost (0 = never lost since it came up). */
let lastDownAt = 0;

export const markRealtimeUp = () => {
  live = true;
};

export const markRealtimeDown = (now: number = Date.now()) => {
  if (live) lastDownAt = now;
  live = false;
};

/** True while the socket is connected (events are flowing). */
export const isRealtimeLive = () => live;

/**
 * May events have been missed for data last updated at `since` (epoch ms)? Yes while disconnected,
 * or when the connection dropped at or after that moment.
 */
export const realtimeMissedSince = (since: number) => !live || lastDownAt >= since;

/** Test / sign-out reset. */
export const resetRealtimeGap = () => {
  live = false;
  lastDownAt = 0;
};
