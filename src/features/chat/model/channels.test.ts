import { describe, expect, it } from "vitest";

import {
  bumpUnread,
  channelEventChangesCapabilities,
  channelTitle,
  formatCount,
  isDeleteConfirmation,
  markSidebarRead,
  mergeChannelInfo,
  roomCandidates,
  sortChannels
} from "./channels";
import { makeChannel, userA, userB } from "./test-fixtures";

describe("channel helpers", () => {
  it("titles DMs by their participants", () => {
    expect(channelTitle(makeChannel({ kind: "dm", name: null, participants: [userA] }))).toBe(
      "Minh Nguyễn"
    );
    expect(
      channelTitle(
        makeChannel({
          kind: "group_dm",
          name: null,
          participants: [userA, userB, userA, userB]
        })
      )
    ).toBe("Minh Nguyễn, An Phạm và 2 người khác");
    expect(channelTitle(makeChannel({ name: "thiết-kế" }))).toBe("thiết-kế");
  });

  it("formats capped badges", () => {
    expect(formatCount(5)).toBe("5");
    expect(formatCount(100)).toBe("99+");
  });

  it("sorts by activity or by name and picks the most recent rooms first", () => {
    const old = makeChannel({ id: "a", name: "bê", lastMessageAt: "2026-10-01T00:00:00Z" });
    const recent = makeChannel({ id: "b", name: "a", lastMessageAt: "2026-10-09T00:00:00Z" });
    const notMember = makeChannel({ id: "c", name: "c", isMember: false });
    expect(sortChannels([old, recent], "activity").map((channel) => channel.id)).toEqual([
      "b",
      "a"
    ]);
    expect(sortChannels([old, recent], "name").map((channel) => channel.id)).toEqual(["b", "a"]);
    expect(roomCandidates([old, recent, notMember], 1)).toEqual(["b"]);
  });

  it("bumps unread once per seq and resets on read", () => {
    const channel = makeChannel({ lastMessageSeq: 10, lastReadSeq: 10 });
    const bumped = bumpUnread(channel, {
      seq: 11,
      createdAt: "2026-10-09T09:00:00Z",
      mentionsMe: true
    });
    expect(bumped).toMatchObject({ unreadCount: 1, mentionCount: 1, lastMessageSeq: 11 });
    expect(
      bumpUnread(bumped, { seq: 11, createdAt: "2026-10-09T09:00:00Z", mentionsMe: true })
    ).toBe(bumped);
    expect(markSidebarRead(bumped, 11)).toMatchObject({
      unreadCount: 0,
      mentionCount: 0,
      lastReadSeq: 11
    });
  });
});

describe("channelEventChangesCapabilities (BUG-WK-43)", () => {
  const archived = { archivedAt: "2026-10-01T00:00:00.000Z", kind: "public" as const };
  const live = { archivedAt: null, kind: "public" as const };

  it("re-reads capabilities when a channel is unarchived (an 'updated' event)", () => {
    expect(channelEventChangesCapabilities(archived, { kind: "updated", channel: live })).toBe(true);
  });

  it("re-reads them on archive and kind changes, not on plain metadata edits", () => {
    expect(channelEventChangesCapabilities(live, { kind: "archived", channel: archived })).toBe(true);
    expect(channelEventChangesCapabilities(live, { kind: "updated", channel: { ...live, kind: "private" } })).toBe(true);
    expect(channelEventChangesCapabilities(live, { kind: "updated", channel: live })).toBe(false);
    expect(channelEventChangesCapabilities(undefined, { kind: "updated", channel: live })).toBe(false);
  });

  it("re-reads them when a public channel moves to another department (PD-053)", () => {
    const retouch = { ...live, department: "PHOTO_RETOUCH" as const };
    const production = { ...live, department: "PRODUCTION" as const };
    expect(channelEventChangesCapabilities(retouch, { kind: "updated", channel: production })).toBe(true);
    expect(channelEventChangesCapabilities(retouch, { kind: "updated", channel: retouch })).toBe(false);
  });
});

describe("mergeChannelInfo (PD-053)", () => {
  it("carries the department of a realtime channel update", () => {
    const cached = makeChannel({ kind: "private", department: null, unreadCount: 2 });
    const info = makeChannel({ kind: "public", department: "PRODUCTION", memberCount: 12, unreadCount: 0 });
    const merged = mergeChannelInfo(cached, info);
    expect(merged).toMatchObject({ kind: "public", department: "PRODUCTION", memberCount: 12, unreadCount: 2 });
  });

  it("keeps the viewer's audience departments (PD-054: not in realtime payloads)", () => {
    const { audienceDepartments: _omitted, ...info } = makeChannel({ kind: "dm", name: null, department: null });
    const cached = makeChannel({ kind: "dm", name: null, department: null, audienceDepartments: ["PRODUCTION"] });
    expect(mergeChannelInfo(cached, { ...info, memberCount: 2 }).audienceDepartments).toEqual(["PRODUCTION"]);

    const named = makeChannel({ department: "PHOTO_RETOUCH", audienceDepartments: ["PHOTO_RETOUCH"] });
    const { audienceDepartments: _same, ...renamed } = { ...named, name: "mới" };
    expect(mergeChannelInfo(named, renamed).audienceDepartments).toEqual(["PHOTO_RETOUCH"]);
  });

  it("moves a named channel to its new department's audience", () => {
    const cached = makeChannel({ kind: "private", department: null, audienceDepartments: ["PHOTO_RETOUCH", "PRODUCTION"] });
    const { audienceDepartments: _omitted, ...info } = makeChannel({ kind: "public", department: "PRODUCTION" });
    expect(mergeChannelInfo(cached, info).audienceDepartments).toEqual(["PRODUCTION"]);
    const { audienceDepartments: _none, ...orgWide } = makeChannel({ kind: "public", department: null });
    expect(mergeChannelInfo(cached, orgWide).audienceDepartments).toEqual(["PHOTO_RETOUCH", "PRODUCTION"]);
    expect(
      mergeChannelInfo(makeChannel({ department: "PRODUCTION", audienceDepartments: ["PRODUCTION"] }), orgWide)
        .audienceDepartments
    ).toEqual(["PHOTO_RETOUCH", "PRODUCTION"]);
  });
});

describe("isDeleteConfirmation", () => {
  it("accepts the word xóa with or without diacritics, in any case", () => {
    for (const text of ["xóa", "xoá", "xoa", "XÓA", " Xoa "]) expect(isDeleteConfirmation(text), text).toBe(true);
    for (const text of ["", "xo", "xóa kênh", "delete"]) expect(isDeleteConfirmation(text), text).toBe(false);
  });
});
