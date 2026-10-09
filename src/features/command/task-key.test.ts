import { describe, expect, it } from "vitest";

import { asTaskKey, findTaskByKey } from "./task-key";

describe("task keys in the command palette (WK-50)", () => {
  it("recognizes exact task keys only", () => {
    expect(asTaskKey(" web-12 ")).toBe("WEB-12");
    expect(asTaskKey("WEB-012")).toBe("WEB-12");
    expect(asTaskKey("web 12")).toBeNull();
    expect(asTaskKey("thiết kế")).toBeNull();
    expect(asTaskKey("W-1")).toBeNull();
  });

  it("finds the exact hit among ranked search results", () => {
    const hits = [{ key: "WEB-120", id: "a" }, { key: "WEB-12", id: "b" }];
    expect(findTaskByKey(hits, asTaskKey("web-12"))?.id).toBe("b");
    expect(findTaskByKey(hits, asTaskKey("web-13"))).toBeUndefined();
    expect(findTaskByKey(undefined, "WEB-12")).toBeUndefined();
  });
});
