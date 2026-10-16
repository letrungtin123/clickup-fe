import { cn } from "cn";
import {
  Archive,
  CaseSensitive,
  Eye,
  FileWarning,
  LogIn,
  Megaphone,
  Paperclip,
  RotateCcw,
  SendHorizontal,
  X
} from "lucide-react";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { docMentionsAll, isEmptyDoc, prepareDoc } from "@/components/shared/rich-text/helpers";
import type { RichTextEditorHandle } from "@/components/shared/rich-text/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatChannelDetail } from "@/contracts/chat";
import type { RichTextDoc } from "@/contracts/rich-text";
import { useSessionContext } from "@/features/auth/hooks";
import { useTouchPrimary } from "@/hooks/use-pointer";
import { getSocket } from "@/lib/realtime/socket";

import type { UploadItem, useUploads } from "../hooks/use-attachments";
import { useArchiveChannel, useJoinChannel } from "../hooks/use-channels";
import { useMentionSource } from "../hooks/use-mention-source";
import { useSendMessage } from "../hooks/use-message-actions";
import { channelLabel } from "../model/channels";
import { allowsMentionAll } from "../model/mention-all";
import { useDraftStore } from "../model/drafts";
import { conversationKey } from "../model/pending";
import { selectTypers, useTypingStore } from "../model/ui-state";
import { formatBytes } from "../model/files";
import { FileTypeIcon } from "./file-type-icon";

const TYPING_EMIT_MS = 3000;

/**
 * The editor (Tiptap, ~100 kB gz) is its own chunk: the conversation renders while it loads and the
 * fallback keeps the composer's shape (PERF-16).
 */
const RichTextEditor = lazy(() =>
  import("@/components/shared/rich-text/rich-text-editor").then((module) => ({ default: module.RichTextEditor }))
);

const EditorFallback = ({ label }: { label: string }) => (
  <div className="min-h-9 px-3 pt-2.5 pb-1 text-sm text-foreground-subtle" aria-busy="true">
    {label}
  </div>
);

type ComposerProps = {
  channel: ChatChannelDetail;
  threadRootId: string | null;
  uploads: ReturnType<typeof useUploads>;
  placeholder?: string;
  autoFocus?: boolean;
  /** ↑ in an empty composer edits the viewer's last message. */
  onEditLast?: (() => void) | undefined;
  /** Called right before an optimistic send (e.g. jump back to the live end). */
  onBeforeSend?: (() => void) | undefined;
  nameOf: (userId: string) => string | null;
  className?: string;
};

/**
 * Message composer: shared rich text editor (Enter sends, Shift+Enter breaks lines), @mentions
 * scoped to who can see the conversation, paste/drag/attach files with progress, drafts, typing
 * signal. Replaced by an explanation when the viewer cannot post.
 */
