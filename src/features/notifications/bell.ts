import type { Notification, NotificationPage } from "@/contracts/notifications";
import { NotificationPreferencesSchema } from "@/contracts/production-catalog";

/** SPEC Phase 4: the header bell lists the 10 newest notifications; the rest live in /inbox. */
export const BELL_LIMIT = 10;

/** The cached inbox feed (InfiniteData), read structurally. */
type FeedPages = { pages: readonly NotificationPage[] };

/**
 * The bell dropdown reads the cached "all" inbox feed (the same cache realtime events patch), so it
 * needs no request of its own once the inbox or the home widget has loaded it: newest first, at most
 * `limit`, each notification once.
 */
export const bellItems = (feed: FeedPages | undefined, limit = BELL_LIMIT): Notification[] => {
  const out: Notification[] = [];
  const seen = new Set<string>();
  for (const page of feed?.pages ?? []) {
    for (const item of page.items) {
      if (out.length >= limit) return out;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
};

/** Accessible name of the bell button (the badge itself is aria-hidden). */
export const bellLabel = (unread: number) =>
  unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo";

/**
 * Should a newly arrived notification pop up as a toast? Never while the person is already looking
 * at their notifications (the inbox page or an open bell list show it live) or when they switched
 * web pop-ups off ("Thông báo trên web"); the inbox, the bell and the badges keep updating anyway.
 */
export const shouldToastNotification = ({
  pathname,
  bellOpen,
  popup
}: {
  pathname: string;
  bellOpen: boolean;
  popup: boolean;
}) => popup && !bellOpen && pathname !== "/inbox";

/**
 * "Thông báo trên web" (app_users.notify_web, PD-021) for one `notification:new` event: the server
 * stamps the recipient's preference on the event as `popup`; events from older servers carry none,
 * so the session's copy of the preference decides (on by default — PLAN §8).
 */
export const allowsPopup = (eventPopup: boolean | undefined, sessionNotifyWeb: boolean | undefined) =>
  eventPopup ?? sessionNotifyWeb ?? true;

/** True for a PATCH /me/notification-preferences result (the only response of that shape). */
export const isNotificationPreferencesResult = (data: unknown) =>
  NotificationPreferencesSchema.safeParse(data).success;
