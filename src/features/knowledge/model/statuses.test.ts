import { describe, expect, it } from "vitest";

import type { KnowledgeStatus } from "@/contracts/knowledge";

import {
  buildReplaceStatusesRequest,
  defaultReassign,
  groupStatuses,
  insertStatusDraft,
  isReassignComplete,
  maxStatuses,
  moveStatusDraft,
  newStatusDraft,
  nextStatusColor,
  normalizeStatusName,
  reassignTargets,
  regroupedStatuses,
  removedStatuses,
  statusDraftsChanged,
  statusesSignature,
  toStatusDrafts,
  validateStatusDrafts,
  type StatusDraft
} from "./statuses";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

/** The default set of a new space (PD-031 §04), deliberately stored out of order. */
const saved: KnowledgeStatus[] = [
  { id: id(3), name: "Đã ban hành", color: "green", group: "active", position: 2 },
  { id: id(1), name: "Nháp", color: "slate", group: "draft", position: 0 },
  { id: id(5), name: "Hết hiệu lực", color: "gray", group: "retired", position: 4 },
  { id: id(2), name: "Chờ duyệt", color: "amber", group: "draft", position: 1 },
  { id: id(4), name: "Cần cập nhật", color: "orange", group: "active", position: 3 }
];

const codes = (drafts: StatusDraft[], current: KnowledgeStatus[] = []) =>
  validateStatusDrafts(drafts, current).map((issue) => issue.code);

describe("drafts", () => {
  it("start from the saved list in position order, keyed by id", () => {
    const drafts = toStatusDrafts(saved);
    expect(drafts.map((draft) => draft.name)).toEqual([
      "Nháp",
      "Chờ duyệt",
      "Đã ban hành",
      "Cần cập nhật",
      "Hết hiệu lực"
    ]);
    expect(drafts[0]).toEqual({
      key: id(1),
      id: id(1),
      name: "Nháp",
      color: "slate",
      group: "draft"
    });
  });

  it("are unchanged until something meaningful changes", () => {
    const drafts = toStatusDrafts(saved);
    expect(statusDraftsChanged(saved, drafts)).toBe(false);
    expect(
      statusDraftsChanged(
        saved,
        drafts.map((draft) => ({ ...draft, name: ` ${draft.name} ` }))
      )
    ).toBe(false);
    expect(statusDraftsChanged(saved, moveStatusDraft(drafts, id(2), -1))).toBe(true);
    expect(
      statusDraftsChanged(
        saved,
        drafts.map((draft, index) => (index === 0 ? { ...draft, color: "red" } : draft))
      )
    ).toBe(true);
    expect(statusDraftsChanged(saved, drafts.slice(1))).toBe(true);
  });

  it("signature follows the saved order, not the array order", () => {
    expect(statusesSignature(saved)).toBe(statusesSignature([...saved].reverse()));
    expect(statusesSignature(saved)).not.toBe(
      statusesSignature(
        saved.map((status) => (status.id === id(1) ? { ...status, name: "Bản thảo" } : status))
      )
    );
  });

  it("new rows go to an empty group first, else Bản nháp, with an unused color", () => {
    const drafts = toStatusDrafts(saved);
    const fresh = newStatusDraft("new-1", drafts);
    expect(fresh).toEqual({ key: "new-1", name: "", color: "sky", group: "draft" });
    const noRetired = drafts.filter((draft) => draft.group !== "retired");
    expect(newStatusDraft("new-2", noRetired).group).toBe("retired");
  });

  it("picks the first color nobody uses yet", () => {
    expect(nextStatusColor([{ color: "sky" }, { color: "violet" }])).toBe("teal");
  });

  it("inserts a new row after the last row of its group", () => {
    const drafts = toStatusDrafts(saved);
    const inserted = insertStatusDraft(drafts, {
      key: "new-1",
      name: "",
      color: "sky",
      group: "draft"
    });
    expect(inserted.map((draft) => draft.key)).toEqual([
      id(1),
      id(2),
      "new-1",
      id(3),
      id(4),
      id(5)
    ]);
    const noRetired = drafts.filter((draft) => draft.group !== "retired");
    const appended = insertStatusDraft(noRetired, {
      key: "new-2",
      name: "",
      color: "sky",
      group: "retired"
    });
    expect(appended.at(-1)?.key).toBe("new-2");
  });

  it("moves one step with the keyboard and stays put at the ends", () => {
    const drafts = toStatusDrafts(saved);
    expect(
      moveStatusDraft(drafts, id(2), -1)
        .map((draft) => draft.key)
        .slice(0, 2)
    ).toEqual([id(2), id(1)]);
    expect(moveStatusDraft(drafts, id(1), -1)).toEqual(drafts);
    expect(moveStatusDraft(drafts, id(5), 1)).toEqual(drafts);
    expect(moveStatusDraft(drafts, "missing", 1)).toEqual(drafts);
  });
});

