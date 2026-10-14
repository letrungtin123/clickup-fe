import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/errors";

import {
  departmentErrorField,
  departmentErrorMessage,
  departmentLocks,
  escalationMessage,
  inDepartment,
  removesRetouch,
  shownDepartments,
  showsRetouchRoles,
  toDepartmentChange,
  toDepartmentPayload,
  toggleDepartment,
  validateDepartmentDraft
} from "./department-form";

describe("department locks (escalation guard)", () => {
  it("leaves every department open to the superadmin", () => {
    expect(departmentLocks({ departments: [], hasFullOrganizationAuthority: true })).toEqual({});
  });

  it("locks the departments the caller is not in, with the reason", () => {
    const locks = departmentLocks({
      departments: ["PHOTO_RETOUCH"],
      hasFullOrganizationAuthority: false
    });
    expect(Object.keys(locks)).toEqual(["PRODUCTION"]);
    expect(locks.PRODUCTION).toContain("Production");
    expect(
      Object.keys(departmentLocks({ departments: [], hasFullOrganizationAuthority: false }))
    ).toEqual(["PHOTO_RETOUCH", "PRODUCTION"]);
  });

  it("locks Photo Retouch in Cài đặt for callers who cannot grant production roles", () => {
    const admin = { departments: ["PHOTO_RETOUCH", "PRODUCTION"] as const, hasFullOrganizationAuthority: false };
    const options = { retouchNeedsProductionAdmin: true };
    expect(Object.keys(departmentLocks({ ...admin, productionRoles: ["STAFF"] }, options))).toEqual([
      "PHOTO_RETOUCH"
    ]);
    expect(departmentLocks({ ...admin, productionRoles: ["ADMIN"] }, options)).toEqual({});
    // The production users admin (production ADMIN only) does not ask for it.
    expect(departmentLocks({ ...admin, productionRoles: [] })).toEqual({});
  });
});

describe("toggleDepartment", () => {
  it("adds in stable order and removes", () => {
    expect(toggleDepartment(["PRODUCTION"], "PHOTO_RETOUCH")).toEqual([
      "PHOTO_RETOUCH",
      "PRODUCTION"
    ]);
    expect(toggleDepartment(["PHOTO_RETOUCH", "PRODUCTION"], "PHOTO_RETOUCH")).toEqual([
      "PRODUCTION"
    ]);
  });
});

describe("validateDepartmentDraft — creating", () => {
  it("requires at least one department", () => {
    expect(validateDepartmentDraft({ departments: [], roles: ["STAFF"] })).toEqual({
      departments: "Chọn ít nhất một phòng ban."
    });
  });

  it("requires a role with Photo Retouch only", () => {
    expect(validateDepartmentDraft({ departments: ["PHOTO_RETOUCH"], roles: [] }).roles).toBe(
      "Chọn ít nhất một vai trò Photo Retouch."
    );
    expect(validateDepartmentDraft({ departments: ["PHOTO_RETOUCH"], roles: ["QC"] })).toEqual({});
    // Kept chips while Photo Retouch is unticked are not a problem: they are not sent.
    expect(validateDepartmentDraft({ departments: ["PRODUCTION"], roles: ["QC"] })).toEqual({});
    expect(validateDepartmentDraft({ departments: ["PRODUCTION"], roles: [] })).toEqual({});
  });

  it("refuses a locked department", () => {
    const locks = { PHOTO_RETOUCH: "…" };
    expect(
      validateDepartmentDraft({ departments: ["PHOTO_RETOUCH"], roles: ["STAFF"] }, { locks })
        .departments
    ).toBe("…");
    expect(validateDepartmentDraft({ departments: ["PRODUCTION"], roles: [] }, { locks })).toEqual(
      {}
    );
  });
});

describe("validateDepartmentDraft — editing", () => {
  it("asks for roles only when Photo Retouch is newly added", () => {
    const added = { before: ["PRODUCTION"] as const };
    expect(
      validateDepartmentDraft({ departments: ["PHOTO_RETOUCH", "PRODUCTION"], roles: [] }, added)
        .roles
    ).toBeDefined();
    // Already in Photo Retouch: their roles stay as they are.
    expect(
      validateDepartmentDraft(
        { departments: ["PHOTO_RETOUCH", "PRODUCTION"], roles: [] },
        { before: ["PHOTO_RETOUCH"] }
      )
    ).toEqual({});
  });

  it("keeps a locked department the member already has, but may not remove or add it", () => {
    const locks = { PRODUCTION: "…" };
    const before = ["PHOTO_RETOUCH", "PRODUCTION"] as const;
    expect(
      validateDepartmentDraft(
        { departments: ["PHOTO_RETOUCH", "PRODUCTION"], roles: [] },
        { before, locks }
      )
    ).toEqual({});
    expect(
      validateDepartmentDraft({ departments: ["PHOTO_RETOUCH"], roles: [] }, { before, locks })
        .departments
    ).toBe("…");
    // Removing an open department next to a locked one is fine.
    expect(
      validateDepartmentDraft({ departments: ["PRODUCTION"], roles: [] }, { before, locks })
    ).toEqual({});
  });

  it("still requires one department", () => {
    expect(
      validateDepartmentDraft({ departments: [], roles: [] }, { before: ["PRODUCTION"] })
        .departments
    ).toBe("Chọn ít nhất một phòng ban.");
  });
});

