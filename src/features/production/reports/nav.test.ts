import { describe, expect, it } from "vitest";

import { visibleNavEntries } from "../nav";

describe("Phase 5 navigation (features by default, PD-065)", () => {
  const paths = (roles: Parameters<typeof visibleNavEntries>[0]) =>
    visibleNavEntries(roles).map((entry) => entry.to);

  it("shows the dashboard to Leaders, not Bất thường / Quản trị số liệu; nothing to staff / QC / account", () => {
    expect(paths(["LEADER"])).toContain("/production/dashboard");
    expect(paths(["LEADER"])).not.toContain("/production/anomalies");
    expect(paths(["LEADER"])).not.toContain("/production/admin");
    for (const role of ["STAFF", "QC", "ACCOUNT"] as const) {
      for (const path of ["/production/dashboard", "/production/anomalies", "/production/admin"])
        expect(paths([role])).not.toContain(path);
    }
  });

  it("shows every Phase 5 page to Directors; Admins get the dashboard only", () => {
    expect(paths(["DIRECTOR"])).toEqual(
      expect.arrayContaining([
        "/production/dashboard",
        "/production/admin",
        "/production/anomalies"
      ])
    );
    expect(paths(["ADMIN"])).toContain("/production/dashboard");
    expect(paths(["ADMIN"])).not.toContain("/production/admin");
    expect(paths(["ADMIN"])).not.toContain("/production/anomalies");
  });

  it("hides Báo cáo from the menu for everyone (owner, 2026-10-16)", () => {
    for (const role of ["ADMIN", "LEADER", "STAFF", "QC", "ACCOUNT", "DIRECTOR"] as const) {
      expect(paths([role])).not.toContain("/production/reports");
    }
  });
});
