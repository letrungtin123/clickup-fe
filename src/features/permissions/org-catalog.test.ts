import { describe, expect, it } from "vitest";

import { Permission } from "@/contracts/permissions";

import {
  commonGroups,
  countChanges,
  editablePermissionKeys,
  hiddenPermissionKeys,
  productionGroups,
  sortOrgRoles,
  visiblePermissionKeys,
  withHiddenKeys
} from "./org-catalog";

describe("org permission catalog (PD-042)", () => {
  it("shows every contract permission except the status.* keys, each once", () => {
    const shown = visiblePermissionKeys([...productionGroups, ...commonGroups]);
    expect(new Set(shown).size).toBe(shown.length);
    const expected = Object.values(Permission).filter((key) => !key.startsWith("status."));
    expect([...shown].sort()).toEqual([...expected].sort());
    for (const key of hiddenPermissionKeys) expect(editablePermissionKeys.has(key)).toBe(false);
  });

  it("puts only list.manage_status under “Trạng thái công việc”", () => {
    const status = productionGroups.find((group) => group.title === "Trạng thái công việc");
    expect(status?.rows.map((row) => row.key)).toEqual(["list.manage_status"]);
    expect(status?.rows[0]?.label).toBe("Quản lý trạng thái công việc");
  });

  it("gives every row a label and a short description", () => {
    for (const group of [...productionGroups, ...commonGroups]) {
      expect(group.description).not.toBe("");
      for (const row of group.rows) {
        expect(row.label).not.toBe("");
        expect(row.description.length).toBeGreaterThan(5);
        expect(row.description.length).toBeLessThan(120);
      }
    }
  });

  it("keeps hidden and unknown keys when saving a role, never adds them", () => {
    const current = ["status.view", "status.update", "task.view", "legacy.key"];
    expect(withHiddenKeys(current, new Set(["task.create"]))).toEqual([
      "legacy.key",
      "status.update",
      "status.view",
      "task.create"
    ]);
    // A selection can never smuggle a hidden key in.
    expect(withHiddenKeys(["task.view"], new Set(["task.view", "status.delete"]))).toEqual([
      "task.view"
    ]);
  });

  it("counts only the cells the page shows", () => {
    expect(countChanges(["status.view", "task.view"], new Set(["task.view"]))).toBe(0);
    expect(countChanges(["task.view"], new Set(["task.create"]))).toBe(2);
  });

  it("orders built-in roles first, then custom roles by name", () => {
    const roles = [
      { key: "zeta", name: "Zeta" },
      { key: "member", name: "Member" },
      { key: "superadmin", name: "Superadmin" },
      { key: "alpha", name: "Alpha" },
      { key: "admin", name: "Admin" },
      { key: "manager", name: "Manager" }
    ];
    expect(sortOrgRoles(roles).map((role) => role.key)).toEqual([
      "superadmin",
      "admin",
      "manager",
      "member",
      "alpha",
      "zeta"
    ]);
  });
});
