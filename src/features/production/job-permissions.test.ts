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
  jobScopeNotes,
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
    const next = withJobScope(defaultJobPermissions, "STAFF", "update", "all");
    expect(next.STAFF).toEqual({ ...defaultJobPermissions.STAFF, update: "all" });
    expect(next.LEADER).toBe(defaultJobPermissions.LEADER);
    expect(defaultJobPermissions.STAFF.update).toBe("own");
  });

  it("explains “Không” for create and that a worker's own subtasks stay deletable (PD-047)", () => {
    expect(jobScopeNotes.create).toContain("“Chia task”");
    expect(jobScopeNotes.delete).toContain("Subtask của task mình làm");
    expect(jobScopeNotes.view).toBeUndefined();
  });

  it("lists the changed cells in table order and compares matrices by value", () => {
    const copy: JobPermissionMatrix = JSON.parse(
      JSON.stringify(defaultJobPermissions)
    ) as JobPermissionMatrix;
    expect(sameJobPermissions(copy, defaultJobPermissions)).toBe(true);
    expect(jobScopeChanges(copy, defaultJobPermissions)).toEqual([]);

    const edited = withJobScope(
      withJobScope(defaultJobPermissions, "QC", "delete", "own"),
      "ACCOUNT",
      "update",
      "own"
    );
    expect(sameJobPermissions(edited, defaultJobPermissions)).toBe(false);
    expect(jobScopeChanges(defaultJobPermissions, edited)).toEqual([
      { role: "ACCOUNT", action: "update", from: "all", to: "own" },
      { role: "QC", action: "delete", from: "none", to: "own" }
    ]);
    // Setting a cell back to its saved value is not a change.
    expect(
      sameJobPermissions(
        withJobScope(edited, "QC", "delete", "none"),
        withJobScope(defaultJobPermissions, "ACCOUNT", "update", "own")
      )
    ).toBe(true);
  });
});
