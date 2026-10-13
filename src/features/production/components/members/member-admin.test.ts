import { describe, expect, it } from "vitest";

import {
  addOrphanNotice,
  emptyNewMember,
  formatLedDeadline,
  jobsLedByHref,
  orphanTitle,
  toCreateUserInput,
  validateNewMember,
  type OrphanNotice
} from "./member-admin";

describe("new member form", () => {
  it("requires an email, a name and at least one role", () => {
    const errors = validateNewMember({ ...emptyNewMember, roles: [] });
    expect(Object.keys(errors).sort()).toEqual(["displayName", "email", "roles"]);
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
        roles: ["STAFF", "QC", "STAFF"],
        teamId: null,
        allowGoogleSignIn: false
      })
    ).toEqual({
      email: "an.pham@nesso.vn",
      displayName: "An Phạm",
      roles: ["STAFF", "QC"],
      teamId: null,
      allowGoogleSignIn: false
    });
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
      jobStatus: { id: `${userId}-status`, name: "Đang làm", color: "blue" as const, isClosed: false },
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
