import { describe, expect, it } from "vitest";

import { InFlightGuard } from "./use-in-flight-guard";

describe("InFlightGuard", () => {
  it("lets exactly one submit through until it settles", () => {
    const guard = new InFlightGuard();
    const posted: number[] = [];
    const submit = (n: number) => {
      if (!guard.tryEnter()) return;
      posted.push(n);
    };
    // Two Ctrl+Enter presses in the same tick.
    submit(1);
    submit(2);
    expect(posted).toEqual([1]);
    expect(guard.active).toBe(true);
    guard.release();
    submit(3);
    expect(posted).toEqual([1, 3]);
  });

  it("release is safe to pass around unbound", () => {
    const guard = new InFlightGuard();
    guard.tryEnter();
    const { release } = guard;
    release();
    expect(guard.tryEnter()).toBe(true);
  });
});
