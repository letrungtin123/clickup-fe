import { describe, expect, it } from "vitest";

import {
  accountLock,
  accountLockReasons,
  isOrgAdminRole,
  lockedRoles,
  orgAuthorityByUser,
  type OrgMemberLike
} from "./org-admins";

const member = (id: string, key: string, permissions: string[] = []): OrgMemberLike => ({
  user: { id },
  role: { key, permissions }
});

const members = [
  member("super", "superadmin"),
  member("admin", "admin", ["member.view", "member.manage", "role.create"]),
  member("manager", "manager", ["member.view", "member.manage"]),
  member("roles-only", "custom", ["role.assign_permission"]),
  member("lead", "truong_nhom_du_an", ["project.manage_members", "member.view"]),
  member("staff", "member", ["task.view"])
];

describe("org admins", () => {
  it("treats superadmin, member.manage and role.* holders as organization admins", () => {
    expect(isOrgAdminRole({ key: "superadmin", permissions: [] })).toBe(true);
    expect(isOrgAdminRole({ key: "manager", permissions: ["member.manage"] })).toBe(true);
    expect(isOrgAdminRole({ key: "x", permissions: ["role.delete"] })).toBe(true);
    expect(isOrgAdminRole({ key: "x", permissions: ["role.view", "member.view"] })).toBe(false);
  });

  it("maps user ids to their organization authority", () => {
    const map = orgAuthorityByUser(members);
    expect(map.get("super")).toBe("superadmin");
    expect(map.get("admin")).toBe("admin");
    expect(map.get("manager")).toBe("admin");
    expect(map.get("roles-only")).toBe("admin");
    expect(map.has("lead")).toBe(false);
    expect(map.has("staff")).toBe(false);
  });
});

describe("accountLock", () => {
  const authority = orgAuthorityByUser(members);
  const lock = (userId: string, viewerIsSuperadmin = false, viewerId = "admin") =>
    accountLock({ userId, viewerId, viewerIsSuperadmin, authority })?.kind ?? null;

  it("locks your own row", () => {
    expect(lock("admin")).toBe("self");
    expect(lock("super", true, "super")).toBe("self");
  });

  it("always locks superadmin rows", () => {
    expect(lock("super")).toBe("superadmin");
    expect(lock("super", true, "someone")).toBe("superadmin");
  });

  it("locks organization admins unless the viewer is a superadmin", () => {
    expect(lock("manager")).toBe("org-admin");
    expect(lock("roles-only")).toBe("org-admin");
    expect(lock("manager", true, "super")).toBeNull();
  });

  it("leaves everyone else open, and everyone but you when the org list is unknown", () => {
    expect(lock("lead")).toBeNull();
    expect(lock("staff")).toBeNull();
    expect(
      accountLock({
        userId: "manager",
        viewerId: "admin",
        viewerIsSuperadmin: false,
        authority: undefined
      })
    ).toBeNull();
    expect(
      accountLock({
        userId: "admin",
        viewerId: "admin",
        viewerIsSuperadmin: false,
        authority: undefined
      })
    ).toEqual({ kind: "self", reason: accountLockReasons.self });
  });
});

describe("lockedRoles", () => {
  it("only keeps your own ADMIN (not for superadmins)", () => {
    const self = { kind: "self" as const, reason: "" };
    expect(
      Object.keys(lockedRoles(self, { roles: ["ADMIN", "QC"], viewerIsSuperadmin: false }))
    ).toEqual(["ADMIN"]);
    expect(lockedRoles(self, { roles: ["QC"], viewerIsSuperadmin: false })).toEqual({});
    expect(lockedRoles(self, { roles: ["ADMIN"], viewerIsSuperadmin: true })).toEqual({});
  });

  it("locks every role of protected accounts", () => {
    const locked = lockedRoles(
      { kind: "org-admin", reason: "" },
      { roles: [], viewerIsSuperadmin: false }
    );
    expect(Object.keys(locked).sort()).toEqual([
      "ACCOUNT",
      "ADMIN",
      "DIRECTOR",
      "LEADER",
      "QC",
      "STAFF"
    ]);
    expect(lockedRoles(null, { roles: ["ADMIN"], viewerIsSuperadmin: false })).toEqual({});
  });
});
