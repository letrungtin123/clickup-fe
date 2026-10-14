// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { notifySessionEnd } from "@/lib/session-cleanup";

import { departmentStorageKey } from "./model";
import { readStoredDepartment, subscribeDepartment, writeStoredDepartment } from "./store";

afterEach(() => {
  notifySessionEnd("ended");
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("department cache (PD-041)", () => {
  it("reads a valid stored choice per user and ignores anything else", () => {
    window.localStorage.setItem(departmentStorageKey("user-a"), "PRODUCTION");
    window.localStorage.setItem(departmentStorageKey("user-b"), "SALES");
    expect(readStoredDepartment("user-a")).toBe("PRODUCTION");
    expect(readStoredDepartment("user-b")).toBeNull();
    expect(readStoredDepartment("user-c")).toBeNull();
  });

  it("writes through to storage, notifies and clears", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDepartment(listener);
    writeStoredDepartment("user-a", "PHOTO_RETOUCH");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readStoredDepartment("user-a")).toBe("PHOTO_RETOUCH");
    expect(window.localStorage.getItem(departmentStorageKey("user-a"))).toBe("PHOTO_RETOUCH");
    writeStoredDepartment("user-a", null);
    expect(window.localStorage.getItem(departmentStorageKey("user-a"))).toBeNull();
    unsubscribe();
    writeStoredDepartment("user-a", "PRODUCTION");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps working in memory when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredDepartment("user-a")).toBeNull();
    writeStoredDepartment("user-a", "PRODUCTION");
    expect(readStoredDepartment("user-a")).toBe("PRODUCTION");
  });

  it("starts from storage again after the session ends", () => {
    writeStoredDepartment("user-a", "PRODUCTION");
    window.localStorage.setItem(departmentStorageKey("user-a"), "PHOTO_RETOUCH");
    expect(readStoredDepartment("user-a")).toBe("PRODUCTION");
    notifySessionEnd("ended");
    expect(readStoredDepartment("user-a")).toBe("PHOTO_RETOUCH");
  });
});
