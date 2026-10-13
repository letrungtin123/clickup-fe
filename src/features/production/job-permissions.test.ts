import { describe, expect, it } from "vitest";

import {
  defaultJobPermissions,
  jobPermissionActions,
  type JobPermissionMatrix
} from "@/contracts/production-catalog";

import {
  jobActionLabels,
  jobScopeChanges,
  jobScopeItems,
  jobScopeMeaning,
  sameJobPermissions,
  withJobScope
} from "./job-permissions";

describe("job permission matrix helpers (PD-036)", () => {
  it("labels the scopes narrowest first and every action", () => {
    expect(jobScopeItems).toEqual([
      { value: "none", label: "Không" },
      { value: "own", label: "Của mình" },
      { value: "all", label: "Tất cả" }
    ]);
    expect(jobPermissionActions.map((action) => jobActionLabels[action])).toEqual([
      "Xem",
      "Tạo",
      "Sửa",
      "Xoá"
    ]);
    for (const action of jobPermissionActions) {
      expect(jobScopeMeaning[action].own).not.toBe("");
      expect(jobScopeMeaning[action].all).not.toBe("");
    }
  });

  it("changes one cell without touching the input", () => {
    const next = withJobScope(defaultJobPermissions, "STAFF", "view", "all");
    expect(next.STAFF).toEqual({ view: "all", create: "own", update: "own", delete: "own" });
    expect(next.LEADER).toBe(defaultJobPermissions.LEADER);
    expect(defaultJobPermissions.STAFF.view).toBe("own");
  });

  it("lists the changed cells in table order and compares matrices by value", () => {
    const copy: JobPermissionMatrix = JSON.parse(
      JSON.stringify(defaultJobPermissions)
    ) as JobPermissionMatrix;
    expect(sameJobPermissions(copy, defaultJobPermissions)).toBe(true);
    expect(jobScopeChanges(copy, defaultJobPermissions)).toEqual([]);

    const edited = withJobScope(
      withJobScope(defaultJobPermissions, "QC", "delete", "none"),
      "ACCOUNT",
      "update",
      "own"
    );
    expect(sameJobPermissions(edited, defaultJobPermissions)).toBe(false);
    expect(jobScopeChanges(defaultJobPermissions, edited)).toEqual([
      { role: "ACCOUNT", action: "update", from: "all", to: "own" },
      { role: "QC", action: "delete", from: "own", to: "none" }
    ]);
    // Setting a cell back to its saved value is not a change.
    expect(
      sameJobPermissions(
        withJobScope(edited, "QC", "delete", "own"),
        withJobScope(defaultJobPermissions, "ACCOUNT", "update", "own")
      )
    ).toBe(true);
  });
});
