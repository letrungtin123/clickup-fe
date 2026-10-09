import { describe, expect, it } from "vitest";

import {
  bumpUnread,
  channelTitle,
  formatCount,
  markSidebarRead,
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
