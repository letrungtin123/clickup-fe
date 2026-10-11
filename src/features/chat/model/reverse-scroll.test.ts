import { describe, expect, it } from "vitest";

import { reverseOffsetFrom, reverseScrollTopFor } from "./reverse-scroll";

// A conversation 5000px tall in a 800px viewport: offsets run 0 (bottom) … 4200 (top).
const sh = 5000;
const ch = 800;

describe("reverseOffsetFrom", () => {
  it("negative engines: 0 at the bottom, negative upwards", () => {
    expect(reverseOffsetFrom(0, sh, ch, "negative")).toBe(0);
    expect(reverseOffsetFrom(-1500, sh, ch, "negative")).toBe(1500);
    expect(reverseOffsetFrom(-4200, sh, ch, "negative")).toBe(4200);
  });

  it("iOS rubber-band at the bottom (positive scrollTop) still reads as the bottom", () => {
    expect(reverseOffsetFrom(37, sh, ch, "negative")).toBe(0);
  });

  it("overscroll past the top is clamped to the top", () => {
    expect(reverseOffsetFrom(-4260, sh, ch, "negative")).toBe(4200);
  });

  it("legacy positive engines measure from the top", () => {
    expect(reverseOffsetFrom(4200, sh, ch, "positive")).toBe(0);
    expect(reverseOffsetFrom(0, sh, ch, "positive")).toBe(4200);
    expect(reverseOffsetFrom(4250, sh, ch, "positive")).toBe(0);
  });

  it("content shorter than the viewport has nothing to scroll", () => {
    expect(reverseOffsetFrom(-20, 600, ch, "negative")).toBe(0);
  });
});

describe("reverseScrollTopFor", () => {
  it("round-trips with reverseOffsetFrom in both modes", () => {
    for (const mode of ["negative", "positive"] as const) {
      for (const offset of [0, 1, 1500, 4200]) {
        expect(reverseOffsetFrom(reverseScrollTopFor(offset, sh, ch, mode), sh, ch, mode)).toBe(offset);
      }
    }
  });

  it("clamps targets outside the scrollable range", () => {
    expect(reverseScrollTopFor(9999, sh, ch, "negative")).toBe(-4200);
    expect(reverseScrollTopFor(-5, sh, ch, "negative")).toBe(0);
  });
});
