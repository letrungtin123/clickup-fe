import { describe, expect, it } from "vitest";

import type { KnowledgeAuditEntry } from "@/contracts/knowledge";

import { auditActionLabel, auditActionMeta, auditChanges, auditSummary, formatAuditValue } from "./audit";
import { buildCategoryTree, categoryPath, categoryTotal, flattenTree, parentChoices } from "./categories";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

const entry = (overrides: Partial<KnowledgeAuditEntry>): KnowledgeAuditEntry => ({
  id: id(1),
  spaceId: id(2),
  itemId: id(3),
  itemTitle: "Quy trình retouch",
  actor: null,
  action: "ITEM_STATUS_CHANGED",
  before: null,
  after: null,
  reason: null,
  versionNumber: null,
  createdAt: "2026-10-11T08:00:00Z",
  ...overrides
});

describe("audit labels", () => {
  it("has a Vietnamese label for every action", () => {
    for (const meta of Object.values(auditActionMeta)) expect(meta.label).toMatch(/\S/);
    expect(auditActionLabel("ITEM_PURGED")).toBe("Xoá vĩnh viễn");
    expect(auditActionLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("formats values by field", () => {
    expect(formatAuditValue("importance", "critical")).toBe("Rất quan trọng");
    expect(formatAuditValue("accessLevel", "submit")).toBe("Thành viên");
    expect(formatAuditValue("reviewBy", "2026-12-31")).toBe("31/12/2026");
    expect(formatAuditValue("pinned", true)).toBe("Đã ghim");
    expect(formatAuditValue("tags", ["a", "b"])).toBe("a, b");
    expect(formatAuditValue("owner", { id: id(1), displayName: "Linh" })).toBe("Linh");
    expect(formatAuditValue("statusId", id(5), { status: () => "Đã ban hành" })).toBe("Đã ban hành");
    expect(formatAuditValue("title", null)).toBe("—");
    expect(formatAuditValue("sizeBytes", 2048)).toBe("2 KB");
  });
});

describe("auditChanges", () => {
  it("lists changed fields as before → after and skips unchanged / bookkeeping keys", () => {
    const changes = auditChanges(
      entry({
        before: { status: { id: id(1), name: "Nháp" }, importance: "normal", rank: "a", title: "X" },
        after: { status: { id: id(2), name: "Đã ban hành" }, importance: "critical", rank: "b", title: "X" }
      })
    );
    expect(changes).toEqual([
      { key: "status", label: "Trạng thái", before: "Nháp", after: "Đã ban hành" },
      { key: "importance", label: "Mức quan trọng", before: "Bình thường", after: "Rất quan trọng" }
    ]);
  });

  it("prefers readable keys over ids for the same field and handles creations", () => {
    const changes = auditChanges(entry({ before: null, after: { statusId: id(2), statusName: "Nháp", title: "Mới" } }));
    expect(changes.map((change) => change.key)).toEqual(["statusName", "title"]);
    expect(changes[0]).toMatchObject({ before: null, after: "Nháp" });
  });

  it("translates content changes, notes and hides technical ids", () => {
    const changes = auditChanges(
      entry({
        action: "ITEM_CONTENT_UPDATED",
        before: { version: 1 },
        after: { version: 2, changed: ["title", "body"], note: "Sửa bước 3", commentId: id(9) }
      })
    );
    expect(changes).toEqual([
      { key: "version", label: "Phiên bản", before: "v1", after: "v2" },
      { key: "changed", label: "Phần sửa", before: null, after: "Tiêu đề, Nội dung" },
      { key: "note", label: "Ghi chú phiên bản", before: null, after: "Sửa bước 3" }
    ]);
    expect(
      auditChanges(entry({ action: "STATUSES_REPLACED", before: null, after: { reassigned: [{ from: id(1), to: id(2), items: 3 }] } }), {
        status: (value) => (value === id(2) ? "Đã ban hành" : undefined)
      })[0]?.after
    ).toBe("trạng thái đã xoá → Đã ban hành (3 mục)");
  });

  it("summarises an entry in one line", () => {
    expect(auditSummary(entry({ before: { importance: "normal" }, after: { importance: "important" }, action: "ITEM_IMPORTANCE_CHANGED" }))).toBe(
      "Đổi mức quan trọng: Bình thường → Quan trọng"
    );
    expect(auditSummary(entry({ action: "ITEM_DELETED" }))).toBe("Xoá vào thùng rác");
  });

  it("reads a space deletion (SPACE_DELETED) in Vietnamese", () => {
    expect(auditActionMeta.SPACE_DELETED).toMatchObject({ label: "Xoá kho", tone: "danger", scope: "space" });
    const deleted = entry({
      action: "SPACE_DELETED",
      itemId: null,
      itemTitle: null,
      before: { name: "Kho thử", visibility: "private", archivedAt: null, itemCount: 3 },
      after: { deletedAt: "2026-10-11T08:00:00.000Z" }
    });
    expect(auditChanges(deleted)).toEqual([
      { key: "name", label: "Tên", before: "Kho thử", after: null },
      { key: "visibility", label: "Chế độ", before: "Riêng tư", after: null },
      { key: "archivedAt", label: "Lưu trữ", before: "—", after: null },
      { key: "itemCount", label: "Số mục", before: "3", after: null },
      { key: "deletedAt", label: "Xoá kho", before: null, after: "Đã xoá" }
    ]);
    expect(auditSummary(deleted)).toBe("Xoá kho: Kho thử");
  });
});

describe("categories", () => {
  const categories = [
    { id: id(1), parentId: null, name: "Quy trình", rank: "b", itemCount: 2 },
    { id: id(2), parentId: id(1), name: "Retouch", rank: "a", itemCount: 3 },
    { id: id(3), parentId: null, name: "Chính sách", rank: "a", itemCount: 1 },
    { id: id(4), parentId: id(9), name: "Mồ côi", rank: "c", itemCount: 0 }
  ];

  it("builds a 2-level tree ordered by rank", () => {
    const tree = buildCategoryTree(categories);
    expect(tree.map((node) => node.name)).toEqual(["Chính sách", "Quy trình", "Mồ côi"]);
    expect(tree[1]?.children.map((child) => child.name)).toEqual(["Retouch"]);
    expect(flattenTree(tree).map((entry) => `${entry.depth}:${entry.category.name}`)).toEqual([
      "0:Chính sách",
      "0:Quy trình",
      "1:Retouch",
      "0:Mồ côi"
    ]);
    expect(categoryTotal(tree[1] as (typeof tree)[number])).toBe(5);
  });

  it("labels paths and limits moves to two levels", () => {
    expect(categoryPath(categories, id(2))).toBe("Quy trình › Retouch");
    expect(categoryPath(categories, null)).toBeNull();
    expect(parentChoices(categories, categories[0] as (typeof categories)[number])).toEqual([]);
    expect(parentChoices(categories, categories[2] as (typeof categories)[number]).map((entry) => entry.name)).toEqual(["Quy trình"]);
  });
});
