import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/errors";

import {
  addOrphanNotice,
  emptyNewMember,
  formatLedDeadline,
  jobsLedByHref,
  memberErrorMessage,
  orphanTitle,
  toCreateUserInput,
  validateNewMember,
  type OrphanNotice
} from "./member-admin";

describe("new member form", () => {
  it("requires an email, a name and at least one role", () => {
    const errors = validateNewMember({ ...emptyNewMember, roles: [] });
    expect(Object.keys(errors).sort()).toEqual(["displayName", "email", "roles"]);
    expect(errors.roles).toBe("Chọn ít nhất một vai trò Photo Retouch.");
  });

  it("starts in Photo Retouch as Nhân viên", () => {
    expect(emptyNewMember.departments).toEqual(["PHOTO_RETOUCH"]);
    expect(emptyNewMember.roles).toEqual(["STAFF"]);
  });

  it("requires a department; roles only with Photo Retouch", () => {
    const base = { ...emptyNewMember, email: "a@b.vn", displayName: "A" };
    expect(validateNewMember({ ...base, departments: [] }).departments).toBe(
      "Chọn ít nhất một phòng ban."
    );
    // Production only: no role needed (the kept chips are not sent).
    expect(validateNewMember({ ...base, departments: ["PRODUCTION"], roles: [] })).toEqual({});
    expect(
      validateNewMember({ ...base, departments: ["PRODUCTION", "PHOTO_RETOUCH"], roles: [] }).roles
    ).toBeDefined();
  });

  it("refuses a department the caller is not in", () => {
    const base = { ...emptyNewMember, email: "a@b.vn", displayName: "A" };
    const locks = { PRODUCTION: "Bạn không thuộc phòng ban Production" };
    expect(validateNewMember(base, locks)).toEqual({});
    expect(
      validateNewMember({ ...base, departments: ["PHOTO_RETOUCH", "PRODUCTION"] }, locks)
        .departments
    ).toBe(locks.PRODUCTION);
  });

  it("checks the email shape like the API", () => {
    const base = { ...emptyNewMember, displayName: "An" };
    expect(validateNewMember({ ...base, email: "an@nesso" }).email).toBeDefined();
    expect(validateNewMember({ ...base, email: "an phạm@nesso.vn" }).email).toBeDefined();
    expect(validateNewMember({ ...base, email: " An.Pham+1@Nesso.vn " })).toEqual({});
  });

  it("limits the name and job title", () => {
    const base = { ...emptyNewMember, email: "a@b.vn" };
    expect(validateNewMember({ ...base, displayName: "x".repeat(161) }).displayName).toBeDefined();
    expect(
      validateNewMember({ ...base, displayName: "A", jobTitle: "x".repeat(121) }).jobTitle
    ).toBeDefined();
  });

  it("builds the request body", () => {
    expect(
      toCreateUserInput({
        email: " An.Pham@Nesso.VN ",
        displayName: "  An Phạm ",
        jobTitle: "  ",
        departments: ["PRODUCTION", "PHOTO_RETOUCH", "PRODUCTION"],
        roles: ["STAFF", "QC", "STAFF"],
        teamId: null,
        allowGoogleSignIn: false
      })
    ).toEqual({
      email: "an.pham@nesso.vn",
      displayName: "An Phạm",
      departments: ["PHOTO_RETOUCH", "PRODUCTION"],
      roles: ["QC", "STAFF"],
      teamId: null,
      allowGoogleSignIn: false
    });
    // Production only: the roles picked before unticking Photo Retouch are not sent.
    expect(
      toCreateUserInput({
        ...emptyNewMember,
        email: "a@b.vn",
        displayName: "A",
        departments: ["PRODUCTION"]
      })
    ).toMatchObject({ departments: ["PRODUCTION"], roles: [] });
    expect(
      toCreateUserInput({
        ...emptyNewMember,
        email: "a@b.vn",
        displayName: "A",
        jobTitle: " Retoucher "
      }).jobTitle
    ).toBe("Retoucher");
  });
});

describe("member errors", () => {
  it("words the department answers, then the production copy", () => {
    const error = (code: string, status = 400) => new ApiError({ status, code, message: "x" });
    expect(memberErrorMessage(error("DEPARTMENT_ESCALATION", 403))).toBe(
      "Bạn chỉ thêm hoặc bỏ được phòng ban mà bạn thuộc về."
    );
    expect(memberErrorMessage(error("PRODUCTION_ROLES_NOT_ALLOWED"))).toBe(
      "Vai trò Photo Retouch chỉ dành cho người thuộc phòng ban Photo Retouch."
    );
    expect(memberErrorMessage(error("SELF_ADMIN_REMOVAL", 409))).toContain("Quản trị");
  });
});

describe("orphaned jobs", () => {
  const notice = (userId: string, count: number): OrphanNotice => ({
    userId,
    displayName: userId,
    reason: "role",
    jobs: Array.from({ length: count }, (_, index) => ({
      id: `${userId}-${index}`,
      code: `J${index}`,
      name: null,
      deadline: "2026-10-12T03:00:00.000Z",
      jobStatus: {
        id: `${userId}-status`,
        name: "Đang làm",
        color: "blue" as const,
        isClosed: false,
        requiresAllChecked: false
      },
      taskCount: 0
    }))
  });

  it("keeps one notice per person, newest first", () => {
    const list = addOrphanNotice(addOrphanNotice([], notice("a", 1)), notice("b", 2));
    expect(list.map((item) => item.userId)).toEqual(["b", "a"]);
    const again = addOrphanNotice(list, notice("a", 3));
    expect(again.map((item) => [item.userId, item.jobs.length])).toEqual([
      ["a", 3],
      ["b", 2]
    ]);
  });

  it("words the warning and links the job list by leader", () => {
    expect(orphanTitle(2, "Khoa Lê")).toBe("2 job vẫn do Khoa Lê dẫn — hãy giao cho Leader khác");
    expect(jobsLedByHref("4b1c")).toBe("/production/jobs?leader=4b1c");
  });

  it("formats deadlines in the organization timezone", () => {
    const now = new Date("2026-10-11T05:00:00Z");
    expect(formatLedDeadline("2026-10-12T03:05:00Z", "Asia/Ho_Chi_Minh", now)).toBe("12/10 10:05");
    expect(formatLedDeadline("2026-12-31T17:30:00Z", "Asia/Ho_Chi_Minh", now)).toBe(
      "01/01/2027 00:30"
    );
    expect(formatLedDeadline("not a date", "Asia/Ho_Chi_Minh", now)).toBe("—");
  });
});
