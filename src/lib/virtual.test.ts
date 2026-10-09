// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { measureAfterCommit } from "./virtual";

describe("measureAfterCommit (WK-52)", () => {
  it("measures after the commit, and only nodes still in the document", () => {
    const tasks: (() => void)[] = [];
    const measure = vi.fn();
    const ref = measureAfterCommit(measure, (task) => tasks.push(task));
    const row = document.createElement("div");
    document.body.append(row);
    const gone = document.createElement("div");

    ref(row);
    ref(gone);
    ref(null);
    // Nothing runs inside the ref callback itself (i.e. during React's commit).
    expect(measure).not.toHaveBeenCalled();
    tasks.forEach((task) => task());
    expect(measure.mock.calls).toEqual([[row], [null], [null]]);
  });
});
