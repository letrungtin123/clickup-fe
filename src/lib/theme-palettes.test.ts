import { describe, expect, it } from "vitest";

import {
  getAccentKeyForMode,
  getAccentPalette,
  gradientAccentOptions,
  solidAccentOptions
} from "./theme-palettes.js";

describe("theme palettes", () => {
  it("keeps the selected accent when it belongs to the requested mode", () => {
    expect(getAccentKeyForMode("solid", "blue")).toBe("blue");
    expect(getAccentKeyForMode("gradient", "blue-violet")).toBe("blue-violet");
  });

  it("falls back to the first palette in the requested mode", () => {
    expect(getAccentKeyForMode("solid", "blue-violet")).toBe(solidAccentOptions[0].key);
    expect(getAccentKeyForMode("gradient", "rose")).toBe(gradientAccentOptions[0].key);
  });

  it("ignores unknown accent keys", () => {
    expect(getAccentPalette("not-a-theme")).toBeUndefined();
  });
});
