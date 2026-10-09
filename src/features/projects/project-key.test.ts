import { describe, expect, it } from "vitest";

import { projectKeyPattern, sanitizeProjectKey, suggestProjectKey } from "./project-key";

describe("suggestProjectKey", () => {
  it("uses initials for multi-word names, including Vietnamese diacritics", () => {
    expect(suggestProjectKey("Ứng dụng di động")).toBe("UDDD");
    expect(suggestProjectKey("Nesso Mobile App")).toBe("NMA");
    expect(suggestProjectKey("Đào tạo nội bộ")).toBe("DTNB");
  });

  it("uses the first letters of a single word", () => {
    expect(suggestProjectKey("Marketing")).toBe("MARK");
    expect(suggestProjectKey("QA")).toBe("QA");
  });

  it("always returns a valid key or an empty string", () => {
    for (const name of ["a", "x y", "2026 roadmap", "Kế hoạch 2026", "!!!", ""]) {
      const key = suggestProjectKey(name);
      expect(key === "" || projectKeyPattern.test(key)).toBe(true);
    }
    expect(suggestProjectKey("!!!")).toBe("");
  });

  it("avoids keys that already exist", () => {
    expect(suggestProjectKey("Marketing", ["MARK"])).toBe("MARK2");
    expect(suggestProjectKey("Marketing", ["MARK", "MARK2"])).toBe("MARK3");
  });
});

describe("sanitizeProjectKey", () => {
  it("uppercases, strips invalid characters and leading digits, caps length", () => {
    expect(sanitizeProjectKey("ab-c 1")).toBe("ABC1");
    expect(sanitizeProjectKey("12abc")).toBe("ABC");
    expect(sanitizeProjectKey("đường")).toBe("DUONG");
    expect(sanitizeProjectKey("abcdefghijklmnop")).toBe("ABCDEFGHIJKL");
  });
});
