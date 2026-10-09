import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import type {
  ChatAttachment,
  ChatChannelCollection,
  ChatChannelDetail,
  ChatMessage
} from "@/contracts/chat";
import type { RichTextDoc } from "@/contracts/rich-text";
import { useSessionContext } from "@/features/auth/hooks";

import { chatApi } from "../api";
import { chatErrorMessage, isRateLimited } from "../errors";
import { chatKeys } from "../keys";
import { markSidebarRead, updateSidebarChannel } from "../model/channels";
import { usePendingStore, type PendingMessage } from "../model/pending";
import { applyDeletion, setReaction, toggleReactionLocally } from "../model/window";
import { patchMessage, receiveMessage } from "../realtime/cache";

/** RFC 4122 v4 id. `crypto.randomUUID` only exists in secure contexts (not plain-http LAN access). */
export const newClientId = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Optimistic send: the message shows immediately as "sending", then is swapped for the server copy
 * (same clientMessageId → same row, no flicker). Failures stay in place with retry / discard;
 * retries reuse the clientMessageId, so the server never creates a duplicate.
 */
export const useSendMessage = (channelId: string) => {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const myId = session.user.id;

  // Lets the rate-limit toast retry through the latest deliver() without a self-reference.
  const deliverRef = useRef<((pending: PendingMessage) => Promise<void>) | null>(null);

  const deliver = useCallback(
    async (pending: PendingMessage) => {
      const store = usePendingStore.getState();
      try {
        const message = await chatApi.send(channelId, {
          body: pending.body,
          clientMessageId: pending.clientMessageId,
          threadRootId: pending.threadRootId,
          attachmentIds: pending.attachments.map((attachment) => attachment.id)
        });
        receiveMessage(queryClient, { channelId, message, threadRoot: null }, myId, {
          fromRealtime: false
        });
        store.remove(pending.clientMessageId);
      } catch (error) {
        const message = chatErrorMessage(error, "Không gửi được tin nhắn.");
        store.update(pending.clientMessageId, { status: "failed", error: message });
        if (isRateLimited(error)) {
          toast.error(message, {
            id: `rate:${channelId}`,
            action: {
              label: "Thử lại",
              onClick: () => {
                const current = usePendingStore.getState().find(pending.clientMessageId);
                if (current) {
                  usePendingStore.getState().update(current.clientMessageId, { status: "sending", error: undefined });
                  void deliverRef.current?.(current);
                }
              }
            }
          });
        }
      }
    },
    [channelId, myId, queryClient]
  );
  useEffect(() => {
    deliverRef.current = deliver;
  }, [deliver]);

  const send = useCallback(
    (input: {
      body: RichTextDoc;
      text: string;
      attachments: ChatAttachment[];
      threadRootId: string | null;
    }) => {
      const pending: PendingMessage = {
        clientMessageId: newClientId(),
        channelId,
        threadRootId: input.threadRootId,
        body: input.body,
        text: input.text,
        attachments: input.attachments,
        author: {
          id: session.user.id,
          displayName: session.user.displayName,
          email: session.user.email,
          avatarUrl: null
        },
        createdAt: new Date().toISOString(),
        status: "sending"
      };
      usePendingStore.getState().add(pending);
      void deliver(pending);
      return pending.clientMessageId;
    },
    [channelId, deliver, session.user.displayName, session.user.email, session.user.id]
  );

  const retry = useCallback(
    (clientMessageId: string) => {
      const pending = usePendingStore.getState().find(clientMessageId);
      if (!pending) return;
      usePendingStore.getState().update(clientMessageId, { status: "sending", error: undefined });
      void deliver({ ...pending, status: "sending" });
    },
    [deliver]
  );

  const discard = useCallback((clientMessageId: string) => {
    const pending = usePendingStore.getState().find(clientMessageId);
    usePendingStore.getState().remove(clientMessageId);
    // Uploaded-but-unsent files would otherwise linger until the server cleans them up.
    for (const attachment of pending?.attachments ?? []) {
      void chatApi.deleteUpload(attachment.id).catch(() => undefined);
    }
  }, []);

  return { send, retry, discard };
};

type MessageRef = Pick<ChatMessage, "id" | "channelId" | "threadRootId">;

const refOf = (message: MessageRef) => ({
  channelId: message.channelId,
  messageId: message.id,
  threadRootId: message.threadRootId
});

