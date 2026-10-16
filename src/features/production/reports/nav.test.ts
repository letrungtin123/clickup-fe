import { describe, expect, it } from "vitest";

import { visibleNavEntries } from "../nav";

describe("Phase 5 navigation", () => {
  const paths = (roles: Parameters<typeof visibleNavEntries>[0]) =>
    visibleNavEntries(roles).map((entry) => entry.to);

  it("shows the dashboard and anomalies to Leaders, not to staff / QC / account", () => {
    const leader = ["/production/dashboard", "/production/anomalies"];
    expect(paths(["LEADER"])).toEqual(expect.arrayContaining(leader));
    expect(paths(["LEADER"])).not.toContain("/production/admin");
    for (const role of ["STAFF", "QC", "ACCOUNT"] as const) {
      for (const path of [...leader, "/production/admin"])
        expect(paths([role])).not.toContain(path);
    }
  });

  it("shows every Phase 5 page to Admins", () => {
    expect(paths(["ADMIN"])).toEqual(
      expect.arrayContaining(["/production/dashboard", "/production/admin", "/production/anomalies"])
    );
  });

  it("hides Báo cáo from the menu for everyone (owner, 2026-10-16)", () => {
    for (const role of ["ADMIN", "LEADER", "STAFF", "QC", "ACCOUNT"] as const) {
      expect(paths([role])).not.toContain("/production/reports");
    }
  });
});
