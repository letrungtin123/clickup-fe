import { create } from "zustand";

import { docMentionsAll } from "@/components/shared/rich-text/helpers";
import type { ChatAttachment, ChatMessage } from "@/contracts/chat";
import type { RichTextDoc } from "@/contracts/rich-text";
import type { UserRef } from "@/contracts/work";

import type { DisplayMessage } from "./timeline";

/**
 * Optimistic outgoing messages, keyed by conversation (channel or thread). A pending message is shown
 * until the server copy with the same `clientMessageId` reaches the cache (POST response or the
 * `chat:message` echo, whichever comes first); failures stay visible with retry / discard.
 */
export type PendingMessage = {
  clientMessageId: string;
  channelId: string;
  threadRootId: string | null;
  body: RichTextDoc;
  text: string;
  attachments: ChatAttachment[];
  author: UserRef;
  createdAt: string;
  status: "sending" | "failed";
  error?: string | undefined;
};

export const conversationKey = (channelId: string, threadRootId: string | null | undefined) =>
  `${channelId}:${threadRootId ?? "root"}`;

type PendingState = {
  byConversation: Record<string, PendingMessage[]>;
  add: (message: PendingMessage) => void;
  update: (clientMessageId: string, patch: Partial<PendingMessage>) => void;
  remove: (clientMessageId: string) => void;
  find: (clientMessageId: string) => PendingMessage | undefined;
};

const removeFrom = (state: Record<string, PendingMessage[]>, clientMessageId: string) => {
  let changed = false;
  const next: Record<string, PendingMessage[]> = {};
  for (const [key, list] of Object.entries(state)) {
    const filtered = list.filter((message) => message.clientMessageId !== clientMessageId);
    if (filtered.length !== list.length) changed = true;
    if (filtered.length > 0) next[key] = filtered;
  }
  return changed ? next : state;
};

export const usePendingStore = create<PendingState>()((set, get) => ({
  byConversation: {},
  add: (message) =>
    set((state) => {
      const key = conversationKey(message.channelId, message.threadRootId);
      const list = state.byConversation[key] ?? [];
      return { byConversation: { ...state.byConversation, [key]: [...list, message] } };
    }),
  update: (clientMessageId, patch) =>
    set((state) => {
      const next: Record<string, PendingMessage[]> = {};
      for (const [key, list] of Object.entries(state.byConversation)) {
        next[key] = list.map((message) =>
          message.clientMessageId === clientMessageId ? { ...message, ...patch } : message
        );
      }
      return { byConversation: next };
    }),
  remove: (clientMessageId) =>
    set((state) => ({ byConversation: removeFrom(state.byConversation, clientMessageId) })),
  find: (clientMessageId) =>
    Object.values(get().byConversation)
      .flat()
      .find((message) => message.clientMessageId === clientMessageId)
}));

const emptyPending: PendingMessage[] = [];

export const usePendingMessages = (channelId: string, threadRootId: string | null) =>
  usePendingStore(
    (state) => state.byConversation[conversationKey(channelId, threadRootId)] ?? emptyPending
  );

export const pendingToDisplay = (pending: PendingMessage): DisplayMessage => ({
  id: pending.clientMessageId,
  channelId: pending.channelId,
  seq: null,
  threadRootId: pending.threadRootId,
  kind: "user",
  author: pending.author,
  body: pending.body,
  text: pending.text,
  systemEvent: null,
  clientMessageId: pending.clientMessageId,
  mentions: [],
  // The body is already sanitized for this conversation: an @all node means @all (PD-061).
  mentionsAll: docMentionsAll(pending.body),
  attachments: pending.attachments,
  reactions: [],
  replyCount: 0,
  lastReplyAt: null,
  isEdited: false,
  editedAt: null,
  isDeleted: false,
  deletedAt: null,
  createdAt: pending.createdAt,
  pending: { status: pending.status, error: pending.error }
});

/**
 * Confirmed messages followed by still-pending ones. A pending message whose server copy is already
 * in `confirmed` (matched by clientMessageId) is dropped, so nothing renders twice while the store
 * catches up.
 */
export const mergeWithPending = (
  confirmed: readonly ChatMessage[],
  pending: readonly PendingMessage[]
): DisplayMessage[] => {
  if (pending.length === 0) {
    return confirmed as DisplayMessage[];
  }
  const confirmedClientIds = new Set(
    confirmed.map((message) => message.clientMessageId).filter((id): id is string => Boolean(id))
  );
  const visible = pending
    .filter((message) => !confirmedClientIds.has(message.clientMessageId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(pendingToDisplay);
  return visible.length === 0 ? (confirmed as DisplayMessage[]) : [...confirmed, ...visible];
};
