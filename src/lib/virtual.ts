import { useMemo } from "react";

/**
 * Ref callback for dynamically measured virtual rows that measures right after React's commit instead
 * of inside it (WK-52). A first measurement that shifts the scroll position (rows above the fold, or a
 * chat pinned to its end) makes TanStack Virtual re-render with `flushSync`; called from a ref during
 * the commit, React refuses that and logs "flushSync was called from inside a lifecycle method". A
 * microtask still runs before the browser paints, so the scroll compensation lands in the same frame.
 */
export const measureAfterCommit =
  (measure: (node: Element | null) => void, schedule: (task: () => void) => void = queueMicrotask) =>
  (node: Element | null) => {
    schedule(() => measure(node?.isConnected ? node : null));
  };

/** Stable `ref` for measured rows: `<div ref={measureRef} data-index={i}>`. */
export const useMeasureAfterCommit = (virtualizer: { measureElement: (node: Element | null) => void }) => {
  const { measureElement } = virtualizer;
  return useMemo(() => measureAfterCommit(measureElement), [measureElement]);
};
