import { createContext, useContext } from "react";

import type { ChannelCapabilities, ChatMessage } from "@/contracts/chat";
import type { RichTextDoc } from "@/contracts/rich-text";
import type { MentionSource } from "@/components/shared/rich-text";

/**
 * Actions available to every message row of one conversation. Provided once per list so rows can
 * stay memoized on their message alone.
 */
export type MessageActions = {
  myId: string;
  capabilities: ChannelCapabilities;
  /** Archived channels are read-only (no delete either). */
  archived: boolean;
  /** Rows rendered inside the thread panel (no "reply in thread", no thread summary). */
  inThread: boolean;
  editingId: string | null;
  startEdit: (message: ChatMessage) => void;
  cancelEdit: () => void;
  saveEdit: (message: ChatMessage, body: RichTextDoc, text: string) => void;
  openThread: (message: ChatMessage) => void;
  toggleReaction: (message: ChatMessage, emoji: string, add: boolean) => void;
  requestDelete: (message: ChatMessage) => void;
  copyLink: (message: ChatMessage) => void;
  retry: (clientMessageId: string) => void;
  discard: (clientMessageId: string) => void;
  nameOf: (userId: string) => string | null;
  mentionSource: MentionSource | undefined;
  /** The conversation offers @all (channels and group DMs, PD-061): the inline editor keeps it. */
  allowMentionAll: boolean;
};

export const MessageActionsContext = createContext<MessageActions | null>(null);

export const useMessageActions = () => {
  const value = useContext(MessageActionsContext);
  if (!value) throw new Error("useMessageActions must be used inside MessageActionsContext");
  return value;
};
