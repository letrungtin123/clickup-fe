import { describe, expect, it } from "vitest";

import { systemSentence } from "./system-text";
import { me, makeMessage, userA, userB } from "./test-fixtures";
import {
  buildTimeline,
  canGroupWith,
  findFirstUnreadIndex,
  formatDayLabel,
  messageKey,
  type TimelineRow
} from "./timeline";

const kinds = (rows: TimelineRow[]) =>
  rows.map((row) => (row.kind === "message" ? `${row.message.seq}${row.grouped ? "g" : ""}` : row.kind));

describe("buildTimeline", () => {
  it("groups consecutive messages by the same author within five minutes", () => {
    const rows = buildTimeline(
      [
        makeMessage({ seq: 1, createdAt: "2026-10-09T08:00:00Z" }),
        makeMessage({ seq: 2, createdAt: "2026-10-09T08:03:00Z" }),
        makeMessage({ seq: 3, createdAt: "2026-10-09T08:09:30Z" }), // > 5 min gap
        makeMessage({ seq: 4, author: userB, createdAt: "2026-10-09T08:10:00Z" }),
        makeMessage({ seq: 5, author: userB, createdAt: "2026-10-09T08:10:30Z" })
      ],
      { lastReadSeq: null, myId: me.id }
    );
    expect(kinds(rows)).toEqual(["day", "1", "2g", "3", "4", "5g"]);
  });

  it("inserts a day separator when the calendar day changes and never groups across it", () => {
    const rows = buildTimeline(
      [
        makeMessage({ seq: 1, createdAt: "2026-10-08T23:58:00" }),
        makeMessage({ seq: 2, createdAt: "2026-10-09T00:01:00" })
      ],
      { lastReadSeq: null, myId: me.id }
    );
    expect(kinds(rows)).toEqual(["day", "1", "day", "2"]);
    expect(rows[0]?.key).not.toEqual(rows[2]?.key);
  });

  it("does not group system messages or deleted-author rows", () => {
    const system = makeMessage({ seq: 2, kind: "system", createdAt: "2026-10-09T08:01:00Z" });
    expect(canGroupWith(makeMessage({ seq: 1 }), system)).toBe(false);
    expect(canGroupWith(system, makeMessage({ seq: 3, createdAt: "2026-10-09T08:02:00Z" }))).toBe(false);
    expect(canGroupWith(makeMessage({ author: null }), makeMessage({ author: null }))).toBe(false);
  });

  it("places the unread divider before the first unread message from someone else", () => {
    const messages = [
      makeMessage({ seq: 4, createdAt: "2026-10-09T08:00:00Z" }),
      makeMessage({ seq: 5, author: me, createdAt: "2026-10-09T08:01:00Z" }),
      makeMessage({ seq: 6, createdAt: "2026-10-09T08:02:00Z" }),
      makeMessage({ seq: 7, createdAt: "2026-10-09T08:02:30Z" })
    ];
    expect(findFirstUnreadIndex(messages, 4, me.id)).toBe(2);
    const rows = buildTimeline(messages, { lastReadSeq: 4, myId: me.id });
    expect(kinds(rows)).toEqual(["day", "4", "5", "unread", "6", "7g"]);
    const divider = rows.find((row) => row.kind === "unread");
    expect(divider && divider.kind === "unread" ? divider.count : 0).toBe(2);
  });

  it("shows no divider when everything is read, without a read marker, or when disabled", () => {
    const messages = [makeMessage({ seq: 1 }), makeMessage({ seq: 2 })];
    expect(findFirstUnreadIndex(messages, 2, me.id)).toBeNull();
    expect(findFirstUnreadIndex(messages, null, me.id)).toBeNull();
    expect(
      buildTimeline(messages, { lastReadSeq: 0, myId: me.id, showUnread: false }).some(
        (row) => row.kind === "unread"
      )
    ).toBe(false);
  });

  it("keeps optimistic rows out of the divider and keys them by client id", () => {
    const pending = {
      ...makeMessage({ seq: null, author: me, clientMessageId: "11111111-1111-4111-8111-111111111111" }),
      pending: { status: "sending" as const }
    };
    expect(findFirstUnreadIndex([pending], 0, "someone-else")).toBeNull();
    expect(messageKey(pending)).toBe("11111111-1111-4111-8111-111111111111");
    const confirmed = makeMessage({ clientMessageId: pending.clientMessageId });
    expect(messageKey(confirmed)).toBe(messageKey(pending));
  });
});

describe("formatDayLabel", () => {
  it("uses relative labels for today and yesterday, Vietnamese dates otherwise", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    expect(formatDayLabel(now, now)).toBe("Hôm nay");
    expect(formatDayLabel(yesterday, now)).toBe("Hôm qua");
    expect(formatDayLabel(new Date(2025, 2, 3), new Date(2026, 9, 9))).toBe("Thứ Hai, 3 tháng 3, 2025");
  });
});

describe("systemSentence", () => {
  const lookup = (id: string) => (id === userB.id ? userB.displayName : id === me.id ? "bạn" : null);

  it("renders Vietnamese sentences from structured events", () => {
    expect(
      systemSentence(
        makeMessage({ kind: "system", author: userA, systemEvent: { type: "members_added", actorId: userA.id, userIds: [userB.id, me.id] } }),
        lookup
      )
    ).toBe("Minh Nguyễn đã thêm An Phạm và bạn vào kênh");
    expect(
      systemSentence(
        makeMessage({ kind: "system", author: userA, systemEvent: { type: "renamed", actorId: userA.id, name: "sản-phẩm" } }),
        lookup
      )
    ).toBe("Minh Nguyễn đã đổi tên kênh thành “sản-phẩm”");
  });

  it("falls back to a count when member names are unknown", () => {
    expect(
      systemSentence(
        makeMessage({
          kind: "system",
          author: userA,
          systemEvent: { type: "member_removed", actorId: userA.id, userIds: ["x", "y"] }
        }),
        () => null
      )
    ).toBe("Minh Nguyễn đã xóa 2 thành viên khỏi kênh");
  });
});