export const Composer = ({
  channel,
  threadRootId,
  uploads,
  placeholder,
  autoFocus = false,
  onEditLast,
  onBeforeSend,
  nameOf,
  className
}: ComposerProps) => {
  const session = useSessionContext();
  // Soft keyboards have no Shift+Enter: on touch, Enter breaks the line and the button sends.
  const touch = useTouchPrimary();
  const handle = useRef<RichTextEditorHandle | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const draftKey = conversationKey(channel.id, threadRootId);
  const [initialDraft] = useState(() => useDraftStore.getState().drafts[draftKey] ?? null);
  const [empty, setEmpty] = useState(() => isEmptyDoc(initialDraft));
  const allowMentionAll = allowsMentionAll(channel.kind);
  // The draft @mentions everyone (PD-061): a quiet hint with how many people it reaches — never a confirmation.
  const [hasMentionAll, setHasMentionAll] = useState(() => docMentionsAll(initialDraft));
  const [showToolbar, setShowToolbar] = useState(false);
  const lastTyping = useRef(0);
  const mentionSource = useMentionSource(channel);
  const { send } = useSendMessage(channel.id);

  const onChange = (doc: RichTextDoc) => {
    const isEmpty = isEmptyDoc(doc);
    setEmpty(isEmpty);
    setHasMentionAll(docMentionsAll(doc));
    useDraftStore.getState().setDraft(draftKey, isEmpty ? null : doc);
    if (!isEmpty && Date.now() - lastTyping.current > TYPING_EMIT_MS) {
      lastTyping.current = Date.now();
      getSocket()?.emit("chat:typing", { channelId: channel.id, threadRootId });
    }
  };

  const submit = (doc?: RichTextDoc) => {
    if (uploads.uploading) {
      toast.info("Đợi tệp tải lên xong rồi gửi nhé.");
      return;
    }
    if (uploads.hasErrors) {
      toast.error("Hãy thử lại hoặc gỡ các tệp tải lên bị lỗi trước khi gửi.");
      return;
    }
    const body = doc ?? handle.current?.getDoc() ?? null;
    const prepared = prepareDoc(body, "message", { allowEmpty: true, allowMentionAll });
    if (!prepared.ok) {
      toast.error(prepared.message);
      return;
    }
    const hasText = prepared.text.trim().length > 0;
    if (!hasText && uploads.readyCount === 0) return;
    onBeforeSend?.();
    send({
      body: prepared.doc,
      text: prepared.text,
      attachments: uploads.take(),
      threadRootId
    });
    handle.current?.clear();
    useDraftStore.getState().setDraft(draftKey, null);
    setEmpty(true);
    setHasMentionAll(false);
    lastTyping.current = 0;
    handle.current?.focus();
  };

  const blocked = composerBlock(channel);
  if (blocked) {
    return <ComposerNotice channel={channel} reason={blocked} className={className} />;
  }

  const canSend = (!empty || uploads.readyCount > 0) && !uploads.uploading;
  const mentionAllReach = allowMentionAll && hasMentionAll ? Math.max(0, channel.memberCount - 1) : 0;
  const label = threadRootId ? "Trả lời…" : `Nhắn ${channelLabel(channel)}`;

  return (
    <div className={cn("px-3 pb-3 md:px-5 md:pb-4", className)}>
      <div
        className="rounded-xl border bg-surface shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:border-brand/40 focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring/25"
        // Capture phase: runs before the editor sees the key, so these never double-handle.
        onKeyDownCapture={(event) => {
          const plain = !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey;
          const inEditor = event.target instanceof Element && event.target.closest(".ProseMirror");
          if (!plain || !inEditor || !handle.current?.isEmpty()) return;
          if (event.key === "ArrowUp" && onEditLast && uploads.items.length === 0) {
            event.preventDefault();
            event.stopPropagation();
            onEditLast();
            return;
          }
          // Enter with only attachments still sends (the editor ignores empty documents).
          if (event.key === "Enter" && !touch && uploads.items.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            submit();
          }
        }}
      >
        {uploads.items.length > 0 ? <UploadTray uploads={uploads} /> : null}
        <Suspense fallback={<EditorFallback label={placeholder ?? label} />}>
          <RichTextEditor
            ref={handle}
            variant="message"
            value={initialDraft}
            submitOnEnter={!touch}
            autoFocus={autoFocus}
            toolbar={showToolbar}
            placeholder={placeholder ?? label}
            aria-label={label}
            mentionSource={mentionSource}
            allowMentionAll={allowMentionAll}
            onChange={onChange}
            onSubmit={(doc) => submit(doc)}
            onPasteFiles={uploads.addFiles}
            className={cn(showToolbar && "px-2 pt-1.5")}
            contentClassName="px-3 pt-2.5 pb-1 text-sm"
          />
        </Suspense>
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <ComposerIconButton label="Đính kèm tệp" onClick={() => fileInput.current?.click()}>
            <Paperclip />
          </ComposerIconButton>
          <ComposerIconButton
            label={showToolbar ? "Ẩn thanh định dạng" : "Hiện thanh định dạng"}
            pressed={showToolbar}
            onClick={() => setShowToolbar((value) => !value)}
          >
            <CaseSensitive />
          </ComposerIconButton>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) uploads.addFiles(files);
            }}
          />
          {mentionAllReach > 0 ? (
            <span
              className="ml-auto flex min-w-0 items-center gap-1 pr-2 text-[11px] font-medium text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]"
              title="Mọi thành viên sẽ nhận thông báo, kể cả người đã tắt thông báo."
            >
              <Megaphone className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">@all: thông báo đến {mentionAllReach} thành viên</span>
            </span>
          ) : (
            <span className="ml-auto hidden pr-2 text-[11px] text-foreground-subtle lg:inline">
              <kbd className="font-sans">Enter</kbd> để gửi ·{" "}
              <kbd className="font-sans">Shift + Enter</kbd> xuống dòng
            </span>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  aria-label="Gửi tin nhắn"
                  disabled={!canSend}
                  onClick={() => submit()}
                  className={cn(mentionAllReach > 0 ? "shrink-0" : "ml-auto lg:ml-0", !canSend && "opacity-40")}
                />
              }
            >
              {uploads.uploading ? <Spinner /> : <SendHorizontal />}
            </TooltipTrigger>
            <TooltipContent>Gửi (Enter)</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <TypingIndicator
        channelId={channel.id}
        threadRootId={threadRootId}
        myId={session.user.id}
        nameOf={nameOf}
      />
    </div>
  );
};

