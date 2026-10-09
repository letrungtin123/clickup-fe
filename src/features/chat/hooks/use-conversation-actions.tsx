import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { MentionSource } from "@/components/shared/rich-text";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import type { ChatChannelDetail, ChatMessage } from "@/contracts/chat";
import type { RichTextDoc } from "@/contracts/rich-text";
import { useSessionContext } from "@/features/auth/hooks";

import type { MessageActions } from "../components/message-context";
import { messageHref } from "@/features/search/model";
import {
  useDeleteMessage,
  useEditMessage,
  useSendMessage,
  useToggleReaction
} from "./use-message-actions";

/** Copies text, falling back to a hidden textarea where the async clipboard is unavailable (plain http). */
export const copyText = async (text: string) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
};

/**
 * Message actions for one conversation surface (main list or thread panel) plus the delete
 * confirmation dialog they need.
 */
export const useConversationActions = (input: {
  channel: ChatChannelDetail;
  inThread: boolean;
  mentionSource: MentionSource;
  nameOf: (userId: string) => string | null;
  onOpenThread: (message: ChatMessage) => void;
}) => {
  const { channel, inThread, mentionSource, nameOf, onOpenThread } = input;
  const session = useSessionContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ChatMessage | null>(null);
  const edit = useEditMessage();
  const remove = useDeleteMessage();
  const react = useToggleReaction();
  const { retry, discard } = useSendMessage(channel.id);

  const { mutate: editMutate } = edit;
  const { mutate: reactMutate } = react;

  const saveEdit = useCallback(
    (message: ChatMessage, body: RichTextDoc, text: string) => {
      setEditingId(null);
      editMutate({ message, body, text });
    },
    [editMutate]
  );

  const actions = useMemo<MessageActions>(
    () => ({
      myId: session.user.id,
      capabilities: channel.capabilities,
      archived: Boolean(channel.archivedAt),
      inThread,
      editingId,
      startEdit: (message) => setEditingId(message.id),
      cancelEdit: () => setEditingId(null),
      saveEdit,
      openThread: onOpenThread,
      toggleReaction: (message, emoji, add) => reactMutate({ message, emoji, add }),
      requestDelete: (message) => setToDelete(message),
      copyLink: (message) => {
        const href = messageHref({
          channelId: message.channelId,
          messageId: message.id,
          threadRootId: message.threadRootId
        });
        void copyText(`${window.location.origin}${href}`).then((ok) =>
          ok ? toast.success("Đã sao chép liên kết tin nhắn") : toast.error("Không sao chép được liên kết.")
        );
      },
      retry,
      discard,
      nameOf,
      mentionSource
    }),
    [
      channel.archivedAt,
      channel.capabilities,
      discard,
      editingId,
      inThread,
      mentionSource,
      nameOf,
      onOpenThread,
      reactMutate,
      retry,
      saveEdit,
      session.user.id
    ]
  );

  const deleteDialog = (
    <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa tin nhắn?</AlertDialogTitle>
          <AlertDialogDescription>
            {toDelete && toDelete.author?.id !== session.user.id
              ? `Tin nhắn của ${toDelete.author?.displayName ?? "thành viên"} sẽ bị xóa với mọi người. Thao tác này không thể hoàn tác.`
              : "Tin nhắn sẽ bị xóa với mọi người trong cuộc trò chuyện. Thao tác này không thể hoàn tác."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (toDelete) remove.mutate(toDelete);
              setToDelete(null);
              setEditingId(null);
            }}
          >
            Xóa tin nhắn
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { actions, deleteDialog, editingId, setEditingId };
};
