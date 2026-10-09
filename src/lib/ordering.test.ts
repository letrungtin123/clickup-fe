import { describe, expect, it } from "vitest";

import { moveItem, placementFor } from "./ordering";

const items = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("moveItem", () => {
  it("moves an element forward and backward without mutating the input", () => {
    expect(moveItem(items, 0, 2).map((item) => item.id)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(items, 3, 1).map((item) => item.id)).toEqual(["a", "d", "b", "c"]);
    expect(items.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("ignores out-of-range moves", () => {
    expect(moveItem(items, 5, 0).map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("placementFor", () => {
  it("returns the neighbours of the moved element", () => {
    const ordered = moveItem(items, 0, 2); // b c a d
    expect(placementFor(ordered, "a")).toEqual({ afterId: "c", beforeId: "d" });
  });

  it("uses null at the ends", () => {
    expect(placementFor(items, "a")).toEqual({ afterId: null, beforeId: "b" });
    expect(placementFor(items, "d")).toEqual({ afterId: "c", beforeId: null });
  });

  it("returns null when there is nothing to place against", () => {
    expect(placementFor([{ id: "solo" }], "solo")).toBeNull();
    expect(placementFor(items, "missing")).toBeNull();
  });
});
