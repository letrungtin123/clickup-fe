import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Hash, Lock, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

import {
  buildTimeline,
  formatDayLabel,
  type DisplayMessage,
  type TimelineRow
} from "../model/timeline";
import { MessageItem } from "./message-item";

/** Rows above the first message: history loader or the conversation intro. */
type ListRow = TimelineRow | { kind: "top"; key: "top" } | { kind: "bottom"; key: "bottom" };

const NEAR_EDGE_PX = 600;
const STICK_THRESHOLD_PX = 48;
/** Above this many unread messages the view opens at the "Tin mới" divider instead of the bottom. */
const OPEN_AT_DIVIDER_AFTER = 12;

const estimateRow = (row: ListRow | undefined) => {
  if (!row) return 60;
  switch (row.kind) {
    case "top":
      return 160;
    case "bottom":
      return 40;
    case "day":
      return 42;
    case "unread":
      return 32;
    case "message": {
      const { message } = row;
      if (message.kind === "system") return 31;
      let height = row.grouped ? 28 : 54;
      if (message.attachments.some((attachment) => attachment.isImage)) height += 230;
      else if (message.attachments.length > 0) height += 56;
      if (message.reactions.length > 0) height += 30;
      if (message.replyCount > 0) height += 26;
      return height + Math.min(4, Math.floor(message.text.length / 90)) * 22;
    }
  }
};

type MessageListProps = {
  /** Remounts per conversation (scroll state is per channel). */
  conversationLabel: string;
  messages: readonly DisplayMessage[];
  myId: string;
  /** Read marker captured when the conversation opened ("Tin mới" divider). */
  dividerSeq: number | null;
  hasOlder: boolean;
  hasNewer: boolean;
  olderState: "idle" | "loading" | "error";
  newerState: "idle" | "loading" | "error";
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  onJumpToLatest: () => void;
  /** Scroll to (and flash) this message once it is in the list. */
  focusMessageId: string | null;
  onFocusHandled: () => void;
  highlightId: string | null;
  /** The viewer sees the live end (bottom of a live window). */
  onLiveChange: (live: boolean) => void;
  intro: ReactNode;
};

/**
 * Virtualized, bottom-anchored conversation (TanStack Virtual):
 * - reverse infinite scroll (older pages prepend; the visible message keeps its position);
 * - sticks to the bottom while the viewer is there, otherwise shows a "new messages" pill;
 * - day separators, "Tin mới" divider, per-author grouping (rows are memoized).
 */
