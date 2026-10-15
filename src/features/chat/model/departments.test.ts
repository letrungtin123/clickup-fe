import { describe, expect, it } from "vitest";

import type { Department } from "@/contracts/departments";

import {
  badgeCount,
  channelsInDepartment,
  conversationAudience,
  departmentToShow,
  isShownInDepartment,
  otherDepartmentUnread
} from "./departments";
import { makeChannel, userA, userB } from "./test-fixtures";

// PD-054: chat follows the header department switcher. Obviously fake ids and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const both: Department[] = ["PHOTO_RETOUCH", "PRODUCTION"];

const retouchChannel = makeChannel({ id: id(1), name: "retouch", audienceDepartments: ["PHOTO_RETOUCH"] });
const productionChannel = makeChannel({
  id: id(2),
  name: "production",
  department: "PRODUCTION",
  audienceDepartments: ["PRODUCTION"]
});
const orgWide = makeChannel({ id: id(3), name: "chung", department: null, audienceDepartments: both });
const dmBoth = makeChannel({
  id: id(4),
  kind: "dm",
  name: null,
  department: null,
  participants: [userA],
  audienceDepartments: both
});
const dmProduction = makeChannel({
  id: id(5),
  kind: "dm",
  name: null,
  department: null,
  participants: [userB],
  audienceDepartments: ["PRODUCTION"]
});

describe("conversationAudience", () => {
  it("uses the server's audience, else derives it from the channel", () => {
    expect(conversationAudience(productionChannel)).toEqual(["PRODUCTION"]);
    // A payload without it (or empty): named channel → its department (null → all); DM → all.
    expect(conversationAudience({ kind: "private", department: "PRODUCTION" })).toEqual(["PRODUCTION"]);
    expect(conversationAudience({ kind: "public", department: null, audienceDepartments: [] })).toEqual(both);
    expect(conversationAudience({ kind: "group_dm", department: null })).toEqual(both);
  });
});

describe("isShownInDepartment / channelsInDepartment", () => {
  const all = [retouchChannel, productionChannel, orgWide, dmBoth, dmProduction];

  it("shows the conversations of the selected department only", () => {
    const retouch = channelsInDepartment(all, { current: "PHOTO_RETOUCH", departments: both });
    expect(retouch.map((channel) => channel.id)).toEqual([id(1), id(3), id(4)]);
    const production = channelsInDepartment(all, { current: "PRODUCTION", departments: both });
    expect(production.map((channel) => channel.id)).toEqual([id(2), id(3), id(4), id(5)]);
  });

  it("shows everything without a selected department", () => {
    expect(channelsInDepartment(all, { current: null, departments: [] })).toHaveLength(all.length);
  });

  it("never hides a conversation everywhere: no shared department → shown in every department", () => {
    // A Photo Retouch-only user still sees a Production conversation they belong to.
    expect(isShownInDepartment(productionChannel, "PHOTO_RETOUCH", ["PHOTO_RETOUCH"])).toBe(true);
    expect(isShownInDepartment(dmProduction, "PHOTO_RETOUCH", ["PHOTO_RETOUCH"])).toBe(true);
    // In both departments, it belongs to Production only.
    expect(isShownInDepartment(productionChannel, "PHOTO_RETOUCH", both)).toBe(false);
  });
});

describe("departmentToShow (opening a conversation by link / notification)", () => {
  it("switches only when the selected department does not show it", () => {
    expect(departmentToShow(productionChannel, { current: "PHOTO_RETOUCH", departments: both })).toBe(
      "PRODUCTION"
    );
    expect(departmentToShow(productionChannel, { current: "PRODUCTION", departments: both })).toBeNull();
    expect(departmentToShow(dmBoth, { current: "PHOTO_RETOUCH", departments: both })).toBeNull();
    // Fallback conversations show everywhere: nothing to switch.
    expect(
      departmentToShow(productionChannel, { current: "PHOTO_RETOUCH", departments: ["PHOTO_RETOUCH"] })
    ).toBeNull();
    expect(departmentToShow(productionChannel, { current: null, departments: both })).toBeNull();
  });
});

describe("badgeCount (the chat badge rule)", () => {
  it("counts mentions everywhere and unread direct messages that are not muted", () => {
    expect(badgeCount(makeChannel({ mentionCount: 2, unreadCount: 5 }))).toBe(2);
    expect(badgeCount(makeChannel({ unreadCount: 5 }))).toBe(0);
    expect(badgeCount({ ...dmBoth, unreadCount: 3 })).toBe(3);
    expect(badgeCount({ ...dmBoth, unreadCount: 3, notifyLevel: "none" })).toBe(0);
  });
});

describe("otherDepartmentUnread (switcher badges)", () => {
  const channels = [
    { ...retouchChannel, mentionCount: 1, unreadCount: 4 },
    { ...productionChannel, mentionCount: 2, unreadCount: 2 },
    { ...productionChannel, id: id(6), unreadCount: 7 }, // channel unread without mention: dot only, not counted
    { ...dmBoth, unreadCount: 5 }, // shown in both departments: never "elsewhere"
    { ...dmProduction, unreadCount: 3 },
    { ...dmProduction, id: id(7), unreadCount: 9, notifyLevel: "none" as const } // muted
  ];

  it("counts what is not shown in the selected department, per other department", () => {
    expect(otherDepartmentUnread(channels, { current: "PHOTO_RETOUCH", departments: both })).toEqual({
      total: 5,
      byDepartment: { PRODUCTION: 5 }
    });
    expect(otherDepartmentUnread(channels, { current: "PRODUCTION", departments: both })).toEqual({
      total: 1,
      byDepartment: { PHOTO_RETOUCH: 1 }
    });
  });

  it("is empty without a selected department or with one department (fallback shows everything)", () => {
    expect(otherDepartmentUnread(channels, { current: null, departments: both }).total).toBe(0);
    expect(
      otherDepartmentUnread(channels, { current: "PHOTO_RETOUCH", departments: ["PHOTO_RETOUCH"] })
    ).toEqual({ total: 0, byDepartment: {} });
  });
});
