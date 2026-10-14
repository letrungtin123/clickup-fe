import { describe, expect, it } from "vitest";

import type { Notification } from "@/contracts/notifications";

import { feedAccepts, parseArchivedEvent, prependToFeed, removeFromFeed, type Feed } from "./feeds";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const notification = (n: number, type: Notification["type"], readAt: string | null = null): Notification => ({
  id: uuid(n),
  type,
  actor: null,
  title: `N${n}`,
  body: null,
  target: {
    projectId: null,
    taskId: null,
    taskKey: null,
    commentId: null,
    channelId: null,
    messageId: null,
    productionTaskId: null,
    jobId: null,
    knowledgeSpaceId: null,
    knowledgeItemId: null
  },
  payload: {},
  department: null,
  createdAt: "2026-10-09T00:00:00.000Z",
  readAt
});

const feedOf = (...items: Notification[]): Feed => ({
  pages: [{ items, pageInfo: { hasMore: false, nextCursor: null }, unreadCount: 0 }],
  pageParams: [null]
});

describe("inbox feeds", () => {
  it("prepends new notifications only to the feeds that list them (BUG-WK-47)", () => {
    const mention = notification(2, "chat.mentioned");
    const assigned = notification(3, "task.assigned");
    const mentions = feedOf(notification(1, "task.mentioned"));
    expect(prependToFeed("mentions", mentions, mention)?.pages[0]?.items.map((item) => item.id)).toEqual([uuid(2), uuid(1)]);
    expect(prependToFeed("mentions", mentions, assigned)).toBe(mentions);
    expect(feedAccepts("unread", notification(4, "task.assigned", "2026-10-09T00:00:00.000Z"))).toBe(false);
    expect(feedAccepts("all", assigned)).toBe(true);
  });

  it("removes archived notifications (BUG-WK-48)", () => {
    const feed = feedOf(notification(1, "task.assigned"), notification(2, "task.mentioned"));
    expect(removeFromFeed(feed, [uuid(1)])?.pages[0]?.items.map((item) => item.id)).toEqual([uuid(2)]);
    expect(removeFromFeed(feed, [uuid(9)])).toBe(feed);
  });

  it("validates archive event payloads", () => {
    expect(parseArchivedEvent({ ids: [uuid(1)], unreadCount: 3 })).toEqual({ ids: [uuid(1)], unreadCount: 3 });
    expect(parseArchivedEvent({ ids: [uuid(1)] })).toEqual({ ids: [uuid(1)], unreadCount: null });
    expect(parseArchivedEvent({ ids: [] })).toBeNull();
    expect(parseArchivedEvent("nope")).toBeNull();
  });
});
