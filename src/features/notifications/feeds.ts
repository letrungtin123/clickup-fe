import type { InfiniteData } from "@tanstack/react-query";

import type { Notification, NotificationPage, NotificationType } from "@/contracts/notifications";

/**
 * Inbox feeds kept in the query cache: "all", "unread" and "mentions" (the "Nhắc đến" tab, filtered by
 * the server with `types=` so every page is full of mentions — BUG-WK-47). Realtime events patch all
 * three in place.
 */
export type FeedName = "all" | "unread" | "mentions";
export type Feed = InfiniteData<NotificationPage, string | null>;

export const feedNames: readonly FeedName[] = ["all", "unread", "mentions"];

/** Types shown under "Nhắc đến". */
export const mentionTypeList = [
  "task.mentioned",
  "chat.mentioned",
  "production.mentioned"
] as const satisfies readonly NotificationType[];

const mentionTypeSet: ReadonlySet<string> = new Set(mentionTypeList);

/** Does `feed` list this notification? (New arrivals are only prepended where they belong.) */
export const feedAccepts = (feed: FeedName, notification: Pick<Notification, "type" | "readAt">) => {
  if (feed === "unread") return notification.readAt === null;
  if (feed === "mentions") return mentionTypeSet.has(notification.type);
  return true;
};

/** Maps every item; `null` drops it. Returns the same object when nothing changed. */
export const mapFeed = (feed: Feed | undefined, update: (item: Notification) => Notification | null) => {
  if (!feed) return feed;
  let changed = false;
  const pages = feed.pages.map((page) => {
    let pageChanged = false;
    const items: Notification[] = [];
    for (const item of page.items) {
      const next = update(item);
      if (next !== item) pageChanged = true;
      if (next) items.push(next);
    }
    if (!pageChanged) return page;
    changed = true;
    return { ...page, items };
  });
  return changed ? { ...feed, pages } : feed;
};

export const prependToFeed = (name: FeedName, feed: Feed | undefined, notification: Notification) => {
  const first = feed?.pages[0];
  if (!feed || !first || !feedAccepts(name, notification)) return feed;
  if (feed.pages.some((page) => page.items.some((item) => item.id === notification.id))) return feed;
  return { ...feed, pages: [{ ...first, items: [notification, ...first.items] }, ...feed.pages.slice(1)] };
};

/** Marks `ids` (or everything) read at `readAt`; items already read keep their timestamp. */
export const applyReadToFeed = (feed: Feed | undefined, ids: readonly string[] | "all", readAt: string) => {
  const idSet = ids === "all" ? null : new Set(ids);
  return mapFeed(feed, (item) => (item.readAt || (idSet && !idSet.has(item.id)) ? item : { ...item, readAt }));
};

/** Archived notifications leave every feed (BUG-WK-48). */
export const removeFromFeed = (feed: Feed | undefined, ids: readonly string[]) => {
  const idSet = new Set(ids);
  return mapFeed(feed, (item) => (idSet.has(item.id) ? null : item));
};

/**
 * `notification:archived` payload (ids + unread count), or a `notification:read` payload flagged
 * `archived: true`. Validated by hand: the event may be newer than the synced contract.
 */
export const parseArchivedEvent = (payload: unknown): { ids: string[]; unreadCount: number | null } | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const ids = Array.isArray(record.ids) ? record.ids.filter((id): id is string => typeof id === "string") : null;
  if (!ids || ids.length === 0) return null;
  return { ids, unreadCount: typeof record.unreadCount === "number" ? record.unreadCount : null };
};
