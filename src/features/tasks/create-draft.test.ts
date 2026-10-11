import { describe, expect, it } from "vitest";

import { plainTextToDoc } from "@/components/shared/rich-text/helpers";

import { isCreateTaskDraftDirty, type CreateTaskDraft } from "./create-draft";

const blank: CreateTaskDraft = {
  title: "",
  description: null,
  statusId: undefined,
  priority: "normal",
  assigneeIds: [],
  startAt: null,
  dueAt: null
};

describe("create-task draft (P3)", () => {
  it("is clean when nothing was entered", () => {
    expect(isCreateTaskDraftDirty(blank)).toBe(false);
    expect(isCreateTaskDraftDirty({ ...blank, title: "   " })).toBe(false);
    expect(isCreateTaskDraftDirty({ ...blank, description: { type: "doc", content: [] } })).toBe(false);
    expect(isCreateTaskDraftDirty({ ...blank, description: plainTextToDoc("  ") })).toBe(false);
  });

  it("is dirty once a title or a description is typed", () => {
    expect(isCreateTaskDraftDirty({ ...blank, title: "Gọi khách" })).toBe(true);
    expect(isCreateTaskDraftDirty({ ...blank, description: plainTextToDoc("Ghi chú") })).toBe(true);
  });

  it("is dirty once a property is picked", () => {
    expect(isCreateTaskDraftDirty({ ...blank, assigneeIds: ["u1"] })).toBe(true);
    expect(isCreateTaskDraftDirty({ ...blank, priority: "high" })).toBe(true);
    expect(isCreateTaskDraftDirty({ ...blank, startAt: "2026-10-12T00:00:00.000Z" })).toBe(true);
    expect(isCreateTaskDraftDirty({ ...blank, dueAt: "2026-10-12T00:00:00.000Z" })).toBe(true);
  });

  it("treats the pre-selected status (from a group's +) as untouched", () => {
    expect(isCreateTaskDraftDirty({ ...blank, statusId: "s1" }, "s1")).toBe(false);
    expect(isCreateTaskDraftDirty({ ...blank, statusId: "s2" }, "s1")).toBe(true);
    expect(isCreateTaskDraftDirty({ ...blank, statusId: "s2" })).toBe(true);
  });
});
