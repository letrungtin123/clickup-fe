import { describe, expect, it } from "vitest";

import { applyDrop, computeDropPlacement, dropIndex, isNoopDrop, positionFromRects } from "./placement";

const items = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("computeDropPlacement", () => {
  it("places before a row with the previous sibling as lower bound", () => {
    expect(computeDropPlacement(items, "d", { overId: "b", position: "before" })).toEqual({ beforeId: "b", afterId: "a" });
  });

  it("places after a row with the next sibling as upper bound", () => {
    expect(computeDropPlacement(items, "a", { overId: "c", position: "after" })).toEqual({ afterId: "c", beforeId: "d" });
  });

  it("handles the ends of the list", () => {
    expect(computeDropPlacement(items, "c", { overId: "a", position: "before" })).toEqual({ beforeId: "a" });
    expect(computeDropPlacement(items, "a", { overId: "d", position: "after" })).toEqual({ afterId: "d" });
  });

  it("never uses the dragged item as a neighbour", () => {
    expect(computeDropPlacement(items, "b", { overId: "c", position: "before" })).toEqual({ beforeId: "c", afterId: "a" });
  });

  it("appends when dropped on the container", () => {
    expect(computeDropPlacement(items, "x", { overId: null, position: "after" })).toEqual({ afterId: "d" });
    expect(computeDropPlacement([], "x", { overId: null, position: "after" })).toEqual({});
  });

  it("works across groups (item not in the target list)", () => {
    expect(computeDropPlacement(items, "z", { overId: "a", position: "after" })).toEqual({ afterId: "a", beforeId: "b" });
  });
});

describe("drop helpers", () => {
  it("detects no-op drops next to the item itself", () => {
    expect(isNoopDrop(items, "b", { overId: "a", position: "after" })).toBe(true);
    expect(isNoopDrop(items, "b", { overId: "c", position: "before" })).toBe(true);
    expect(isNoopDrop(items, "b", { overId: "c", position: "after" })).toBe(false);
    expect(isNoopDrop(items, "z", { overId: "a", position: "after" })).toBe(false);
  });

  it("computes the resulting order", () => {
    expect(dropIndex(items, "a", { overId: "c", position: "after" })).toBe(2);
    expect(applyDrop(items, { id: "a" }, { overId: "c", position: "after" }).map((item) => item.id)).toEqual(["b", "c", "a", "d"]);
    expect(applyDrop(items, { id: "z" }, { overId: null, position: "after" }).map((item) => item.id)).toEqual(["a", "b", "c", "d", "z"]);
  });

  it("derives before/after from the pointer", () => {
    expect(positionFromRects(105, { top: 100, height: 36 })).toBe("before");
    expect(positionFromRects(130, { top: 100, height: 36 })).toBe("after");
  });
});
