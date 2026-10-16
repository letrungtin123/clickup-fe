import { ArrowLeft, MessagesSquare, RefreshCw, X } from "lucide-react";
import { motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ChatChannelDetail } from "@/contracts/chat";
import { useSessionContext } from "@/features/auth/hooks";
import { isApiError } from "@/lib/api/errors";

import { useUploads } from "../hooks/use-attachments";
import { useConversationActions } from "../hooks/use-conversation-actions";
import { useMentionSource } from "../hooks/use-mention-source";
import { useThread } from "../hooks/use-thread";
import { useUserLookup } from "../hooks/use-user-lookup";
import { channelLabel } from "../model/channels";
import { mergeWithPending, usePendingMessages } from "../model/pending";
import { buildTimeline } from "../model/timeline";
import { Composer } from "./composer";
import { MessageActionsContext } from "./message-context";
import { MessageItem } from "./message-item";

export type ThreadPanelMode = "docked" | "overlay" | "fullscreen";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Right-hand thread panel (`?thread=<rootId>`): root message, replies, reply composer, live updates.
 * Docked on desktop, overlay on tablet, full screen on mobile (back closes it).
 */
export const ThreadPanel = ({
  channel,
  rootId,
  focusMessageId,
  mode,
  onClose
}: {
  channel: ChatChannelDetail;
  rootId: string;
  focusMessageId: string | null;
  mode: ThreadPanelMode;
  onClose: () => void;
}) => {
  const frameRef = useRef<HTMLElement | null>(null);

  // Esc closes the thread (the editor consumes the first Esc to blur itself).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (
        document.querySelector(
          "[data-slot=dialog-content], [role=menu], [data-slot=popover-content]"
        )
      )
        return;
      const target = event.target;
      if (target instanceof Node && frameRef.current?.contains(target)) {
        onClose();
        return;
      }
      if (target === document.body) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const body = (
    <ThreadBody
      channel={channel}
      rootId={rootId}
      focusMessageId={focusMessageId}
      onClose={onClose}
      mobile={mode === "fullscreen"}
    />
  );

  if (mode === "docked") {
    return (
      <motion.aside
        ref={frameRef}
        aria-label="Chuỗi trả lời"
        className="flex h-full w-[clamp(20rem,30vw,27rem)] shrink-0 flex-col border-l bg-surface"
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.2, ease }}
      >
        {body}
      </motion.aside>
    );
  }
  if (mode === "overlay") {
    return (
      <>
        <motion.div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-(--scrim)"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        />
        <motion.section
          ref={frameRef}
          role="dialog"
          aria-modal="true"
          aria-label="Chuỗi trả lời"
          className="fixed inset-y-0 right-0 z-50 flex w-[min(30rem,92vw)] flex-col border-l bg-surface shadow-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.24, ease }}
        >
          {body}
        </motion.section>
      </>
    );
  }
  return (
    <motion.section
      ref={frameRef}
      role="dialog"
      aria-modal="true"
      aria-label="Chuỗi trả lời"
      className="fixed inset-x-0 top-0 bottom-(--keyboard-inset) z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] pb-(--safe-bottom)"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.24, ease }}
    >
      {body}
    </motion.section>
  );
};