describe("validateStatusDrafts", () => {
  it("accepts the default set", () => {
    expect(validateStatusDrafts(toStatusDrafts(saved), saved)).toEqual([]);
  });

  it("needs 3 to 12 statuses", () => {
    const drafts = toStatusDrafts(saved);
    expect(codes(drafts.slice(0, 2))).toContain("too-few");
    const many: StatusDraft[] = Array.from({ length: maxStatuses + 1 }, (_, index) => ({
      key: `k${index}`,
      name: `Trạng thái ${index}`,
      color: "blue",
      group: index === 0 ? "draft" : index === 1 ? "retired" : "active"
    }));
    expect(codes(many)).toEqual(["too-many"]);
    expect(codes(many.slice(0, maxStatuses))).toEqual([]);
  });

  it("flags empty, invisible, invalid and too long names on their rows", () => {
    const drafts = toStatusDrafts(saved);
    const broken = drafts.map((draft, index) =>
      index === 0
        ? { ...draft, name: "   " }
        : index === 1
          ? { ...draft, name: "​" }
          : index === 2
            ? { ...draft, name: "Ban‮hành" }
            : index === 3
              ? { ...draft, name: "x".repeat(41) }
              : draft
    );
    const issues = validateStatusDrafts(broken);
    expect(issues.find((issue) => issue.code === "empty-name")?.keys).toEqual([id(1), id(2)]);
    expect(issues.find((issue) => issue.code === "invalid-name")?.keys).toEqual([id(3)]);
    expect(issues.find((issue) => issue.code === "name-too-long")?.keys).toEqual([id(4)]);
  });

  it("treats names differing only by case, spacing or accent encoding as duplicates", () => {
    const drafts = toStatusDrafts(saved);
    const decomposed = "Nháp".normalize("NFD");
    const renamed = drafts.map((draft) =>
      draft.key === id(2) ? { ...draft, name: ` ${decomposed.toUpperCase()} ` } : draft
    );
    const issue = validateStatusDrafts(renamed).find((entry) => entry.code === "duplicate-name");
    expect(issue?.keys).toEqual([id(1), id(2)]);
    expect(normalizeStatusName("  Chờ   DUYỆT ")).toBe(normalizeStatusName("chờ duyệt"));
  });

  it("needs at least one status per group and names the missing ones", () => {
    const drafts = toStatusDrafts(saved).map((draft) =>
      draft.group === "retired" ? { ...draft, group: "active" as const } : draft
    );
    const issue = validateStatusDrafts(drafts).find((entry) => entry.code === "missing-group");
    expect(issue?.message).toContain("Hết hiệu lực");
    expect(issue?.message).not.toContain("Bản nháp");
  });

  it("needs one saved status to stay when the list is replaced", () => {
    const fresh: StatusDraft[] = [
      { key: "a", name: "Một", color: "blue", group: "draft" },
      { key: "b", name: "Hai", color: "green", group: "active" },
      { key: "c", name: "Ba", color: "gray", group: "retired" }
    ];
    expect(codes(fresh, saved)).toEqual(["no-kept-status"]);
    expect(codes(fresh)).toEqual([]);
    expect(codes([...fresh, toStatusDrafts(saved)[0] as StatusDraft], saved)).toEqual([]);
  });
});

