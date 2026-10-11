import { describe, expect, it } from "vitest";

import type { KnowledgeAuditEntry } from "@/contracts/knowledge";
import { ApiError } from "@/lib/api/errors";

import { auditActionMeta } from "../../model/audit";
import {
  activeAuditFilterCount,
  auditActionGroups,
  auditActionsLabel,
  auditActorChoices,
  auditEntryLinks,
  auditExportFileName,
  auditItemTitle,
  emptyAuditFilters,
  foldText,
  isExportUnsupported,
  matchesPerson,
  purgedItemIds,
  toggleAuditAction,
  uniqueById,
  userNameResolver,
  withAuditRange
} from "./audit-view";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const spaceId = id(900);

const user = (n: number, displayName: string, email: string | null = null) => ({
  id: id(n),
  displayName,
  email,
  avatarUrl: null
});

const entry = (overrides: Partial<KnowledgeAuditEntry>): KnowledgeAuditEntry => ({
  id: id(1),
  spaceId,
  itemId: id(3),
  itemTitle: "Quy trình retouch",
  actor: null,
  action: "ITEM_CONTENT_UPDATED",
  before: null,
  after: null,
  reason: null,
  versionNumber: null,
  createdAt: "2026-10-11T08:00:00Z",
  ...overrides
});

describe("audit action filter", () => {
  it("groups every action exactly once, item actions first", () => {
    expect(auditActionGroups.map((group) => group.label)).toEqual(["Mục", "Kho"]);
    const all = auditActionGroups.flatMap((group) => group.actions);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(Object.keys(auditActionMeta).length);
    for (const group of auditActionGroups) {
      for (const action of group.actions) expect(auditActionMeta[action].scope).toBe(group.scope);
    }
  });

  it("labels the selection", () => {
    expect(auditActionsLabel([])).toBe("Mọi thao tác");
    expect(auditActionsLabel(["ITEM_PURGED"])).toBe("Xoá vĩnh viễn");
    expect(auditActionsLabel(["ITEM_PURGED", "ITEM_CREATED"])).toBe("2 loại thao tác");
  });

  it("toggles an action and keeps menu order", () => {
    expect(toggleAuditAction([], "ITEM_PURGED")).toEqual(["ITEM_PURGED"]);
    expect(toggleAuditAction(["ITEM_PURGED"], "SPACE_CREATED")).toEqual(["SPACE_CREATED", "ITEM_PURGED"]);
    expect(toggleAuditAction(["SPACE_CREATED", "ITEM_PURGED"], "SPACE_CREATED")).toEqual(["ITEM_PURGED"]);
  });
});

describe("audit filters", () => {
  it("counts narrowed dimensions", () => {
    expect(activeAuditFilterCount(emptyAuditFilters)).toBe(0);
    expect(
      activeAuditFilterCount({
        actorId: id(1),
        actions: ["ITEM_CREATED", "ITEM_PURGED"],
        itemId: id(2),
        from: "2026-10-01",
        to: null
      })
    ).toBe(4);
    expect(activeAuditFilterCount({ ...emptyAuditFilters, to: "2026-10-01" })).toBe(1);
  });

  it("keeps the range ordered", () => {
    const base = { ...emptyAuditFilters, to: "2026-10-05" };
    expect(withAuditRange(base, "from", "2026-10-01")).toMatchObject({ from: "2026-10-01", to: "2026-10-05" });
    expect(withAuditRange(base, "from", "2026-10-10")).toMatchObject({ from: "2026-10-05", to: "2026-10-10" });
    expect(withAuditRange({ ...base, from: "2026-10-01" }, "to", null)).toMatchObject({ from: "2026-10-01", to: null });
  });
});

