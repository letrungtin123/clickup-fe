import { cn } from "cn";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  AlertCircle,
  Ban,
  Check,
  Copy,
  Info,
  MessageSquareReply,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  SmilePlus,
  Trash2
} from "lucide-react";
import { memo, useRef, useState } from "react";

import {
  docToPlainText,
  RichTextEditor,
  RichTextView,
  type RichTextEditorHandle
} from "@/components/shared/rich-text";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatMessage, ReactionSummary } from "@/contracts/chat";

import type { DisplayMessage } from "../model/timeline";
import { systemSentence } from "../model/system-text";
import { timeAgo } from "../model/time";
import { EmojiPickerPopover, QUICK_REACTIONS } from "./emoji-picker";
import { MessageAttachments } from "./message-attachments";
import { useMessageActions } from "./message-context";

const fullDate = (iso: string) =>
  format(new Date(iso), "EEEE, d MMMM yyyy 'lúc' HH:mm", { locale: vi });
const shortTime = (iso: string) => format(new Date(iso), "HH:mm");

type MessageItemProps = {
  message: DisplayMessage;
  /** Same author within a few minutes: no avatar / name header. */
  grouped: boolean;
  highlighted?: boolean;
  /** Freshly arrived (subtle enter motion). */
  fresh?: boolean;
};