describe("reassignment of removed statuses", () => {
  const drafts = toStatusDrafts(saved).filter((draft) => draft.id !== id(2) && draft.id !== id(4));
  const withNew = insertStatusDraft(drafts, {
    key: "new-1",
    name: "Đang soạn",
    color: "sky",
    group: "draft"
  });
  const removed = removedStatuses(saved, withNew);

  it("lists removed statuses in saved order", () => {
    expect(removed.map((status) => status.id)).toEqual([id(2), id(4)]);
  });

  it("only offers kept existing statuses (new ones have no id yet)", () => {
    expect(reassignTargets(withNew).map((draft) => draft.id)).toEqual([id(1), id(3), id(5)]);
  });

  it("defaults to the first kept status of the same group", () => {
    expect(defaultReassign(removed, withNew)).toEqual({ [id(2)]: id(1), [id(4)]: id(3) });
  });

  it("falls back to the first kept status when the group has none left", () => {
    const onlyRetiredKept = withNew.filter((draft) => draft.id === undefined || draft.id === id(5));
    expect(defaultReassign(removed, onlyRetiredKept)).toEqual({ [id(2)]: id(5), [id(4)]: id(5) });
    expect(defaultReassign(removed, [])).toEqual({});
  });

  it("is complete only when every removed status points at a kept status", () => {
    expect(isReassignComplete(removed, { [id(2)]: id(1), [id(4)]: id(3) }, withNew)).toBe(true);
    expect(isReassignComplete(removed, { [id(2)]: id(1) }, withNew)).toBe(false);
    expect(isReassignComplete(removed, { [id(2)]: id(1), [id(4)]: id(2) }, withNew)).toBe(false);
    expect(isReassignComplete([], {}, withNew)).toBe(true);
  });

  it("builds the PUT body in display order with trimmed names and valid targets only", () => {
    const renamed = withNew.map((draft) =>
      draft.id === id(1) ? { ...draft, name: "  Bản thảo " } : draft
    );
    const body = buildReplaceStatusesRequest(renamed, removed, {
      [id(2)]: id(1),
      [id(4)]: id(4),
      [id(9)]: id(3)
    });
    expect(body.statuses).toEqual([
      { id: id(1), name: "Bản thảo", color: "slate", group: "draft" },
      { name: "Đang soạn", color: "sky", group: "draft" },
      { id: id(3), name: "Đã ban hành", color: "green", group: "active" },
      { id: id(5), name: "Hết hiệu lực", color: "gray", group: "retired" }
    ]);
    expect(body.statuses[1]).not.toHaveProperty("id");
    expect(body.reassign).toEqual({ [id(2)]: id(1) });
  });
});

describe("helpers for the screens", () => {
  it("reports kept statuses that change group", () => {
    const drafts = toStatusDrafts(saved).map((draft) =>
      draft.id === id(4) ? { ...draft, group: "draft" as const, name: "" } : draft
    );
    expect(regroupedStatuses(saved, drafts)).toEqual([
      { key: id(4), name: "Cần cập nhật", from: "active", to: "draft" }
    ]);
  });

  it("groups statuses for the read-only view", () => {
    const groups = groupStatuses(saved);
    expect(groups.map((entry) => entry.group)).toEqual(["draft", "active", "retired"]);
    expect(groups[0]?.statuses.map((status) => status.name)).toEqual(["Nháp", "Chờ duyệt"]);
    expect(groups[2]?.statuses.map((status) => status.name)).toEqual(["Hết hiệu lực"]);
  });
});