export const MessageList = memo(function MessageList({
  conversationLabel,
  messages,
  myId,
  dividerSeq,
  hasOlder,
  hasNewer,
  olderState,
  newerState,
  onLoadOlder,
  onLoadNewer,
  onJumpToLatest,
  focusMessageId,
  onFocusHandled,
  highlightId,
  onLiveChange,
  intro
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timeline = useMemo(
    () => buildTimeline(messages, { lastReadSeq: dividerSeq, myId }),
    [dividerSeq, messages, myId]
  );
  const rows = useMemo<ListRow[]>(
    () => [
      { kind: "top", key: "top" },
      ...timeline,
      ...(hasNewer ? [{ kind: "bottom", key: "bottom" } as const] : [])
    ],
    [hasNewer, timeline]
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- virtual rows are read during render on purpose
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateRow(rows[index]),
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 10,
    paddingStart: 4,
    paddingEnd: 12
  });

  // --- Scroll bookkeeping ---------------------------------------------------------------------------
  const stick = useRef(true);
  /** Last user scroll input (wheel, touch, keys, scrollbar drag) — only users unstick the bottom. */
  const userIntentAt = useRef(0);
  const dragging = useRef(false);
  const markIntent = () => {
    userIntentAt.current = performance.now();
  };
  useEffect(() => {
    const release = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);
  const anchor = useRef<{ key: string | number | bigint; delta: number } | null>(null);
  const initialised = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const lastKeyRef = useRef<string | null>(null);
  const [mountedAt] = useState(() => Date.now());

  const captureAnchor = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const top = element.scrollTop;
    const first = virtualizer
      .getVirtualItems()
      .find((item) => item.end > top + 1 && rows[item.index]?.kind !== "top");
    anchor.current = first ? { key: first.key, delta: first.start - top } : null;
  }, [rows, virtualizer]);

  const syncScroll = (element: HTMLDivElement) => {
    // Let the virtualizer read the new offset synchronously (no blank frame).
    element.dispatchEvent(new Event("scroll"));
  };

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    syncScroll(element);
  }, []);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const bottom = distance < STICK_THRESHOLD_PX;
    // Content growing (images loading, rows measured, virtualizer adjustments) never unsticks the
    // view; only the viewer scrolling away does.
    const byUser = dragging.current || performance.now() - userIntentAt.current < 300;
    if (bottom) stick.current = !hasNewer;
    else if (byUser) stick.current = false;
    setAtBottom(bottom);
    if (bottom && !hasNewer) setUnseen(0);
    captureAnchor();
    if (element.scrollTop < NEAR_EDGE_PX && hasOlder && olderState === "idle") onLoadOlder();
    if (distance < NEAR_EDGE_PX && hasNewer && newerState === "idle") onLoadNewer();
  };

  // Keep the first visible message in place when rows are prepended / trimmed above it.
  const firstKey = rows.find((row) => row.kind === "message")?.key ?? null;
  const previousFirstKey = useRef(firstKey);
  useLayoutEffect(() => {
    if (previousFirstKey.current === firstKey) return;
    previousFirstKey.current = firstKey;
    const element = scrollRef.current;
    const saved = anchor.current;
    if (!element || !saved || stick.current) return;
    const index = rows.findIndex((row) => row.key === saved.key);
    if (index === -1) return;
    const measured = virtualizer.measurementsCache[index]?.start;
    if (measured === undefined) return;
    element.scrollTop = measured - saved.delta;
    syncScroll(element);
  }, [firstKey, rows, virtualizer]);

  // Initial position: bottom, the unread divider, or a focused message (handled below).
  useLayoutEffect(() => {
    if (initialised.current || rows.length <= 1) return;
    initialised.current = true;
    lastKeyRef.current = rows.at(-1)?.key ?? null;
    if (focusMessageId) return;
    const dividerIndex = rows.findIndex((row) => row.kind === "unread");
    const unreadRow = rows[dividerIndex];
    if (unreadRow?.kind === "unread" && unreadRow.count > OPEN_AT_DIVIDER_AFTER) {
      stick.current = false;
      virtualizer.scrollToIndex(dividerIndex, { align: "start" });
      return;
    }
    scrollToBottom();
  }, [focusMessageId, rows, scrollToBottom, virtualizer]);

  // Stay glued to the bottom while content grows (new messages, images loading, measurements).
  const totalSize = virtualizer.getTotalSize();
  useLayoutEffect(() => {
    if (!initialised.current || !stick.current || hasNewer) return;
    scrollToBottom();
  }, [hasNewer, rows.length, scrollToBottom, totalSize]);

  // Track arrivals at the live end: subtle enter motion + "new messages" pill when scrolled up.
  useEffect(() => {
    if (!initialised.current) return;
    const lastKey = rows.at(-1)?.key ?? null;
    if (lastKey === lastKeyRef.current) return;
    const previousIndex = rows.findIndex((row) => row.key === lastKeyRef.current);
    lastKeyRef.current = lastKey;
    if (previousIndex === -1) return;
    const added = rows.slice(previousIndex + 1).filter((row) => row.kind === "message");
    const fromOthers = added.filter(
      (row) => row.kind === "message" && row.message.author?.id !== myId
    ).length;
    if (!stick.current && fromOthers > 0) setUnseen((count) => count + fromOthers);
    if (added.some((row) => row.kind === "message" && row.message.author?.id === myId && row.message.pending)) {
      // The viewer just sent something: always bring it into view.
      stick.current = true;
      scrollToBottom();
    }
  }, [myId, rows, scrollToBottom]);

  // Deep link / jump: centre the target message once it is loaded.
  useEffect(() => {
    if (!focusMessageId) return;
    const index = rows.findIndex(
      (row) => row.kind === "message" && row.message.id === focusMessageId
    );
    if (index === -1) return;
    stick.current = false;
    initialised.current = true;
    virtualizer.scrollToIndex(index, { align: "center" });
    onFocusHandled();
  }, [focusMessageId, onFocusHandled, rows, virtualizer]);

  // Report whether the viewer is reading the live end (drives mark-as-read).
  const live = atBottom && !hasNewer;
  useEffect(() => onLiveChange(live), [live, onLiveChange]);

  // Older history did not fill the viewport: keep paging.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !hasOlder || olderState !== "idle" || !initialised.current) return;
    if (element.scrollHeight <= element.clientHeight + NEAR_EDGE_PX && element.scrollTop < NEAR_EDGE_PX) {
      onLoadOlder();
    }
  }, [hasOlder, olderState, onLoadOlder, totalSize]);

  const items = virtualizer.getVirtualItems();
  const showPill = (!atBottom && unseen > 0) || hasNewer;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onWheel={markIntent}
        onTouchMove={markIntent}
        onPointerDown={(event) => {
          // Scrollbar drag (the pointer lands on the scroll container itself).
          if (event.target === event.currentTarget) dragging.current = true;
        }}
        onKeyDown={(event) => {
          if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) markIntent();
          // ↑ / ↓ move between messages (rows are focusable, the toolbar appears for the focused one).
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          const target = event.target as HTMLElement;
          const row = target.closest<HTMLElement>("[data-chat-row]");
          if (target !== event.currentTarget && target !== row) return;
          const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-chat-row]"));
          const index = row ? rows.indexOf(row) : -1;
          const next =
            event.key === "ArrowUp"
              ? rows[index === -1 ? rows.length - 1 : index - 1]
              : rows[index === -1 ? 0 : index + 1];
          if (next) {
            event.preventDefault();
            next.focus({ preventScroll: true });
            next.scrollIntoView({ block: "nearest" });
          }
        }}
        role="log"
        aria-label={`Tin nhắn ${conversationLabel}`}
        aria-busy={olderState === "loading"}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [overflow-anchor:none]"
      >
        <div className="flex min-h-full flex-col justify-end">
          <div className="relative w-full shrink-0" style={{ height: totalSize }}>
            {items.map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <Row
                    row={row}
                    hasOlder={hasOlder}
                    olderState={olderState}
                    onLoadOlder={onLoadOlder}
                    intro={intro}
                    highlighted={row.kind === "message" && row.message.id === highlightId}
                    fresh={
                      row.kind === "message" &&
                      new Date(row.message.createdAt).getTime() > mountedAt
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showPill ? (
          <motion.div
            className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16 }}
          >
            <Button
              size="sm"
              className="pointer-events-auto rounded-full shadow-lg"
              onClick={() => {
                setUnseen(0);
                if (hasNewer) {
                  onJumpToLatest();
                } else {
                  stick.current = true;
                  scrollToBottom();
                }
              }}
            >
              <ArrowDown />
              {unseen > 0 ? `Có ${unseen} tin nhắn mới` : "Tới tin nhắn mới nhất"}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});

