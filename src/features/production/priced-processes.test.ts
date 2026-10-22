import { describe, expect, it } from "vitest";

import {
  isUnpriced,
  noPriceMessage,
  pricedOptions,
  pricedProcessIds,
  projectUnpriced,
  unpricedHint
} from "./priced-processes";

// PD-080b — only priced processes (fake ids; the repository is public).
const PROJECT = "project-a";
const rules = [
  { projectId: PROJECT, processId: "retouch" },
  { projectId: PROJECT, processId: "checking" },
  { projectId: "project-b", processId: "blend" }
];
const options = [
  { id: "retouch", label: "Retouch" },
  { id: "blend", label: "Blend" },
  { id: "checking", label: "Checking" }
];

describe("priced processes (PD-080b)", () => {
  it("the project's priced ids in that day's rules; unknown (null) without rules or a project", () => {
    expect([...(pricedProcessIds(rules, PROJECT) ?? [])]).toEqual(["retouch", "checking"]);
    expect(pricedProcessIds(undefined, PROJECT)).toBeNull();
    expect(pricedProcessIds(rules, null)).toBeNull();
    expect(pricedProcessIds(rules, "project-c")?.size).toBe(0);
  });

  it("the picker keeps the priced options (all while unknown) and the value a task already has", () => {
    const priced = pricedProcessIds(rules, PROJECT);
    expect(pricedOptions(options, priced).map((option) => option.id)).toEqual(["retouch", "checking"]);
    expect(pricedOptions(options, null)).toHaveLength(3);
    expect(pricedOptions(options, priced, "blend").map((option) => option.id)).toEqual(["retouch", "blend", "checking"]);
  });

  it("no price at all: the message; a chosen unpriced process is cleared with a hint naming the day", () => {
    expect(projectUnpriced(pricedProcessIds(rules, "project-c"))).toBe(true);
    expect(projectUnpriced(pricedProcessIds(rules, PROJECT))).toBe(false);
    expect(projectUnpriced(null)).toBe(false);
    expect(noPriceMessage).toBe("Project chưa có đơn giá — liên hệ Quản trị");
    const priced = pricedProcessIds(rules, PROJECT);
    expect(isUnpriced("blend", priced)).toBe(true);
    expect(isUnpriced("retouch", priced)).toBe(false);
    expect(isUnpriced(null, priced)).toBe(false);
    expect(isUnpriced("blend", null)).toBe(false);
    expect(unpricedHint("Blend", "2026-10-26")).toBe("“Blend” chưa có đơn giá ngày 26/10 — chọn lại quy trình.");
  });
});
