import { describe, expect, it } from "vitest";

import {
  departmentForPath,
  departmentStorageKey,
  isDepartment,
  leavesRoute,
  myTasksPathFor,
  parseStoredDepartment,
  resolveDepartment,
  routeAccess,
  withoutRetouchMyTasks
} from "./model";

describe("departmentForPath (PD-041)", () => {
  it("maps the production module to Photo Retouch", () => {
    expect(departmentForPath("/production")).toBe("PHOTO_RETOUCH");
    expect(departmentForPath("/production/")).toBe("PHOTO_RETOUCH");
    expect(departmentForPath("/production/jobs/abc")).toBe("PHOTO_RETOUCH");
    expect(departmentForPath("/production/settings/members")).toBe("PHOTO_RETOUCH");
    expect(departmentForPath("/Production/my-tasks")).toBe("PHOTO_RETOUCH");
  });

  it("maps workspace projects and my tasks to Production", () => {
    expect(departmentForPath("/p/123")).toBe("PRODUCTION");
    expect(departmentForPath("/p/123/l/456")).toBe("PRODUCTION");
    expect(departmentForPath("/p/123/settings")).toBe("PRODUCTION");
    expect(departmentForPath("/my-tasks")).toBe("PRODUCTION");
    expect(departmentForPath("/my-tasks/")).toBe("PRODUCTION");
  });

  it("keeps everything else shared", () => {
    for (const path of [
      "/",
      "/inbox",
      "/notifications",
      "/search",
      "/trash",
      "/k/1/i/2",
      "/c",
      "/c/1",
      "/settings/members",
      "/productions",
      "/projects",
      "/pp/1",
      "/my-tasks-old"
    ]) {
      expect(departmentForPath(path)).toBeNull();
    }
  });
});

describe("stored department", () => {
  it("accepts only known codes", () => {
    expect(parseStoredDepartment("PHOTO_RETOUCH")).toBe("PHOTO_RETOUCH");
    expect(parseStoredDepartment(" PRODUCTION ")).toBe("PRODUCTION");
    expect(parseStoredDepartment(null)).toBeNull();
    expect(parseStoredDepartment(undefined)).toBeNull();
    expect(parseStoredDepartment("")).toBeNull();
    expect(parseStoredDepartment("production")).toBeNull();
    expect(parseStoredDepartment('"PRODUCTION"')).toBeNull();
    expect(parseStoredDepartment("SALES")).toBeNull();
    expect(isDepartment(42)).toBe(false);
  });

  it("is kept per user", () => {
    expect(departmentStorageKey("user-a")).not.toBe(departmentStorageKey("user-b"));
  });
});

describe("resolveDepartment", () => {
  const both = ["PHOTO_RETOUCH", "PRODUCTION"] as const;

  it("prefers the device cache while it is still one of the user's departments", () => {
    expect(resolveDepartment({ stored: "PRODUCTION", remembered: "PHOTO_RETOUCH", departments: both })).toBe(
      "PRODUCTION"
    );
    expect(
      resolveDepartment({ stored: "PRODUCTION", remembered: null, departments: ["PHOTO_RETOUCH"] })
    ).toBe("PHOTO_RETOUCH");
  });

  it("falls back to the server choice, then to the first department", () => {
    expect(resolveDepartment({ stored: null, remembered: "PRODUCTION", departments: both })).toBe("PRODUCTION");
    expect(resolveDepartment({ stored: null, remembered: null, departments: both })).toBe("PHOTO_RETOUCH");
    expect(
      resolveDepartment({ stored: null, remembered: "PHOTO_RETOUCH", departments: ["PRODUCTION"] })
    ).toBe("PRODUCTION");
    expect(
      resolveDepartment({ stored: null, remembered: null, departments: ["PRODUCTION", "PHOTO_RETOUCH"] })
    ).toBe("PHOTO_RETOUCH");
  });

  it("has nothing to show without a department", () => {
    expect(resolveDepartment({ stored: "PRODUCTION", remembered: "PRODUCTION", departments: [] })).toBeNull();
  });
});

describe("routeAccess", () => {
  it("lets shared routes and the current department through", () => {
    expect(routeAccess("/inbox", "PRODUCTION", ["PRODUCTION"])).toEqual({ kind: "ok" });
    expect(routeAccess("/inbox", null, [])).toEqual({ kind: "ok" });
    expect(routeAccess("/production/qc", "PHOTO_RETOUCH", ["PHOTO_RETOUCH"])).toEqual({ kind: "ok" });
  });

  it("switches to the other department of a member", () => {
    expect(routeAccess("/p/1", "PHOTO_RETOUCH", ["PHOTO_RETOUCH", "PRODUCTION"])).toEqual({
      kind: "switch",
      department: "PRODUCTION"
    });
  });

  it("refuses a department the user does not belong to", () => {
    expect(routeAccess("/production", "PRODUCTION", ["PRODUCTION"])).toEqual({
      kind: "forbidden",
      department: "PHOTO_RETOUCH"
    });
    expect(routeAccess("/my-tasks", null, [])).toEqual({ kind: "forbidden", department: "PRODUCTION" });
  });

  it("leaves a page of the other department when switching", () => {
    expect(leavesRoute("/production/jobs", "PRODUCTION")).toBe(true);
    expect(leavesRoute("/p/1/l/2", "PHOTO_RETOUCH")).toBe(true);
    expect(leavesRoute("/p/1/l/2", "PRODUCTION")).toBe(false);
    expect(leavesRoute("/inbox", "PHOTO_RETOUCH")).toBe(false);
  });
});

describe("Việc của tôi", () => {
  it("follows the department", () => {
    expect(myTasksPathFor("PRODUCTION", [])).toBe("/my-tasks");
    expect(myTasksPathFor("PHOTO_RETOUCH", ["/production", "/production/my-tasks"])).toBe(
      "/production/my-tasks"
    );
    expect(myTasksPathFor("PHOTO_RETOUCH", ["/production", "/production/jobs"])).toBeNull();
    expect(myTasksPathFor(null, ["/production/my-tasks"])).toBeNull();
  });

  it("is removed from the Photo Retouch group", () => {
    expect(
      withoutRetouchMyTasks([{ to: "/production" }, { to: "/production/my-tasks" }, { to: "/production/qc" }])
    ).toEqual([{ to: "/production" }, { to: "/production/qc" }]);
  });
});