export const useEditMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { message: ChatMessage; body: RichTextDoc; text: string }) =>
      chatApi.edit(input.message.id, input.body),
    meta: { errorMessage: false },
    onMutate: ({ message, body, text }) => {
      patchMessage(queryClient, refOf(message), (current) => ({
        ...current,
        body,
        text,
        isEdited: true,
        editedAt: new Date().toISOString()
      }));
      return { previous: message };
    },
    onSuccess: (updated) =>
      patchMessage(queryClient, refOf(updated), (current) => ({
        ...updated,
        // keep fields the edit response may not reflect yet (live reply counts / reactions)
        replyCount: Math.max(current.replyCount, updated.replyCount),
        reactions: current.reactions
      })),
    onError: (error, _input, context) => {
      if (context?.previous) {
        const previous = context.previous;
        patchMessage(queryClient, refOf(previous), (current) => ({
          ...current,
          body: previous.body,
          text: previous.text,
          isEdited: previous.isEdited,
          editedAt: previous.editedAt
        }));
      }
      toast.error(chatErrorMessage(error, "Không sửa được tin nhắn."));
    }
  });
};

export const useDeleteMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: ChatMessage) => chatApi.deleteMessage(message.id),
    meta: { errorMessage: false },
    onMutate: (message) => {
      patchMessage(queryClient, refOf(message), (current) =>
        applyDeletion(current, new Date().toISOString())
      );
      return { previous: message };
    },
    onSuccess: () => toast.success("Đã xóa tin nhắn"),
    onError: (error, _message, context) => {
      if (context?.previous) {
        const previous = context.previous;
        patchMessage(queryClient, refOf(previous), () => previous);
      }
      toast.error(chatErrorMessage(error, "Không xóa được tin nhắn."));
    }
  });
};

export const useToggleReaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { message: ChatMessage; emoji: string; add: boolean }) =>
      input.add
        ? chatApi.react(input.message.id, input.emoji)
        : chatApi.unreact(input.message.id, input.emoji),
    meta: { errorMessage: false },
    onMutate: ({ message, emoji, add }) => {
      patchMessage(queryClient, refOf(message), (current) =>
        toggleReactionLocally(current, emoji, add)
      );
      return { previous: message.reactions };
    },
    onSuccess: (result, { message }) =>
      patchMessage(queryClient, refOf(message), (current) => ({
        ...current,
        reactions: setReaction(current.reactions, result.emoji, result.count, result.reactedByMe)
      })),
    onError: (error, { message }, context) => {
      if (context?.previous) {
        const previous = context.previous;
        patchMessage(queryClient, refOf(message), (current) => ({ ...current, reactions: previous }));
      }
      toast.error(chatErrorMessage(error, "Không thêm được biểu cảm."));
    }
  });
};

/**
 * Debounced "read up to seq". Updates the sidebar badge immediately; the server reply (and the
 * `chat:read` event on other devices) brings the authoritative counts.
 */
export const useMarkRead = (channelId: string, enabled: boolean) => {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeq = useRef(0);
  const sentSeq = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return useCallback(
    (seq: number) => {
      if (!enabled || seq <= 0) return;
      const sidebarEntry = queryClient
        .getQueryData<ChatChannelCollection>(chatKeys.channels())
        ?.items.find((channel) => channel.id === channelId);
      const knownRead = Math.max(sentSeq.current, sidebarEntry?.lastReadSeq ?? 0);
      if (seq <= knownRead && (sidebarEntry?.unreadCount ?? 0) === 0) return;
      queryClient.setQueryData<ChatChannelCollection>(chatKeys.channels(), (collection) =>
        updateSidebarChannel(collection, channelId, (channel) => markSidebarRead(channel, seq))
      );
      pendingSeq.current = Math.max(pendingSeq.current, seq);
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        const target = pendingSeq.current;
        if (target <= sentSeq.current) return;
        sentSeq.current = target;
        chatApi
          .markRead(channelId, target)
          .then((state) => {
            queryClient.setQueryData<ChatChannelCollection>(chatKeys.channels(), (collection) =>
              updateSidebarChannel(collection, channelId, (channel) =>
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
            queryClient.setQueryData<ChatChannelDetail>(chatKeys.channel(channelId), (detail) =>
              detail ? { ...detail, lastReadSeq: state.lastReadSeq, unreadCount: state.unreadCount } : detail
            );
          })
          .catch(() => {
            sentSeq.current = 0; // retry on the next visible message
          });
      }, 600);
    },
    [channelId, enabled, queryClient]
  );
};
