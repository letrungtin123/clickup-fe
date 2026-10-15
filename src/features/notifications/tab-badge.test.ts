import { describe, expect, it } from "vitest";

import { badgeLabel, titleWithCount } from "./tab-badge";

describe("browser tab badge", () => {
  it("labels 1–9, then 9+", () => {
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
  });

  it("prefixes the title with the count, replacing an older prefix, and removes it at 0", () => {
    expect(titleWithCount("Nesso Work", 3)).toBe("(3) Nesso Work");
    expect(titleWithCount("(3) Nesso Work", 5)).toBe("(5) Nesso Work");
    expect(titleWithCount("(5) Nesso Work", 0)).toBe("Nesso Work");
    expect(titleWithCount("Nesso Work", 150)).toBe("(99+) Nesso Work");
    expect(titleWithCount("(99+) Nesso Work", 2)).toBe("(2) Nesso Work");
  });
});
