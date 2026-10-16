import { isDirectKind, type ChatChannel, type ChatMessage } from "@/contracts/chat";
import type { Notification } from "@/contracts/notifications";

/**
 * When does a realtime event become an OS notification? (PD-055) Pure, unit-tested rules; the runtime feeds them
 * the event, the cached sidebar entry and where the viewer is.
 */

/** Events older than this are not "new" any more (a replay or a very late delivery): no pop-up. */
export const STALE_EVENT_MS = 10 * 60 * 1000;

/** Where the viewer is, as far as this tab knows. */
export type ViewerState = {
  /** This tab: document visible AND the window focused. */
  focusedHere: boolean;
  /** This tab's pathname. */
  pathname: string;
  /** Another tab of the app holds the focus right now (fresh focus record): its pathname, else null. */
  focusedElsewherePath: string | null;
};

/** `/c/<id>` (any query) → the conversation id on screen, else null. */
export const conversationIdFromPath = (pathname: string): string | null => {
  const match = /^\/c\/([^/?#]+)/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

/** Is the person looking at this conversation right now (in this tab or in another focused tab)? */
export const isReadingConversation = (viewer: ViewerState, channelId: string) =>
  (viewer.focusedHere && conversationIdFromPath(viewer.pathname) === channelId) ||
  (viewer.focusedElsewherePath !== null &&
    conversationIdFromPath(viewer.focusedElsewherePath) === channelId);

/** Is any tab of the app in front of the person (visible + focused)? */
export const isAppFocused = (viewer: ViewerState) =>
  viewer.focusedHere || viewer.focusedElsewherePath !== null;

const isStale = (createdAt: string, now: number) => {
  const at = Date.parse(createdAt);
  return Number.isFinite(at) && now - at > STALE_EVENT_MS;
};

export type ChatVerdict =
  | "show"
  | "own"
  | "system"
  | "deleted"
  | "stale"
  | "unknown-channel"
  | "muted"
  | "not-mentioned"
  | "thread"
  | "reading"
  | "focused";

export type ChatNotifyInput = {
  channelId: string;
  message: Pick<
    ChatMessage,
    "id" | "kind" | "author" | "threadRootId" | "mentions" | "mentionsAll" | "isDeleted" | "createdAt"
  >;
  /** The sidebar entry (kind + my notify level), null when the conversation is not cached. */
  channel: Pick<ChatChannel, "kind" | "notifyLevel"> | null;
  myId: string;
  now: number;
  viewer: ViewerState;
};

/**
 * Does this chat message deserve an alert at all, wherever the person is? Shared by the OS pop-up (below) and the
 * in-app toast (features/notifications/chat-toast-runtime.tsx).
 * - never my own, system or deleted messages, nor stale ones;
 * - muted ("Tắt thông báo") → never;
 * - DM / group DM → always; channel at "Mọi tin nhắn" → every top-level message; "Chỉ khi nhắc tên" → only when
 *   I am @mentioned; thread replies → only DMs or when I am @mentioned;
 * - unknown conversation (sidebar not loaded yet) → only an @mention;
 * - @all (PD-061) is a mention of every member but its author, and it reaches everyone: it passes the muted level,
 *   "Chỉ khi nhắc tên", the thread rule and an unknown conversation (owner: muted members still get @all).
 */
export const chatAlertVerdict = ({
  message,
  channel,
  myId,
  now
}: Omit<ChatNotifyInput, "viewer" | "channelId">): ChatVerdict => {
  if (message.author?.id === myId) return "own";
  if (message.kind === "system" || !message.author) return "system";
  if (message.isDeleted) return "deleted";
  if (isStale(message.createdAt, now)) return "stale";
  // @all mentions every member but its author (the author already returned "own" above).
  const mentionsAll = message.mentionsAll === true && message.author.id !== myId;
  const mentionsMe = mentionsAll || message.mentions.includes(myId);
  if (!channel) {
    if (!mentionsMe) return "unknown-channel";
  } else {
    if (channel.notifyLevel === "none" && !mentionsAll) return "muted";
    const direct = isDirectKind(channel.kind);
    if (message.threadRootId !== null) {
      if (!direct && !mentionsMe) return "thread";
    } else if (!direct && channel.notifyLevel === "mentions" && !mentionsMe) {
      return "not-mentioned";
    }
  }
  return "show";
};

/**
 * Chat message → OS pop-up? The alert rule above, then: skipped while I am reading that very conversation (this
 * tab, or another focused tab), and while any tab of the app is in front — that tab shows the in-app toast instead
 * (owner, 2026-10-15), so a message never alerts twice.
 */
export const chatVerdict = ({ channelId, message, channel, myId, now, viewer }: ChatNotifyInput): ChatVerdict => {
  const alert = chatAlertVerdict({ message, channel, myId, now });
  if (alert !== "show") return alert;
  if (isReadingConversation(viewer, channelId)) return "reading";
  if (isAppFocused(viewer)) return "focused";
  return "show";
};

export type InboxVerdict = "show" | "chat" | "stale" | "focused";

/**
 * A reply in a channel thread (not a DM): the chat:message event does not say who is in the thread, so the server's
 * "chat.thread_replied" notification (sent to the root's author and earlier repliers) brings the OS pop-up instead.
 * DM threads already pop up through the chat rule.
 */
export const isChannelThreadReply = (notification: { type: string; payload?: unknown }) => {
  if (notification.type !== "chat.thread_replied") return false;
  const kind = (notification.payload as Record<string, unknown> | null | undefined)?.channelKind;
  return kind !== "dm" && kind !== "group_dm";
};

/**
 * Inbox notification → pop-up? Chat types ("chat.*", "channel.*") are covered by the chat rule, except a reply in a
 * channel thread (isChannelThreadReply); the rest
 * pops up only while no tab of the app is in front (a focused tab shows its own in-app toast).
 */
export const inboxVerdict = ({
  notification,
  now,
  viewer
}: {
  notification: Pick<Notification, "type" | "createdAt"> & { payload?: Notification["payload"] };
  now: number;
  viewer: ViewerState;
}): InboxVerdict => {
  if ((notification.type.startsWith("chat.") || notification.type.startsWith("channel.")) && !isChannelThreadReply(notification)) {
    return "chat";
  }
  if (isStale(notification.createdAt, now)) return "stale";
  if (isAppFocused(viewer)) return "focused";
  return "show";
};
