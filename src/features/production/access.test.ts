import { describe, expect, it } from "vitest";

import {
  hasDuplicateName,
  matchesQuery,
  nextSortOrder,
  sortOrderChanges,
  visibleRows
} from "./catalog";
import { splitEmails } from "./emails";
import { visibleNavEntries, visibleSettingsPages } from "./nav";
import { hasAnyRole, sortRoles, toggleRole } from "./roles";

describe("roles", () => {
  it("passes ADMIN everywhere and matches any required role", () => {
    expect(hasAnyRole(["ADMIN"], ["ACCOUNT"])).toBe(true);
    expect(hasAnyRole(["LEADER", "QC"], ["QC"])).toBe(true);
    expect(hasAnyRole(["STAFF"], ["ACCOUNT", "LEADER"])).toBe(false);
  });

  it("keeps the canonical order when toggling", () => {
    expect(sortRoles(["STAFF", "ADMIN", "QC"])).toEqual(["ADMIN", "QC", "STAFF"]);
    expect(toggleRole(["QC"], "LEADER")).toEqual(["LEADER", "QC"]);
    expect(toggleRole(["LEADER", "QC"], "QC")).toEqual(["LEADER"]);
  });
});

describe("navigation by role", () => {
  const paths = (roles: Parameters<typeof visibleNavEntries>[0]) =>
    visibleNavEntries(roles).map((entry) => entry.to);
  const slugs = (roles: Parameters<typeof visibleSettingsPages>[0]) =>
    visibleSettingsPages(roles).map((page) => page.slug);

  it("hides the module from non-members", () => {
    expect(paths([])).toEqual([]);
    expect(slugs([])).toEqual([]);
  });

  it("shows the union of menus for multi-role users", () => {
    // Every production member: overview, own scores, ranking and the leave calendar.
    const everyone = [
      "/production",
      "/production/scores",
      "/production/scores/board",
      "/production/leave"
    ];
    expect(paths(["STAFF"])).toEqual(expect.arrayContaining(everyone));
    expect(paths(["STAFF"])).not.toContain("/production/clients");
    expect(paths(["STAFF"])).not.toContain("/production/settings");
    expect(paths(["ACCOUNT", "QC"])).toEqual(
      expect.arrayContaining([...everyone, "/production/clients"])
    );
    expect(paths(["ACCOUNT", "QC"])).not.toContain("/production/settings");
    expect(paths(["ADMIN"])).toEqual(
      expect.arrayContaining([...everyone, "/production/clients", "/production/settings"])
    );
  });

  it("shows jobs, my tasks and the QC queue by role (Phase 2)", () => {
    expect(paths(["STAFF"])).toContain("/production/my-tasks");
    expect(paths(["STAFF"])).not.toContain("/production/jobs");
    expect(paths(["STAFF"])).not.toContain("/production/qc");
    expect(paths(["QC"])).toEqual(
      expect.arrayContaining(["/production/my-tasks", "/production/qc"])
    );
    expect(paths(["ACCOUNT"])).toContain("/production/jobs");
    expect(paths(["ACCOUNT"])).not.toContain("/production/my-tasks");
    expect(paths(["LEADER"])).toEqual(
      expect.arrayContaining(["/production/jobs", "/production/my-tasks"])
    );
    expect(paths(["LEADER"])).not.toContain("/production/qc");
  });

  it("limits settings pages to the right roles", () => {
    expect(slugs(["LEADER", "QC"])).toEqual([]);
    expect(slugs(["ACCOUNT"])).toEqual(["clients"]);
    expect(slugs(["ADMIN"])).toContain("credit-rules");
    expect(slugs(["ADMIN"])).toEqual(expect.arrayContaining(["kpi", "kpi-settlement"]));
    expect(slugs(["ADMIN"])).toHaveLength(14);
  });
});

describe("catalog helpers", () => {
  it("matches every word accent-insensitively", () => {
    expect(matchesQuery("don gia", "Bảng Đơn giá")).toBe(true);
    expect(matchesQuery("fake b", "FAKE-A", "B team")).toBe(true);
    expect(matchesQuery("zzz", "FAKE")).toBe(false);
    expect(matchesQuery("  ", "anything")).toBe(true);
  });

  it("returns only rows whose sort order changes", () => {
    const rows = [
      { id: "a", sortOrder: 20 },
      { id: "b", sortOrder: 10 },
      { id: "c", sortOrder: 30 }
    ];
    expect(sortOrderChanges(rows)).toEqual([
      { item: rows[0], sortOrder: 10 },
      { item: rows[1], sortOrder: 20 }
    ]);
    expect(nextSortOrder(rows)).toBe(40);
    expect(nextSortOrder([])).toBe(10);
  });

  it("hides archived rows unless requested", () => {
    const rows = [
      { id: "a", active: false },
      { id: "b", active: true }
    ];
    expect(visibleRows(rows, false).map((row) => row.id)).toEqual(["b"]);
    expect(visibleRows(rows, true).map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("detects duplicate names case-insensitively", () => {
    const items = [{ id: "1", name: "Ca Sáng" }];
    expect(hasDuplicateName(items, " ca sáng ")).toBe(true);
    expect(hasDuplicateName(items, "ca sáng", "1")).toBe(false);
  });
});

describe("splitEmails", () => {
  it("splits on commas, semicolons, spaces and lines; lower-cases and de-duplicates", () => {
    expect(
      splitEmails("a@example.com, B@Example.com;\nnot-an-email  a@example.com\tc@example.org")
    ).toEqual({
      valid: ["a@example.com", "b@example.com", "c@example.org"],
      invalid: ["not-an-email"]
    });
  });

  it("returns nothing for blank input", () => {
    expect(splitEmails("  \n ")).toEqual({ valid: [], invalid: [] });
  });
});
