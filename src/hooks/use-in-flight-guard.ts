import { useState } from "react";

/**
 * Synchronous "one submit at a time" latch (BUG-WK-15). React state (`isPending`, a disabled editor)
 * only applies after the next render, so a second Ctrl+Enter in the same tick would post twice; this
 * flips immediately.
 *
 *   if (!guard.tryEnter()) return;
 *   mutation.mutate(input, { onSettled: guard.release });
 */
export class InFlightGuard {
  private busy = false;

  /** True when the caller may proceed (and now holds the latch). */
  tryEnter = () => {
    if (this.busy) return false;
    this.busy = true;
    return true;
  };

  release = () => {
    this.busy = false;
  };

  get active() {
    return this.busy;
  }
}

const createGuard = () => new InFlightGuard();

/** A latch that lives as long as the component. */
export const useInFlightGuard = () => useState(createGuard)[0];
