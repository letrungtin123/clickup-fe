import { isDirectKind, type ChatChannel, type ChatMessage } from "@/contracts/chat";
import type { Notification } from "@/contracts/notifications";
import { docToPlainText } from "@/components/shared/rich-text/helpers";
import { channelTitle } from "@/features/chat/model/channels";

/** What an OS notification says and where its click leads (PD-055). Pure, unit-tested. */
export type DesktopContent = {
  title: string;
  body: string;
  /** Same tag in several tabs → the OS keeps one pop-up. */
  tag: string;
  /** App path opened on click (null = just focus the app). */
  path: string | null;
};

export const PREVIEW_MAX = 140;
export const HIDDEN_PREVIEW = "Bạn có tin nhắn mới";
export const ATTACHMENT_PREVIEW = "📎 Đã gửi tệp";

/** Whitespace collapsed to single spaces, cut at `max` characters (by code point, emoji-safe) with "…". */
export const truncatePreview = (text: string, max = PREVIEW_MAX) => {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : flat;
};

/**
 * Plain-text preview of a message: the server-derived `text`, else the rich-text body; attachments only →
 * "📎 Đã gửi tệp" (or "📎 Đã gửi 3 tệp").
 */
export const messagePreview = (
  message: Pick<ChatMessage, "text" | "body" | "attachments">
): string => {
  const text = truncatePreview(message.text.trim() ? message.text : docToPlainText(message.body));
  if (text) return text;
  const files = message.attachments.length;
  if (files > 1) return `📎 Đã gửi ${files} tệp`;
  if (files === 1) return ATTACHMENT_PREVIEW;
  return HIDDEN_PREVIEW;
};

/** `/c/<id>?message=<id>` (+ `thread=<rootId>` for a reply), as the channel screen reads its deep links. */
export const conversationPath = (
  channelId: string,
  message: Pick<ChatMessage, "id" | "threadRootId">
) => {
  const params = new URLSearchParams();
  if (message.threadRootId) params.set("thread", message.threadRootId);
  params.set("message", message.id);
  return `/c/${encodeURIComponent(channelId)}?${params.toString()}`;
};

export const chatContent = ({
  channelId,
  message,
  channel,
  showPreview
}: {
  channelId: string;
  message: Pick<ChatMessage, "id" | "author" | "threadRootId" | "text" | "body" | "attachments">;
  channel: Pick<ChatChannel, "kind" | "name" | "participants"> | null;
  showPreview: boolean;
}): DesktopContent => {
  const sender = message.author?.displayName.trim() || "Ai đó";
  let title = sender;
  if (channel?.kind === "group_dm") {
    title = `${sender} · ${channelTitle(channel)}`;
  } else if (channel && !isDirectKind(channel.kind)) {
    title = `${sender} · #${channel.name ?? "kênh"}`;
  }
  const preview = showPreview ? messagePreview(message) : HIDDEN_PREVIEW;
  return {
    title,
    body: showPreview && message.threadRootId ? `Trả lời trong chủ đề: ${preview}` : preview,
    tag: `chat:${message.id}`,
    path: conversationPath(channelId, message)
  };
};

/**
 * Inbox notification: the subject (task, job, channel… title) as the title, the sentence ("Minh đã giao cho bạn …")
 * and the excerpt as the body.
 */
export const inboxContent = (
  notification: Pick<Notification, "id" | "title" | "body">,
  sentence: string
): DesktopContent => {
  const subject = notification.title.trim();
  const excerpt = notification.body?.trim() ?? "";
  const lines = [sentence.trim(), excerpt].filter(Boolean);
  return {
    title: subject || sentence.trim() || "Nesso Work",
    body: truncatePreview(subject ? lines.join(" — ") : excerpt, 180),
    tag: `notif:${notification.id}`,
    path: null
  };
};