const ThreadBody = ({
  channel,
  rootId,
  focusMessageId,
  onClose,
  mobile
}: {
  channel: ChatChannelDetail;
  rootId: string;
  focusMessageId: string | null;
  onClose: () => void;
  mobile: boolean;
}) => {
  const session = useSessionContext();
  const { query, loadMore, loadingMore, loadError } = useThread(rootId);
  const thread = query.data;
  const pending = usePendingMessages(channel.id, rootId);
  const replies = useMemo(
    () => mergeWithPending(thread?.items ?? [], pending),
    [pending, thread?.items]
  );
  const allMessages = useMemo(() => (thread ? [thread.root, ...thread.items] : []), [thread]);
  const nameOf = useUserLookup(channel, allMessages);
  const mentionSource = useMentionSource(channel);
  const uploads = useUploads(channel.id);
  const noopOpen = useCallback(() => undefined, []);
  const { actions, deleteDialog, setEditingId } = useConversationActions({
    channel,
    inThread: true,
    mentionSource,
    nameOf,
    onOpenThread: noopOpen
  });
  const rows = useMemo(
    () => buildTimeline(replies, { lastReadSeq: null, myId: session.user.id, showUnread: false }),
    [replies, session.user.id]
  );

  // Scroll: open at the bottom (or the focused reply), follow new replies while at the bottom.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const [highlight, setHighlight] = useState<string | null>(focusMessageId);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !thread) return;
    if (highlight) {
      const target = element.querySelector(`[data-message-id="${highlight}"]`);
      if (target) {
        stick.current = false;
        target.scrollIntoView({ block: "center" });
        return;
      }
    }
    if (stick.current) element.scrollTop = element.scrollHeight;
  }, [highlight, rows.length, thread]);
  useEffect(() => {
    if (!highlight) return undefined;
    const timer = setTimeout(() => setHighlight(null), 2400);
    return () => clearTimeout(timer);
  }, [highlight]);
  // Keyboard opening / composer growing shrinks the list: keep the newest reply in view.
  const loaded = thread !== undefined;
  useEffect(() => {
    const element = scrollRef.current;
    if (!loaded || !element || typeof ResizeObserver === "undefined") return undefined;
    let height = element.clientHeight;
    const observer = new ResizeObserver(() => {
      if (element.clientHeight === height) return;
      height = element.clientHeight;
      if (stick.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loaded]);

  const lastOwnReply = [...replies]
    .reverse()
    .find(
      (message) => message.author?.id === session.user.id && !message.isDeleted && !message.pending
    );

  const header = (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
      {mobile ? (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Quay lại kênh">
          <ArrowLeft />
        </Button>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-sm font-semibold">Chuỗi trả lời</h2>
        <p className="truncate text-xs text-foreground-muted">{channelLabel(channel)}</p>
      </div>
      {!mobile ? (
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng chuỗi trả lời">
          <X />
        </Button>
      ) : null}
    </div>
  );

  let content: ReactNode;
  if (query.isPending) {
    content = <ThreadSkeleton />;
  } else if (query.isError) {
    content =
      isApiError(query.error) && query.error.status === 404 ? (
        <EmptyState
          size="sm"
          icon={MessagesSquare}
          title="Không tìm thấy chuỗi trả lời"
          description="Tin nhắn gốc có thể đã bị xóa hoặc bạn không còn quyền xem."
        />
      ) : (
        <ErrorState
          size="sm"
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      );
  } else if (thread) {
    content = (
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
        onScroll={(event) => {
          const element = event.currentTarget;
          stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        }}
        role="log"
        aria-label="Các câu trả lời"
      >
        <div className="pt-3">
          <MessageItem
            message={thread.root}
            grouped={false}
            highlighted={highlight === thread.root.id}
          />
        </div>
        <div className="flex items-center gap-3 px-4 py-2 md:px-5">
          <span className="text-xs font-medium text-foreground-muted">
            {thread.root.replyCount > 0
              ? `${thread.root.replyCount} câu trả lời`
              : "Chưa có câu trả lời"}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        {rows.map((row) =>
          row.kind === "message" ? (
            <MessageItem
              key={row.key}
              message={row.message}
              grouped={row.grouped}
              highlighted={highlight === row.message.id}
            />
          ) : null
        )}
        {thread.hasMore ? (
          <div className="flex flex-col items-center gap-1 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? <Spinner /> : <RefreshCw />}
              Tải thêm câu trả lời
            </Button>
            {loadError ? <p className="text-xs text-danger">{loadError}</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <MessageActionsContext value={actions}>
      {header}
      <div className="flex min-h-0 flex-1 flex-col">{content}</div>
      {thread && !thread.root.isDeleted ? (
        <Composer
          key={rootId}
          channel={channel}
          threadRootId={rootId}
          uploads={uploads}
          autoFocus={!mobile}
          placeholder="Trả lời trong chuỗi…"
          nameOf={nameOf}
          onBeforeSend={() => {
            stick.current = true;
          }}
          onEditLast={lastOwnReply ? () => setEditingId(lastOwnReply.id) : undefined}
          className="pt-1"
        />
      ) : null}
      {deleteDialog}
    </MessageActionsContext>
  );
};

const ThreadSkeleton = () => (
  <div className="flex flex-col gap-5 p-4" aria-hidden="true">
    {[70, 45, 60].map((width, index) => (
      <div key={index} className="flex gap-2.5">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3" style={{ width: `${width}%` }} />
        </div>
      </div>
    ))}
  </div>
);