describe("audit rows", () => {
  it("dedupes entries across pages", () => {
    const a = entry({ id: id(1) });
    const b = entry({ id: id(2) });
    expect(uniqueById([{ items: [a, b] }, { items: [b] }]).map((row) => row.id)).toEqual([id(1), id(2)]);
    expect(uniqueById(undefined)).toEqual([]);
  });

  it("links rows to the item and the exact version", () => {
    const purged = new Set<string>();
    expect(auditEntryLinks(entry({ versionNumber: 4 }), spaceId, purged)).toEqual({
      item: `/k/${spaceId}/i/${id(3)}`,
      version: `/k/${spaceId}/i/${id(3)}?tab=history&version=4`
    });
    expect(auditEntryLinks(entry({ versionNumber: null }), spaceId, purged)).toEqual({
      item: `/k/${spaceId}/i/${id(3)}`,
      version: null
    });
    expect(auditEntryLinks(entry({ itemId: null, action: "MEMBER_ADDED" }), spaceId, purged)).toEqual({
      item: null,
      version: null
    });
  });

  it("does not link purged items", () => {
    const rows = [entry({ id: id(10), action: "ITEM_PURGED" }), entry({ id: id(11), versionNumber: 2 })];
    const purged = purgedItemIds(rows);
    expect([...purged]).toEqual([id(3)]);
    expect(auditEntryLinks(rows[1] ?? entry({}), spaceId, purged)).toEqual({ item: null, version: null });
    expect(auditEntryLinks(entry({ action: "ITEM_PURGED" }), spaceId, new Set())).toEqual({ item: null, version: null });
  });

  it("finds the filtered item's title", () => {
    const rows = [entry({ itemId: id(4), itemTitle: "  " }), entry({ itemId: id(4), itemTitle: "Chính sách nghỉ phép" })];
    expect(auditItemTitle(rows, id(4))).toBe("Chính sách nghỉ phép");
    expect(auditItemTitle(rows, id(5))).toBeNull();
    expect(auditItemTitle(rows, null)).toBeNull();
  });
});

describe("audit people", () => {
  it("merges members and actors, alphabetically", () => {
    const members = [user(1, "Trang"), user(2, "An")];
    const rows = [entry({ actor: user(3, "Bảo") }), entry({ actor: user(1, "Trang") }), entry({ actor: null })];
    expect(auditActorChoices(members, rows).map((person) => person.displayName)).toEqual(["An", "Bảo", "Trang"]);
  });

  it("searches without diacritics", () => {
    expect(foldText(" Đỗ Thị Hường ")).toBe("do thi huong");
    expect(matchesPerson(user(1, "Nguyễn Văn Đức", "user1@example.test"), "duc")).toBe(true);
    expect(matchesPerson(user(1, "Nguyễn Văn Đức"), "vă")).toBe(true);
    expect(matchesPerson(user(1, "Lê Linh", "user2@example.test"), "example")).toBe(true);
    expect(matchesPerson(user(1, "Lê Linh"), "trang")).toBe(false);
    expect(matchesPerson(user(1, "Lê Linh"), "  ")).toBe(true);
  });

  it("resolves user ids to names", () => {
    const resolve = userNameResolver([user(1, "Linh")]);
    expect(resolve(id(1))).toBe("Linh");
    expect(resolve(id(2))).toBeUndefined();
  });
});

describe("audit export", () => {
  it("names the file after the space and the day", () => {
    expect(auditExportFileName("  Quy trình   sản xuất ", new Date(2026, 9, 11, 9, 30))).toBe(
      "Nhật ký kho Quy trình sản xuất 2026-10-11.xlsx"
    );
    expect(auditExportFileName("", new Date(2026, 0, 2))).toBe("Nhật ký kho tri thức 2026-01-02.xlsx");
  });

  it("recognizes a missing export endpoint", () => {
    expect(isExportUnsupported(new ApiError({ status: 404, code: "NOT_FOUND", message: "x" }))).toBe(true);
    expect(isExportUnsupported(new ApiError({ status: 405, code: "INVALID_RESPONSE", message: "x" }))).toBe(true);
    expect(isExportUnsupported(new ApiError({ status: 404, code: "KNOWLEDGE_SPACE_NOT_FOUND", message: "x" }))).toBe(
      false
    );
    expect(isExportUnsupported(new ApiError({ status: 500, code: "INTERNAL_SERVER_ERROR", message: "x" }))).toBe(false);
    expect(isExportUnsupported(new Error("boom"))).toBe(false);
  });
});