const Row = memo(function Row({
  row,
  hasOlder,
  olderState,
  onLoadOlder,
  intro,
  highlighted,
  fresh
}: {
  row: ListRow;
  hasOlder: boolean;
  olderState: "idle" | "loading" | "error";
  onLoadOlder: () => void;
  intro: ReactNode;
  highlighted: boolean;
  fresh: boolean;
}) {
  switch (row.kind) {
    case "top":
      if (!hasOlder) return <div className="px-4 pt-8 pb-4 md:px-5">{intro}</div>;
      return (
        <div className="flex h-[120px] flex-col justify-end gap-3 px-5 pb-3" aria-hidden={olderState !== "error"}>
          {olderState === "error" ? (
            <div className="flex items-center justify-center gap-2 text-xs text-foreground-muted" role="alert">
              Không tải được tin nhắn cũ hơn.
              <Button size="xs" variant="outline" onClick={onLoadOlder}>
                <RefreshCw />
                Thử lại
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2.5">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-2 pt-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
              <div className="flex justify-center">
                <Spinner className="size-3.5 text-foreground-subtle" />
              </div>
            </>
          )}
        </div>
      );
    case "bottom":
      return (
        <div className="flex h-10 items-center justify-center">
          <Spinner className="size-3.5 text-foreground-subtle" />
        </div>
      );
    case "day":
      return (
        <div className="flex items-center gap-3 px-4 py-2.5 md:px-5" role="separator">
          <span className="h-px flex-1 bg-border" />
          <span className="rounded-full border bg-background px-2.5 py-0.5 text-[11px] font-semibold text-foreground-muted shadow-xs">
            {formatDayLabel(row.date)}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      );
    case "unread":
      return (
        <div className="flex items-center gap-2 px-4 py-1.5 md:px-5" role="separator" aria-label="Tin nhắn mới">
          <span className="h-px flex-1 bg-danger/50" />
          <span className="text-[11px] font-semibold tracking-wide text-danger uppercase">Tin mới</span>
        </div>
      );
    case "message":
      return (
        <MessageItem
          message={row.message}
          grouped={row.grouped}
          highlighted={highlighted}
          fresh={fresh}
        />
      );
  }
});

/** Header shown above the first message of a conversation. */
export const ConversationIntro = ({
  title,
  kind,
  description,
  glyph,
  children
}: {
  title: string;
  kind: "public" | "private" | "dm" | "group_dm";
  description: ReactNode;
  /** Replaces the # / lock tile (DM avatars). */
  glyph?: ReactNode;
  children?: ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    {glyph ?? (
      <span className="flex size-12 items-center justify-center rounded-2xl border bg-surface text-foreground-muted shadow-xs">
        {kind === "private" ? <Lock className="size-5" /> : <Hash className="size-5" />}
      </span>
    )}
    <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
    <p className="max-w-xl text-[13px] text-foreground-muted">{description}</p>
    {children}
  </div>
);

