import { describe, expect, it } from "vitest";

import { loginPath, safeReturnPath } from "./redirect";

describe("safeReturnPath", () => {
  it("accepts same-app absolute paths", () => {
    expect(safeReturnPath("/p/1/l/2?view=board&task=3")).toBe("/p/1/l/2?view=board&task=3");
  });

  it("rejects external, protocol-relative and login targets", () => {
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "javascript:alert(1)",
      "/login",
      "",
      null,
      42
    ]) {
      expect(safeReturnPath(value)).toBeNull();
    }
  });
});

describe("loginPath", () => {
  it("preserves the current location as ?next=", () => {
    expect(loginPath({ pathname: "/p/1/l/2", search: "?task=3", hash: "" })).toBe(
      "/login?next=%2Fp%2F1%2Fl%2F2%3Ftask%3D3"
    );
  });

  it("omits next for the home page", () => {
    expect(loginPath({ pathname: "/", search: "" })).toBe("/login");
  });
});