/** One message row: header, rich text, attachments, reactions, thread summary, hover toolbar. */
export const MessageItem = memo(function MessageItem({
  message,
  grouped,
  highlighted = false,
  fresh = false
}: MessageItemProps) {
  const actions = useMessageActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pinned = menuOpen || pickerOpen;
  // The toolbar is mounted only for the hovered / focused row (keeps the tab order and DOM small).
  const [active, setActive] = useState(false);
  const rowProps = {
    tabIndex: -1,
    "data-chat-row": true,
    onMouseEnter: () => setActive(true),
    onMouseLeave: () => setActive(false),
    onFocus: () => setActive(true),
    onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setActive(false);
    }
  };

  if (message.kind === "system") {
    return <SystemRow message={message} />;
  }

  const editing = actions.editingId === message.id;
  const pending = message.pending;
  const mine = message.author?.id === actions.myId;
  const canInteract = !pending && !message.isDeleted && actions.capabilities.canPost;
  const canEdit = mine && !pending && !message.isDeleted && actions.capabilities.canPost;
  const canDelete =
    !pending && !message.isDeleted && !actions.archived && (mine || actions.capabilities.canModerate);
  const showHeader = !grouped;

  return (
    <div
      data-message-id={message.id}
      {...rowProps}
      className={cn(
        "group/message relative flex gap-2.5 px-4 transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-5",
        showHeader ? "pt-2 pb-0.5" : "py-0.5",
        !editing && "hover:bg-surface-hover/60",
        (pinned || editing) && "bg-surface-hover/60",
        highlighted && "bg-warning-soft hover:bg-warning-soft",
        fresh && "animate-in duration-200 fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
      )}
    >
      <div className="w-9 shrink-0">
        {showHeader ? (
          message.author ? (
            <UserAvatar user={message.author} size="lg" className="size-9" />
          ) : null
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <time
                  dateTime={message.createdAt}
                  className="block pt-0.5 text-right text-[10px] leading-5 text-foreground-subtle tabular-nums opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100"
                />
              }
            >
              {shortTime(message.createdAt)}
            </TooltipTrigger>
            <TooltipContent>{fullDate(message.createdAt)}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className={cn("min-w-0 flex-1", pending?.status === "sending" && "opacity-70")}>
        {showHeader ? (
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {message.author?.displayName ?? "Người dùng"}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <time
                    dateTime={message.createdAt}
                    className="shrink-0 text-xs text-foreground-subtle tabular-nums"
                  />
                }
              >
                {shortTime(message.createdAt)}
              </TooltipTrigger>
              <TooltipContent>{fullDate(message.createdAt)}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}

        {editing ? (
          <InlineEditor message={message} />
        ) : message.isDeleted ? (
          <p className="flex items-center gap-1.5 py-0.5 text-[13px] text-foreground-subtle italic">
            <Ban className="size-3.5" aria-hidden="true" />
            Tin nhắn này đã bị xóa.
          </p>
        ) : (
          <div className="text-sm [&_.rt-content]:inline [&_.rt-content>p:last-child]:inline">
            <RichTextView doc={message.body} selfId={actions.myId} className="[&_p]:leading-relaxed" />
            {message.isEdited ? (
              <Tooltip>
                <TooltipTrigger
                  render={<span className="ml-1 text-[11px] text-foreground-subtle" />}
                >
                  (đã sửa)
                </TooltipTrigger>
                <TooltipContent>
                  {message.editedAt ? `Đã sửa ${fullDate(message.editedAt)}` : "Đã sửa"}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        )}

        {!message.isDeleted && message.attachments.length > 0 ? (
          <MessageAttachments attachments={message.attachments} compact={actions.inThread} />
        ) : null}

        {message.reactions.length > 0 ? (
          <ReactionBar
            message={message}
            canReact={canInteract}
            showAdd={active || pinned}
            onPickerOpenChange={setPickerOpen}
          />
        ) : null}

        {!actions.inThread && message.replyCount > 0 ? <ThreadSummary message={message} /> : null}

        {pending ? <PendingStatus message={message} /> : null}
      </div>

      {(active || pinned) &&
      !editing &&
      (canInteract || canEdit || canDelete || (!pending && !message.isDeleted)) ? (
        <div
          className="absolute -top-3.5 right-4 z-10 flex animate-in items-center gap-0.5 rounded-lg border bg-surface-raised p-0.5 shadow-md duration-100 fade-in-0 motion-reduce:animate-none"
          role="toolbar"
          aria-label="Thao tác với tin nhắn"
        >
          {canInteract ? (
            <>
              {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                <ToolbarButton
                  key={emoji}
                  label={`Thả ${emoji}`}
                  onClick={() =>
                    actions.toggleReaction(
                      message,
                      emoji,
                      !message.reactions.some((reaction) => reaction.emoji === emoji && reaction.reactedByMe)
                    )
                  }
                >
                  <span className="text-[15px] leading-none">{emoji}</span>
                </ToolbarButton>
              ))}
              <EmojiPickerPopover
                onOpenChange={setPickerOpen}
                onSelect={(emoji) =>
                  actions.toggleReaction(
                    message,
                    emoji,
                    !message.reactions.some((reaction) => reaction.emoji === emoji && reaction.reactedByMe)
                  )
                }
              />
            </>
          ) : null}
          {!actions.inThread && !pending && message.seq !== null && !message.isDeleted && actions.capabilities.canRead ? (
            <ToolbarButton label="Trả lời trong chuỗi" onClick={() => actions.openThread(message)}>
              <MessageSquareReply className="size-4" />
            </ToolbarButton>
          ) : null}
          {canEdit ? (
            <ToolbarButton label="Sửa tin nhắn" onClick={() => actions.startEdit(message)}>
              <Pencil className="size-3.5" />
            </ToolbarButton>
          ) : null}
          {!pending ? (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger
                aria-label="Thêm thao tác"
                className="flex size-7 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-surface-hover"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => actions.copyLink(message)}>
                  <Copy />
                  Sao chép liên kết
                </DropdownMenuItem>
                {!actions.inThread && message.seq !== null && !message.isDeleted ? (
                  <DropdownMenuItem onClick={() => actions.openThread(message)}>
                    <MessageSquareReply />
                    Trả lời trong chuỗi
                  </DropdownMenuItem>
                ) : null}
                {canEdit ? (
                  <DropdownMenuItem onClick={() => actions.startEdit(message)}>
                    <Pencil />
                    Sửa tin nhắn
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => actions.requestDelete(message)}>
                      <Trash2 />
                      Xóa tin nhắn
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

const ToolbarButton = ({
  label,
  onClick,
  children
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="flex size-7 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

const ReactionBar = ({
  message,
  canReact,
  showAdd,
  onPickerOpenChange
}: {
  message: ChatMessage;
  canReact: boolean;
  showAdd: boolean;
  onPickerOpenChange: (open: boolean) => void;
}) => {
  const actions = useMessageActions();
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {message.reactions.map((reaction) => (
        <ReactionChip
          key={reaction.emoji}
          reaction={reaction}
          disabled={!canReact}
          onToggle={() => actions.toggleReaction(message, reaction.emoji, !reaction.reactedByMe)}
        />
      ))}
      {canReact && showAdd ? (
        <EmojiPickerPopover
          side="top"
          align="start"
          onOpenChange={onPickerOpenChange}
          onSelect={(emoji) =>
            actions.toggleReaction(
              message,
              emoji,
              !message.reactions.some((reaction) => reaction.emoji === emoji && reaction.reactedByMe)
            )
          }
          trigger={
            <button
              type="button"
              className="flex h-6 items-center rounded-full border border-transparent px-1.5 text-foreground-subtle outline-none hover:border-border hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
          label="Thêm biểu cảm"
        >
          <SmilePlus className="size-3.5" aria-hidden="true" />
        </EmojiPickerPopover>
      ) : null}
    </div>
  );
};

const ReactionChip = ({
  reaction,
  disabled,
  onToggle
}: {
  reaction: ReactionSummary;
  disabled: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    aria-pressed={reaction.reactedByMe}
    aria-label={`${reaction.emoji} ${reaction.count} lượt${reaction.reactedByMe ? ", gồm bạn" : ""}`}
    className={cn(
      "flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
      reaction.reactedByMe
        ? "border-brand/40 bg-brand-soft font-semibold text-brand-text"
        : "border-border bg-surface text-foreground-muted hover:border-border-strong enabled:hover:bg-surface-hover"
    )}
  >
    <span className="text-sm leading-none">{reaction.emoji}</span>
    {reaction.count}
  </button>
);

const ThreadSummary = ({ message }: { message: ChatMessage }) => {
  const actions = useMessageActions();
  return (
    <button
      type="button"
      onClick={() => actions.openThread(message)}
      className="group/thread mt-1 -ml-1 flex items-center gap-2 rounded-md px-1 py-0.5 text-xs outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="font-semibold text-brand-text group-hover/thread:underline">
        {message.replyCount} câu trả lời
      </span>
      {message.lastReplyAt ? (
        <span className="text-foreground-subtle">
          Gần nhất {timeAgo(message.lastReplyAt)}
        </span>
      ) : null}
    </button>
  );
};

const PendingStatus = ({ message }: { message: DisplayMessage }) => {
  const actions = useMessageActions();
  if (message.pending?.status === "sending") {
    return (
      <p className="mt-0.5 text-[11px] text-foreground-subtle" aria-live="polite">
        Đang gửi…
      </p>
    );
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-danger" role="alert">
      <AlertCircle className="size-3.5" aria-hidden="true" />
      {message.pending?.error ?? "Không gửi được."}
      <button
        type="button"
        onClick={() => actions.retry(message.clientMessageId ?? message.id)}
        className="inline-flex items-center gap-1 rounded font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RotateCcw className="size-3" aria-hidden="true" />
        Thử lại
      </button>
      <button
        type="button"
        onClick={() => actions.discard(message.clientMessageId ?? message.id)}
        className="rounded font-medium text-foreground-muted underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Hủy tin nhắn
      </button>
    </p>
  );
};

const SystemRow = ({ message }: { message: ChatMessage }) => {
  const actions = useMessageActions();
  return (
    <div
      className="flex items-center gap-2.5 px-4 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-5"
      data-message-id={message.id}
      data-chat-row
      tabIndex={-1}
    >
      <span className="flex w-9 shrink-0 justify-center">
        <Info className="size-3.5 text-foreground-subtle" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] text-foreground-muted">
        {systemSentence(message, actions.nameOf)}
        <time
          dateTime={message.createdAt}
          title={fullDate(message.createdAt)}
          className="ml-2 text-[11px] text-foreground-subtle tabular-nums"
        >
          {shortTime(message.createdAt)}
        </time>
      </p>
    </div>
  );
};

/** Inline edit: Enter saves, Shift+Enter breaks the line, Esc cancels. */
const InlineEditor = ({ message }: { message: ChatMessage }) => {
  const actions = useMessageActions();
  const handle = useRef<RichTextEditorHandle | null>(null);
  const save = () => {
    const doc = handle.current?.getDoc();
    if (!doc || handle.current?.isEmpty()) {
      if (message.attachments.length === 0) {
        actions.requestDelete(message);
        return;
      }
    }
    if (doc) actions.saveEdit(message, doc, docToPlainText(doc));
  };
  return (
    <div
      className="mt-1 rounded-lg border bg-background px-3 py-2 shadow-xs focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-ring/30"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          actions.cancelEdit();
        }
      }}
    >
      <RichTextEditor
        ref={handle}
        variant="message"
        value={message.body}
        submitOnEnter
        autoFocus
        mentionSource={actions.mentionSource}
        onSubmit={(doc) => actions.saveEdit(message, doc, docToPlainText(doc))}
        aria-label="Sửa tin nhắn"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto hidden text-[11px] text-foreground-subtle sm:inline">
          Esc để hủy · Enter để lưu
        </span>
        <Button size="sm" variant="ghost" onClick={actions.cancelEdit}>
          Hủy
        </Button>
        <Button size="sm" onClick={save}>
          <Check />
          Lưu
        </Button>
      </div>
    </div>
  );
};

