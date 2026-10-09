import type { QueryClient } from "@tanstack/react-query";

import type {
  ChatChannelCollection,
  ChatChannelDetail,
  ChatMessage,
  ChatMessageDeletedEvent,
  ChatMessageEvent,
  ChatMessageUpdatedEvent,
  ChatReactionEvent,
  ChatReadEvent,
  ThreadRootSummary
} from "@/contracts/chat";

import { chatKeys } from "../keys";
import { bumpUnread, updateSidebarChannel } from "../model/channels";
import { conversationKey, usePendingStore } from "../model/pending";
import { appendReply, mapThread, type ThreadState } from "../model/thread";
import { useActiveChannelStore, useTypingStore } from "../model/ui-state";
import {
  appendLive,
  applyDeletion,
  applyEdit,
  applyReactionEvent,
  applyThreadSummary,
  mapMessages,
  type MessageWindow
} from "../model/window";

/**
 * Applies chat events (realtime or our own API responses) to the query cache. Realtime payloads are
 * merged directly — no refetch — so bursts of events never turn into request storms.
 */

/** Updates one message wherever it is cached: the channel window and any thread showing it. */
export const patchMessage = (
  queryClient: QueryClient,
  input: { channelId: string; messageId: string; threadRootId: string | null },
  update: (message: ChatMessage) => ChatMessage
) => {
  if (input.threadRootId === null) {
    queryClient.setQueryData<MessageWindow>(chatKeys.messages(input.channelId), (window) =>
      window ? mapMessages(window, (message) => message.id === input.messageId, update) : window
    );
    // A top-level message may be the root of an open thread.
    queryClient.setQueryData<ThreadState>(chatKeys.thread(input.messageId), (thread) =>
      thread ? mapThread(thread, input.messageId, update) : thread
    );
  } else {
    queryClient.setQueryData<ThreadState>(chatKeys.thread(input.threadRootId), (thread) =>
      thread ? mapThread(thread, input.messageId, update) : thread
    );
  }
};

const applyRootSummary = (
  queryClient: QueryClient,
  channelId: string,
  summary: ThreadRootSummary
) =>
  patchMessage(queryClient, { channelId, messageId: summary.id, threadRootId: null }, (message) =>
    applyThreadSummary(message, summary)
  );

/**
 * A message reached us (our POST response or the `chat:message` echo/broadcast). Idempotent:
 * duplicates are merged by id and pending copies are dropped by clientMessageId.
 */
export const receiveMessage = (
  queryClient: QueryClient,
  event: ChatMessageEvent,
  myId: string,
  options: { fromRealtime: boolean }
) => {
  const { message, channelId } = event;
  const mine = message.author?.id === myId;

  if (message.threadRootId === null) {
    queryClient.setQueryData<MessageWindow>(chatKeys.messages(channelId), (window) =>
      window ? appendLive(window, message) : window
    );
  } else {
    queryClient.setQueryData<ThreadState>(chatKeys.thread(message.threadRootId), (thread) =>
      thread ? appendReply(thread, message, event.threadRoot) : thread
    );
    if (event.threadRoot) {
      applyRootSummary(queryClient, channelId, event.threadRoot);
    }
  }

  if (mine && message.clientMessageId) {
    usePendingStore.getState().remove(message.clientMessageId);
  }
  if (message.author) {
    useTypingStore
      .getState()
      .clear(conversationKey(channelId, message.threadRootId), message.author.id);
  }

  // Sidebar ordering / unread counts (top-level messages only: replies never count as unread).
  if (message.seq === null) return;
  const seq = message.seq;
  const active = useActiveChannelStore.getState();
  const watching = active.channelId === channelId && active.live;
  queryClient.setQueryData<ChatChannelCollection>(chatKeys.channels(), (collection) =>
    updateSidebarChannel(collection, channelId, (channel) => {
      if (mine || watching || !options.fromRealtime) {
        if (seq <= channel.lastMessageSeq) return channel;
        return {
          ...channel,
          lastMessageSeq: seq,
          lastMessageAt: message.createdAt,
          ...(mine
            ? {
                lastReadSeq: Math.max(channel.lastReadSeq ?? 0, seq),
                unreadCount: 0,
                mentionCount: 0
              }
            : {})
        };
      }
      return bumpUnread(channel, {
        seq,
        createdAt: message.createdAt,
        mentionsMe: message.mentions.includes(myId)
      });
    })
  );
  queryClient.setQueryData<ChatChannelDetail>(chatKeys.channel(channelId), (detail) =>
    detail && seq > detail.lastMessageSeq
      ? { ...detail, lastMessageSeq: seq, lastMessageAt: message.createdAt }
      : detail
  );
};

export const receiveEdit = (queryClient: QueryClient, event: ChatMessageUpdatedEvent) =>
  patchMessage(
    queryClient,
    { channelId: event.channelId, messageId: event.messageId, threadRootId: event.threadRootId },
    (message) => applyEdit(message, event)
  );

export const receiveDeletion = (queryClient: QueryClient, event: ChatMessageDeletedEvent) => {
  patchMessage(
    queryClient,
    { channelId: event.channelId, messageId: event.messageId, threadRootId: event.threadRootId },
    (message) => applyDeletion(message, event.deletedAt)
  );
  if (event.threadRoot) {
    applyRootSummary(queryClient, event.channelId, event.threadRoot);
    queryClient.setQueryData<ThreadState>(chatKeys.thread(event.threadRoot.id), (thread) =>
      thread ? { ...thread, root: applyThreadSummary(thread.root, event.threadRoot!) } : thread
    );
  }
};

export const receiveReaction = (queryClient: QueryClient, event: ChatReactionEvent, myId: string) =>
  patchMessage(
    queryClient,
    { channelId: event.channelId, messageId: event.messageId, threadRootId: event.threadRootId },
    (message) => applyReactionEvent(message, event, myId)
  );

export const receiveReadState = (queryClient: QueryClient, state: ChatReadEvent) => {
  queryClient.setQueryData<ChatChannelCollection>(chatKeys.channels(), (collection) =>
    updateSidebarChannel(collection, state.channelId, (channel) =>
      (channel.lastReadSeq ?? 0) > state.lastReadSeq
        ? channel
        : {
            ...channel,
            lastReadSeq: state.lastReadSeq,
            unreadCount: state.unreadCount,
            mentionCount: state.mentionCount
          }
    )
  );
  queryClient.setQueryData<ChatChannelDetail>(chatKeys.channel(state.channelId), (detail) =>
    detail
      ? {
          ...detail,
          lastReadSeq: Math.max(detail.lastReadSeq ?? 0, state.lastReadSeq),
          unreadCount: state.unreadCount,
          mentionCount: state.mentionCount
        }
      : detail
  );
};
