import { cn } from "cn";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeft,
  Copy,
  Link2,
  MessageSquareReply,
  Pencil,
  SmilePlus,
  Trash2,
  Users
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ActionSheet, ActionSheetItem } from "@/components/shared/action-sheet";
import { docToPlainText } from "@/components/shared/rich-text/helpers";
import type { ChatMessage } from "@/contracts/chat";

import { EmojiPickerPanel, QUICK_REACTIONS } from "./emoji-picker";
import { useMessageActions } from "./message-context";

export type MessageSheetAbilities = {
  canReact: boolean;
  canReply: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

/**
 * Touch counterpart of the hover toolbar (opened by a long press on a message): quick reactions,
 * the full emoji picker, reply in thread, edit, copy text / link and delete.
 */
export const MessageActionSheet = ({
  message,
  abilities,
  open,
  onOpenChange,
  onShowReactions
}: {
  message: ChatMessage;
  abilities: MessageSheetAbilities;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when the message has reactions: opens the "who reacted" sheet. */
  onShowReactions?: (() => void) | undefined;
}) => {
  const actions = useMessageActions();
  const [picking, setPicking] = useState(false);
  const close = () => {
    setPicking(false);
    onOpenChange(false);
  };
  const run = (action: () => void) => () => {
    close();
    action();
  };
  const react = (emoji: string) => {
    close();
    actions.toggleReaction(
      message,
      emoji,
      !message.reactions.some((reaction) => reaction.emoji === emoji && reaction.reactedByMe)
    );
  };
  const copyText = () => {
    const text = docToPlainText(message.body).trim();
    if (!text) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Đã sao chép nội dung"))
      .catch(() => toast.error("Không sao chép được nội dung"));
  };

  return (
    <ActionSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setPicking(false);
        onOpenChange(next);
      }}
      title={picking ? "Chọn biểu cảm" : (message.author?.displayName ?? "Tin nhắn")}
      description={format(new Date(message.createdAt), "EEEE, d MMMM 'lúc' HH:mm", { locale: vi })}
      leading={
        picking ? (
          <button
            type="button"
            onClick={() => setPicking(false)}
            aria-label="Quay lại thao tác"
            className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-foreground-muted outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-5" />
          </button>
        ) : null
      }
    >
      {picking ? (
        <EmojiPickerPanel
          onSelect={react}
          autoFocusSearch={false}
          className="h-[min(340px,55dvh)] w-full pb-2"
        />
      ) : (
        <>
          {abilities.canReact ? (
            <div
              className="flex items-center justify-between gap-1 border-y px-3 py-2"
              role="group"
              aria-label="Thả biểu cảm"
            >
              {QUICK_REACTIONS.map((emoji) => {
                const mine = message.reactions.some(
                  (reaction) => reaction.emoji === emoji && reaction.reactedByMe
                );
                return (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`Thả ${emoji}`}
                    aria-pressed={mine}
                    onClick={() => react(emoji)}
                    className={cn(
                      "flex size-11 items-center justify-center rounded-full text-[22px] leading-none outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring",
                      mine && "bg-brand-soft ring-1 ring-brand/40"
                    )}
                  >
                    {emoji}
                  </button>
                );
              })}
              <button
                type="button"
                aria-label="Thêm biểu cảm khác"
                onClick={() => setPicking(true)}
                className="flex size-11 items-center justify-center rounded-full bg-muted text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <SmilePlus className="size-5" />
              </button>
            </div>
          ) : null}
          <div className="flex flex-col p-2">
            {onShowReactions ? (
              <ActionSheetItem icon={<Users />} onClick={run(onShowReactions)}>
                Xem ai đã thả biểu cảm
              </ActionSheetItem>
            ) : null}
            {abilities.canReply ? (
              <ActionSheetItem
                icon={<MessageSquareReply />}
                onClick={run(() => actions.openThread(message))}
              >
                Trả lời trong chuỗi
              </ActionSheetItem>
            ) : null}
            {abilities.canEdit ? (
              <ActionSheetItem icon={<Pencil />} onClick={run(() => actions.startEdit(message))}>
                Sửa tin nhắn
              </ActionSheetItem>
            ) : null}
            {!message.isDeleted ? (
              <ActionSheetItem icon={<Copy />} onClick={run(copyText)}>
                Sao chép nội dung
              </ActionSheetItem>
            ) : null}
            <ActionSheetItem icon={<Link2 />} onClick={run(() => actions.copyLink(message))}>
              Sao chép liên kết
            </ActionSheetItem>
            {abilities.canDelete ? (
              <ActionSheetItem
                icon={<Trash2 />}
                destructive
                onClick={run(() => actions.requestDelete(message))}
              >
                Xóa tin nhắn
              </ActionSheetItem>
            ) : null}
          </div>
        </>
      )}
    </ActionSheet>
  );
};