describe("payloads", () => {
  it("creating: de-duplicated, stable order, roles only with Photo Retouch", () => {
    expect(
      toDepartmentPayload({
        departments: ["PRODUCTION", "PHOTO_RETOUCH", "PRODUCTION"],
        roles: ["STAFF", "ADMIN", "STAFF"]
      })
    ).toEqual({ departments: ["PHOTO_RETOUCH", "PRODUCTION"], roles: ["ADMIN", "STAFF"] });
    expect(toDepartmentPayload({ departments: ["PRODUCTION"], roles: ["STAFF"] })).toEqual({
      departments: ["PRODUCTION"],
      roles: []
    });
  });

  it("editing: null when unchanged, roles only when Photo Retouch is newly added", () => {
    expect(
      toDepartmentChange(["PHOTO_RETOUCH"], { departments: ["PHOTO_RETOUCH"], roles: ["QC"] })
    ).toBeNull();
    expect(
      toDepartmentChange(["PRODUCTION"], {
        departments: ["PRODUCTION", "PHOTO_RETOUCH"],
        roles: ["STAFF", "QC", "STAFF"]
      })
    ).toEqual({ departments: ["PHOTO_RETOUCH", "PRODUCTION"], roles: ["QC", "STAFF"] });
    expect(
      toDepartmentChange(["PHOTO_RETOUCH"], { departments: ["PRODUCTION"], roles: ["STAFF"] })
    ).toEqual({ departments: ["PRODUCTION"] });
    expect(
      toDepartmentChange(["PHOTO_RETOUCH"], {
        departments: ["PHOTO_RETOUCH", "PRODUCTION"],
        roles: ["STAFF"]
      })
    ).toEqual({ departments: ["PHOTO_RETOUCH", "PRODUCTION"] });
  });
});

describe("display helpers", () => {
  it("knows when the roles field shows and when the removal warning shows", () => {
    expect(showsRetouchRoles(["PHOTO_RETOUCH"])).toBe(true);
    expect(showsRetouchRoles(["PRODUCTION"])).toBe(false);
    expect(showsRetouchRoles(["PHOTO_RETOUCH"], ["PHOTO_RETOUCH"])).toBe(false);
    expect(showsRetouchRoles(["PHOTO_RETOUCH"], ["PRODUCTION"])).toBe(true);
    expect(removesRetouch(["PHOTO_RETOUCH", "PRODUCTION"], ["PRODUCTION"])).toBe(true);
    expect(removesRetouch(["PRODUCTION"], ["PRODUCTION"])).toBe(false);
  });

  it("shows a superadmin as every department and filters with them", () => {
    expect(shownDepartments(["PRODUCTION"], true)).toBe("all");
    expect(shownDepartments(["PRODUCTION", "PHOTO_RETOUCH"], false)).toEqual([
      "PHOTO_RETOUCH",
      "PRODUCTION"
    ]);
    expect(inDepartment(["PRODUCTION"], null)).toBe(true);
    expect(inDepartment(["PRODUCTION"], "PHOTO_RETOUCH")).toBe(false);
    expect(inDepartment([], "PHOTO_RETOUCH", true)).toBe(true);
  });
});

describe("department API errors", () => {
  const error = (code: string, status = 400) => new ApiError({ status, code, message: "x" });

  it("words the codes and names the field", () => {
    expect(departmentErrorMessage(error("DEPARTMENTS_REQUIRED"))).toBe(
      "Chọn ít nhất một phòng ban."
    );
    expect(departmentErrorMessage(error("DEPARTMENT_ESCALATION", 403))).toBe(escalationMessage);
    expect(departmentErrorField(error("DEPARTMENT_ESCALATION", 403))).toBe("departments");
    expect(departmentErrorField(error("PRODUCTION_ROLES_REQUIRED"))).toBe("roles");
    expect(departmentErrorMessage(error("PRODUCTION_ROLES_NOT_ALLOWED"))).toContain(
      "Photo Retouch"
    );
  });

  it("leaves other errors to the page", () => {
    expect(departmentErrorMessage(error("MEMBER_EXISTS", 409))).toBeNull();
    expect(departmentErrorField(error("MEMBER_EXISTS", 409))).toBeNull();
    expect(departmentErrorMessage(new Error("boom"))).toBeNull();
  });
});
