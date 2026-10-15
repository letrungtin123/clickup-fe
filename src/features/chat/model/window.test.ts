import { describe, expect, it } from "vitest";

import type { MessageHistory } from "@/contracts/chat";

import { makeMessage, me, userA, userB } from "./test-fixtures";
import {
  appendLive,
  applyDeletion,
  applyReactionEvent,
  fromHistory,
  mergeOlder,
  mergeRefresh,
  setReaction,
  toggleReactionLocally,
  upsertMessages,
  WINDOW_MAX,
  type MessageWindow
} from "./window";

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => makeMessage({ seq: from + index }));

const windowOf = (
  from: number,
  to: number,
  overrides: Partial<MessageWindow> = {}
): MessageWindow => ({
  items: range(from, to),
  hasOlder: from > 1,
  hasNewer: false,
  lastReadSeq: to,
  ...overrides
});

const seqs = (window: MessageWindow) => window.items.map((message) => message.seq);

describe("message window", () => {
  it("upserts by id, keeps seq order and ignores thread replies", () => {
    const [a, b] = range(1, 2);
    const items = upsertMessages([b!], [a!, makeMessage({ seq: null, threadRootId: a!.id })]);
    expect(items.map((message) => message.seq)).toEqual([1, 2]);
  });

  it("appends live messages only at the live end and dedupes repeats", () => {
    const live = windowOf(1, 3);
    const incoming = makeMessage({ seq: 4 });
    const once = appendLive(live, incoming);
    expect(seqs(once)).toEqual([1, 2, 3, 4]);
    expect(seqs(appendLive(once, incoming))).toEqual([1, 2, 3, 4]);
    const historical = windowOf(1, 3, { hasNewer: true });
    expect(appendLive(historical, incoming)).toBe(historical);
  });

  it("bounds the window when paging older and marks the trimmed end", () => {
    // 380 loaded (seq 101..480) + 50 older (51..100) = 430 > WINDOW_MAX (400)
    const window = windowOf(101, 480);
    const page: MessageHistory = {
      items: range(51, 100),
      hasOlder: true,
      hasNewer: true,
      lastReadSeq: 0
    };
    const merged = mergeOlder(window, page);
    expect(merged.items).toHaveLength(WINDOW_MAX);
    expect(merged.items[0]?.seq).toBe(51);
    expect(merged.items.at(-1)?.seq).toBe(51 + WINDOW_MAX - 1);
    expect(merged.hasNewer).toBe(true);
    expect(merged.hasOlder).toBe(true);
  });

  it("refresh merges an overlapping latest page and keeps older loaded history", () => {
    const existing = windowOf(1, 120);
    const latest = fromHistory({
      items: range(80, 130),
      hasOlder: true,
      hasNewer: false,
      lastReadSeq: 125
    });
    const merged = mergeRefresh(existing, latest);
    expect(merged.items[0]?.seq).toBe(1);
    expect(merged.items.at(-1)?.seq).toBe(130);
    expect(merged.items).toHaveLength(130);
    expect(merged.lastReadSeq).toBe(125);
  });

  it("refresh replaces the window after a gap and keeps a historical window as is", () => {
    const latest = fromHistory({
      items: range(300, 349),
      hasOlder: true,
      hasNewer: false,
      lastReadSeq: 349
    });
    expect(seqs(mergeRefresh(windowOf(1, 50), latest))[0]).toBe(300);
    const historical = windowOf(1, 50, { hasNewer: true });
    expect(seqs(mergeRefresh(historical, latest))).toEqual(seqs(historical));
  });

  it("turns deleted messages into tombstones", () => {
    const message = makeMessage({
      attachments: [],
      reactions: [{ emoji: "👍", count: 1, reactedByMe: false, users: [userA] }]
    });
    const deleted = applyDeletion(message, "2026-10-09T09:00:00Z");
    expect(deleted).toMatchObject({ isDeleted: true, body: null, text: "", reactions: [] });
  });
});

describe("reactions", () => {
  it("sets counts and people, keeps others' reactedByMe and removes zero counts", () => {
    const start = [{ emoji: "👍", count: 1, reactedByMe: true, users: [me] }];
    expect(setReaction(start, "👍", 2, undefined)).toEqual([
      { emoji: "👍", count: 2, reactedByMe: true, users: [me] }
    ]);
    expect(setReaction(start, "👍", 2, undefined, [me, userA])[0]?.users).toEqual([me, userA]);
    expect(setReaction(start, "👍", 0, undefined)).toEqual([]);
    expect(setReaction(start, "🎉", 1, false)).toHaveLength(2);
    expect(setReaction(start, "🎉", 1, false)[1]?.users).toEqual([]);
  });

  it("applies realtime events (count and who reacted) for the viewer and for others", () => {
    const message = makeMessage({
      reactions: [{ emoji: "👍", count: 1, reactedByMe: false, users: [userA] }]
    });
    const base = {
      channelId: message.channelId,
      messageId: message.id,
      threadRootId: null,
      emoji: "👍"
    };
    const byOther = applyReactionEvent(
      message,
      { ...base, count: 2, users: [userA, userB], userId: userB.id, added: true },
      me.id
    );
    expect(byOther.reactions[0]).toEqual({
      emoji: "👍",
      count: 2,
      reactedByMe: false,
      users: [userA, userB]
    });
    const byMe = applyReactionEvent(
      byOther,
      { ...base, count: 3, users: [userA, userB, me], userId: me.id, added: true },
      me.id
    );
    expect(byMe.reactions[0]).toEqual({
      emoji: "👍",
      count: 3,
      reactedByMe: true,
      users: [userA, userB, me]
    });
    // An event without people (older server) keeps the list it had.
    const legacy = { ...base, count: 4, userId: "other", added: true } as unknown as Parameters<
      typeof applyReactionEvent
    >[1];
    expect(applyReactionEvent(byMe, legacy, me.id).reactions[0]?.users).toEqual([userA, userB, me]);
  });

  it("toggles optimistically without double counting, adding and removing the viewer", () => {
    const message = makeMessage();
    const added = toggleReactionLocally(message, "🎉", true, me);
    expect(added.reactions).toEqual([{ emoji: "🎉", count: 1, reactedByMe: true, users: [me] }]);
    expect(toggleReactionLocally(added, "🎉", true, me).reactions[0]).toMatchObject({
      count: 1,
      users: [me]
    });
    expect(toggleReactionLocally(added, "🎉", false, me).reactions).toEqual([]);
    const shared = makeMessage({
      reactions: [{ emoji: "👍", count: 2, reactedByMe: true, users: [userA, me] }]
    });
    expect(toggleReactionLocally(shared, "👍", false, me).reactions[0]).toEqual({
      emoji: "👍",
      count: 1,
      reactedByMe: false,
      users: [userA]
    });
  });
});