const ComposerIconButton = ({
  label,
  onClick,
  pressed,
  children
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className="flex size-7 items-center justify-center rounded-md text-foreground-muted outline-none pointer-coarse:size-10 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-surface-hover aria-pressed:text-foreground [&_svg]:size-4 pointer-coarse:[&_svg]:size-5"
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

const UploadTray = ({ uploads }: { uploads: ReturnType<typeof useUploads> }) => (
  <ul className="flex flex-wrap gap-2 border-b px-3 pt-3 pb-2.5" aria-label="Tệp đính kèm">
    {uploads.items.map((item) => (
      <UploadChip
        key={item.localId}
        item={item}
        onRemove={() => uploads.remove(item.localId)}
        onRetry={() => uploads.retry(item.localId)}
      />
    ))}
  </ul>
);

const UploadChip = ({
  item,
  onRemove,
  onRetry
}: {
  item: UploadItem;
  onRemove: () => void;
  onRetry: () => void;
}) => {
  return (
    <li
      className={cn(
        "group/upload relative flex h-12 w-52 items-center gap-2 overflow-hidden rounded-lg border bg-background pr-7 pl-1.5",
        item.status === "error" && "border-danger/40 bg-danger-soft"
      )}
    >
      {item.previewUrl ? (
        <img src={item.previewUrl} alt="" className="size-9 shrink-0 rounded-md object-cover" />
      ) : (
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md",
            item.status === "error" ? "text-danger" : "bg-brand-soft text-brand-text"
          )}
        >
          {item.status === "error" ? (
            <FileWarning className="size-4" aria-hidden="true" />
          ) : (
            <FileTypeIcon mimeType={item.mimeType} fileName={item.name} className="size-4" />
          )}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium">{item.name}</span>
        <span className="truncate text-[11px] text-foreground-muted">
          {item.status === "uploading"
            ? `Đang tải lên… ${Math.round(item.progress * 100)}%`
            : item.status === "error"
              ? (item.error ?? "Tải lên thất bại")
              : formatBytes(item.size)}
        </span>
      </span>
      {item.status === "error" && item.retryable !== false ? (
        <button
          type="button"
          onClick={onRetry}
          aria-label={`Tải lại ${item.name}`}
          className="flex size-6 shrink-0 items-center pointer-coarse:size-10 justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="size-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Gỡ ${item.name}`}
        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3" />
      </button>
      {item.status === "uploading" ? (
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand transition-transform duration-200"
          style={{ transform: `scaleX(${Math.max(0.04, item.progress)})` }}
          aria-hidden="true"
        />
      ) : null}
    </li>
  );
};

/** "Minh đang nhập…" for the conversation (others only). */
export const TypingIndicator = ({
  channelId,
  threadRootId,
  myId,
  nameOf
}: {
  channelId: string;
  threadRootId: string | null;
  myId: string;
  nameOf: (userId: string) => string | null;
}) => {
  const typers = useTypingStore(
    useShallow(selectTypers(conversationKey(channelId, threadRootId), myId))
  );
  const text = useMemo(() => {
    if (typers.length === 0) return "";
    const names = typers.map((id) => nameOf(id) ?? "Ai đó");
    if (names.length === 1) return `${names[0]} đang nhập…`;
    if (names.length === 2) return `${names[0]} và ${names[1]} đang nhập…`;
    return "Nhiều người đang nhập…";
  }, [nameOf, typers]);
  return (
    <p
      className="flex h-5 items-center gap-1.5 px-1 pt-1 text-[11px] text-foreground-muted"
      aria-live="polite"
    >
      {text ? (
        <>
          <span className="flex gap-0.5" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="size-1 animate-bounce rounded-full bg-foreground-subtle motion-reduce:animate-none"
                style={{ animationDelay: `${dot * 120}ms` }}
              />
            ))}
          </span>
          {text}
        </>
      ) : null}
    </p>
  );
};

type BlockReason = "archived" | "preview" | "view-only" | "no-post";

const composerBlock = (channel: ChatChannelDetail): BlockReason | null => {
  if (channel.capabilities.canPost) return null;
  if (channel.archivedAt) return "archived";
  if (!channel.isMember && channel.capabilities.canJoin) return "preview";
  if (channel.isMember && channel.myAccess === "view") return "view-only";
  return "no-post";
};

const ComposerNotice = ({
  channel,
  reason,
  className
}: {
  channel: ChatChannelDetail;
  reason: BlockReason;
  className?: string | undefined;
}) => {
  const join = useJoinChannel(channel.id);
  const archive = useArchiveChannel(channel.id);
  const content: Record<BlockReason, { icon: typeof Eye; text: string }> = {
    archived: {
      icon: Archive,
      text: "Kênh đã được lưu trữ. Bạn vẫn xem được tin nhắn nhưng không thể gửi mới."
    },
    preview: {
      icon: Eye,
      text: `Bạn đang xem trước ${channelLabel(channel)}. Tham gia để gửi tin và nhận thông báo.`
    },
    "view-only": {
      icon: Eye,
      text: "Bạn chỉ có quyền xem trong kênh này. Liên hệ quản trị kênh nếu cần gửi tin."
    },
    "no-post": { icon: Eye, text: "Bạn không thể gửi tin nhắn trong cuộc trò chuyện này." }
  };
  const { icon: Icon, text } = content[reason];
  return (
    <div className={cn("px-3 pb-3 md:px-5 md:pb-4", className)}>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-surface/60 px-4 py-4 text-center sm:flex-row sm:text-left">
        <Icon className="size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
        <p className="flex-1 text-[13px] text-foreground-muted">{text}</p>
        {reason === "preview" ? (
          <Button size="sm" onClick={() => join.mutate()} disabled={join.isPending}>
            {join.isPending ? <Spinner /> : <LogIn />}
            Tham gia kênh
          </Button>
        ) : null}
        {reason === "archived" && channel.capabilities.canArchive ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => archive.mutate(false)}
            disabled={archive.isPending}
          >
            {archive.isPending ? <Spinner /> : <RotateCcw />}
            Khôi phục kênh
          </Button>
        ) : null}
      </div>
    </div>
  );
};
