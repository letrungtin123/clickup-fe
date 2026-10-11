import { describe, expect, it } from "vitest";

import type { Notification } from "@/contracts/notifications";

import {
  allowsPopup,
  BELL_LIMIT,
  bellItems,
  bellLabel,
  isNotificationPreferencesResult,
  shouldToastNotification
} from "./bell";
import { applyReadToFeed, prependToFeed, removeFromFeed, type Feed } from "./feeds";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const notification = (n: number, readAt: string | null = null): Notification => ({
  id: uuid(n),
  type: n % 2 === 0 ? "task.assigned" : "production.task_waiting_qc",
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
    jobId: null
  },
  payload: {},
  createdAt: new Date(Date.UTC(2026, 9, 10, 0, 0, 0) + n * 60_000).toISOString(),
  readAt
});

/** Newest first, split into pages of `size`. */
const feedOf = (count: number, { size = 30, hasMore = false } = {}): Feed => {
  const items = Array.from({ length: count }, (_, index) => notification(count - index));
  const pages: Feed["pages"] = [];
  for (let start = 0; start < items.length || pages.length === 0; start += size) {
    pages.push({
      items: items.slice(start, start + size),
      pageInfo: { hasMore: false, nextCursor: null },
      unreadCount: 0
    });
  }
  const last = pages.at(-1);
  if (last) last.pageInfo = { hasMore, nextCursor: hasMore ? "next" : null };
  return { pages, pageParams: pages.map((_, index) => (index === 0 ? null : `p${index}`)) };
};

const ids = (items: readonly Notification[]) => items.map((item) => item.title);

describe("notification bell list", () => {
  it("shows the 10 newest notifications of the cached inbox feed", () => {
    expect(BELL_LIMIT).toBe(10);
    const items = bellItems(feedOf(25));
    expect(items).toHaveLength(10);
    expect(ids(items)).toEqual(["N25", "N24", "N23", "N22", "N21", "N20", "N19", "N18", "N17", "N16"]);
  });

  it("reads across pages and never repeats an item", () => {
    const feed = feedOf(12, { size: 4 });
    expect(ids(bellItems(feed))).toEqual(["N12", "N11", "N10", "N9", "N8", "N7", "N6", "N5", "N4", "N3"]);
    const first = feed.pages[0]!;
    const duplicated: Feed = { ...feed, pages: [first, { ...first }, ...feed.pages.slice(1)] };
    expect(ids(bellItems(duplicated, 6))).toEqual(["N12", "N11", "N10", "N9", "N8", "N7"]);
  });

  it("is empty without a cached feed", () => {
    expect(bellItems(undefined)).toEqual([]);
    expect(bellItems(feedOf(0))).toEqual([]);
  });

  it("shows what the first page has when the inbox holds fewer than 10", () => {
    expect(ids(bellItems(feedOf(3, { hasMore: true })))).toEqual(["N3", "N2", "N1"]);
  });

  it("follows realtime cache updates: arrivals go on top, archived items leave", () => {
    const feed = feedOf(10);
    const arrived = prependToFeed("all", feed, notification(99));
    expect(ids(bellItems(arrived))[0]).toBe("N99");
    expect(bellItems(arrived)).toHaveLength(10);
    const archived = removeFromFeed(arrived, [uuid(99), uuid(10)]);
    expect(ids(bellItems(archived)).slice(0, 2)).toEqual(["N9", "N8"]);
  });

  it("reflects read state from the shared cache", () => {
    const readAt = "2026-10-11T00:00:00.000Z";
    const feed = applyReadToFeed(feedOf(3), "all", readAt);
    expect(bellItems(feed).every((item) => item.readAt === readAt)).toBe(true);
    const one = applyReadToFeed(feedOf(3), [uuid(2)], readAt);
    expect(bellItems(one).map((item) => item.readAt !== null)).toEqual([false, true, false]);
  });

  it("names the bell with the unread count for screen readers", () => {
    expect(bellLabel(0)).toBe("Thông báo");
    expect(bellLabel(3)).toBe("Thông báo, 3 chưa đọc");
    expect(bellLabel(120)).toBe("Thông báo, 120 chưa đọc");
  });
});

describe("notification pop-ups", () => {
  const base = { pathname: "/", bellOpen: false, popup: true };

  it("toasts new notifications anywhere but the inbox and an open bell", () => {
    expect(shouldToastNotification(base)).toBe(true);
    expect(shouldToastNotification({ ...base, pathname: "/p/1/l/2" })).toBe(true);
    expect(shouldToastNotification({ ...base, pathname: "/inbox" })).toBe(false);
    expect(shouldToastNotification({ ...base, bellOpen: true })).toBe(false);
  });

  it("stays quiet when web notifications are switched off", () => {
    expect(shouldToastNotification({ ...base, popup: false })).toBe(false);
  });

  it("follows the event's popup flag, else the session preference, else on", () => {
    expect(allowsPopup(false, true)).toBe(false);
    expect(allowsPopup(true, false)).toBe(true);
    expect(allowsPopup(undefined, false)).toBe(false);
    expect(allowsPopup(undefined, true)).toBe(true);
    expect(allowsPopup(undefined, undefined)).toBe(true);
  });
});

describe("session follows the notification preferences", () => {
  it("recognises the PATCH /me/notification-preferences result only", () => {
    expect(isNotificationPreferencesResult({ notifyWeb: false, notifyEmail: false, emailAvailable: false })).toBe(true);
    expect(isNotificationPreferencesResult({ notifyWeb: false })).toBe(false);
    expect(isNotificationPreferencesResult({ unreadCount: 3 })).toBe(false);
    expect(isNotificationPreferencesResult(undefined)).toBe(false);
  });
});
