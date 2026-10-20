import { describe, expect, it } from "vitest";

import {
  hasDuplicateName,
  matchesQuery,
  nextSortOrder,
  sortOrderChanges,
  visibleRows
} from "./catalog";
import { splitEmails } from "./emails";
import { productionNavEntries, visibleNavEntries, visibleSettingsPages } from "./nav";
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
    // Every production member: overview, own scores and the leave calendar.
    const everyone = ["/production", "/production/scores", "/production/leave"];
    expect(paths(["STAFF"])).toEqual(expect.arrayContaining(everyone));
    expect(paths(["STAFF"])).not.toContain("/production/clients");
    // PD-049: everyone reaches Cấu hình to read "Trạng thái & luồng chuyển".
    expect(paths(["STAFF"])).toContain("/production/settings");
    expect(paths(["ACCOUNT", "QC"])).toEqual(
      expect.arrayContaining([...everyone, "/production/clients"])
    );
    expect(paths(["ACCOUNT", "QC"])).toContain("/production/settings");
    expect(paths(["ADMIN"])).toEqual(
      expect.arrayContaining([...everyone, "/production/clients", "/production/settings"])
    );
    expect(paths(["DIRECTOR"])).toEqual(expect.arrayContaining(everyone));
  });

  it("no Xếp hạng entry: everyone's points are the “Toàn đội” tab of Bảng điểm (PD-069)", () => {
    for (const role of ["STAFF", "QC", "LEADER", "ACCOUNT", "ADMIN", "DIRECTOR"] as const) {
      expect(paths([role])).toContain("/production/scores");
      expect(paths([role])).not.toContain("/production/scores/board");
    }
    expect(productionNavEntries.some((entry) => entry.label === "Xếp hạng")).toBe(false);
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
    // PD-049: "Trạng thái & luồng chuyển" is readable by every role (only the superadmin edits it).
    expect(slugs(["LEADER", "QC"])).toEqual(["workflow"]);
    expect(slugs(["ACCOUNT"])).toEqual(["clients", "workflow"]);
    expect(slugs(["ADMIN"])).toContain("credit-rules");
    expect(slugs(["ADMIN"])).toEqual(expect.arrayContaining(["kpi", "kpi-settlement"]));
    expect(slugs(["ADMIN"])).toHaveLength(15);
    // "Phân quyền Job" moved to Cài đặt → Vai trò & phân quyền (PD-042).
    expect(slugs(["ADMIN"])).not.toContain("job-permissions");
  });
});

describe("navigation by feature (PD-065)", () => {
  const paths = (roles: Parameters<typeof visibleNavEntries>[0]) =>
    visibleNavEntries(roles).map((entry) => entry.to);
  const withFeatures = (
    roles: Parameters<typeof visibleNavEntries>[0],
    features: NonNullable<Parameters<typeof visibleNavEntries>[1]>["features"]
  ) => visibleNavEntries(roles, { features }).map((entry) => entry.to);

  it("a Director sees Bất thường and Quản trị số liệu; an Admin without those features does not", () => {
    const director = withFeatures(
      ["DIRECTOR"],
      [
        "view_others_scores",
        "view_others_money",
        "leader_dashboard",
        "admin_dashboard",
        "anomalies"
      ]
    );
    expect(director).toEqual(
      expect.arrayContaining([
        "/production/anomalies",
        "/production/admin",
        "/production/dashboard"
      ])
    );
    expect(director).not.toContain("/production/qc");
    const admin = withFeatures(
      ["ADMIN"],
      ["qc_queue", "view_others_scores", "leader_dashboard", "leave_approval", "clients"]
    );
    expect(admin).not.toContain("/production/anomalies");
    expect(admin).not.toContain("/production/admin");
    expect(admin).toEqual(
      expect.arrayContaining(["/production/dashboard", "/production/qc", "/production/clients"])
    );
  });

  it("the features win over the roles once known", () => {
    expect(withFeatures(["STAFF"], ["qc_queue", "anomalies"])).toEqual(
      expect.arrayContaining(["/production/qc", "/production/anomalies"])
    );
    expect(withFeatures(["QC"], [])).not.toContain("/production/qc");
    expect(withFeatures(["ACCOUNT"], [])).not.toContain("/production/clients");
    // Pages that are not features keep their roles.
    expect(withFeatures(["ACCOUNT"], [])).toContain("/production/jobs");
    expect(withFeatures(["STAFF"], [])).toContain("/production/my-tasks");
  });

  it("falls back to the default matrix of the roles while the features are unknown", () => {
    expect(paths(["DIRECTOR"])).toEqual(
      expect.arrayContaining([
        "/production/anomalies",
        "/production/admin",
        "/production/dashboard"
      ])
    );
    expect(paths(["ADMIN"])).not.toContain("/production/anomalies");
    expect(paths(["ADMIN"])).not.toContain("/production/admin");
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
