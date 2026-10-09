import { format, isSameDay, isSameYear, isToday, isYesterday } from "date-fns";
import { vi } from "date-fns/locale";

import type { ChatMessage } from "@/contracts/chat";

/** Optimistic state of a message the viewer is sending (absent for confirmed messages). */
export type PendingState = { status: "sending" | "failed"; error?: string | undefined };

export type DisplayMessage = ChatMessage & { pending?: PendingState | undefined };

export type TimelineRow =
  | { kind: "day"; key: string; date: Date }
  | { kind: "unread"; key: "unread"; count: number }
  | { kind: "message"; key: string; message: DisplayMessage; grouped: boolean };

/** Consecutive messages by the same author within this gap render as one group (no repeated header). */
export const GROUP_GAP_MS = 5 * 60 * 1000;

/** Stable React/virtualizer key: the client id survives the optimistic → confirmed swap. */
export const messageKey = (message: Pick<ChatMessage, "id" | "clientMessageId">) =>
  message.clientMessageId ?? message.id;

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** "Hôm nay", "Hôm qua", "Thứ Hai, 6 tháng 10" (+ year when not the current year). */
export const formatDayLabel = (date: Date, now = new Date()) => {
  if (isToday(date)) return "Hôm nay";
  if (isYesterday(date)) return "Hôm qua";
  const label = format(
    date,
    isSameYear(date, now) ? "EEEE, d 'tháng' M" : "EEEE, d 'tháng' M, yyyy",
    {
      locale: vi
    }
  );
  return label.charAt(0).toLocaleUpperCase("vi") + label.slice(1);
};

/**
 * Index of the first unread message: the first top-level message after the read marker that was not
 * written by the viewer. null when everything is read or the viewer has no read marker.
 */
export const findFirstUnreadIndex = (
  messages: readonly DisplayMessage[],
  lastReadSeq: number | null,
  myId: string
) => {
  if (lastReadSeq === null) {
    return null;
  }
  const index = messages.findIndex(
    (message) =>
      !message.pending &&
      message.seq !== null &&
      message.seq > lastReadSeq &&
      message.author?.id !== myId
  );
  return index === -1 ? null : index;
};

export const canGroupWith = (previous: DisplayMessage | undefined, message: DisplayMessage) => {
  if (!previous) return false;
  if (previous.kind !== "user" || message.kind !== "user") return false;
  if (!previous.author || !message.author || previous.author.id !== message.author.id) return false;
  const gap = new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime();
  if (gap < 0 || gap > GROUP_GAP_MS) return false;
  return isSameDay(new Date(previous.createdAt), new Date(message.createdAt));
};

/**
 * Turns an ordered message list into renderable rows: day separators, the "Tin mới" divider (before
 * the first unread message) and per-message grouping. Pure — memoize on its inputs.
 */
export const buildTimeline = (
  messages: readonly DisplayMessage[],
  options: { lastReadSeq: number | null; myId: string; showUnread?: boolean }
): TimelineRow[] => {
  const rows: TimelineRow[] = [];
  const unreadIndex =
    options.showUnread === false
      ? null
      : findFirstUnreadIndex(messages, options.lastReadSeq, options.myId);
  const unreadCount =
    unreadIndex === null
      ? 0
      : messages.slice(unreadIndex).filter((message) => !message.pending && message.seq !== null)
          .length;

  let previous: DisplayMessage | undefined;
  messages.forEach((message, index) => {
    const date = new Date(message.createdAt);
    const newDay = !previous || !isSameDay(new Date(previous.createdAt), date);
    if (newDay) {
      rows.push({ kind: "day", key: `day:${dayKey(date)}`, date });
    }
    const divider = index === unreadIndex;
    if (divider) {
      rows.push({ kind: "unread", key: "unread", count: unreadCount });
    }
    rows.push({
      kind: "message",
      key: messageKey(message),
      message,
      grouped: !newDay && !divider && canGroupWith(previous, message)
    });
    previous = message;
  });
  return rows;
};
