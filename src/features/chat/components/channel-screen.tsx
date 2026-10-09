import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { Hash, Lock, SearchX, ShieldOff, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link, useSearchParams } from "react-router";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isDirectKind,
  type ChatChannelCollection,
  type ChatChannelDetail,
  type ChatMessage
} from "@/contracts/chat";
import { useSessionContext } from "@/features/auth/hooks";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { isApiError } from "@/lib/api/errors";

import { useUploads } from "../hooks/use-attachments";
import { useChannel } from "../hooks/use-channels";
import { useConversationActions } from "../hooks/use-conversation-actions";
import { useMentionSource } from "../hooks/use-mention-source";
import { useMarkRead } from "../hooks/use-message-actions";
import { useMessageWindow } from "../hooks/use-message-window";
import { useUserLookup } from "../hooks/use-user-lookup";
import { chatKeys } from "../keys";
import { channelLabel, channelTitle } from "../model/channels";
import { mergeWithPending, usePendingMessages } from "../model/pending";
import { useActiveChannelStore } from "../model/ui-state";
import { lastSeq } from "../model/window";
import { ChannelHeader } from "./channel-header";
import { ChannelSettingsDialog, type SettingsTab } from "./channel-settings-dialog";
import { Composer } from "./composer";
import { MessageActionsContext } from "./message-context";
import { ConversationIntro, MessageList } from "./message-list";
import { ThreadPanel } from "./thread-panel";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (value: string | null) => (value && uuidPattern.test(value) ? value : null);

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const useDocumentVisible = () =>
  useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true
  );

/** `/c/:channelId` — channel or DM with optional `?thread=<rootId>` and `?message=<id>` deep links. */
export const ChannelScreen = ({ channelId }: { channelId: string }) => {
  const detail = useChannel(channelId);
  const setActive = useActiveChannelStore((state) => state.setActive);

  useEffect(() => {
    setActive(channelId);
    return () => {
      if (useActiveChannelStore.getState().channelId === channelId) setActive(null);
    };
  }, [channelId, setActive]);

  if (detail.isPending) return <ChannelSkeleton />;
  if (detail.isError)
    return <ChannelUnavailable error={detail.error} onRetry={() => void detail.refetch()} />;
  return <ChannelView channel={detail.data} />;
};

const ChannelView = ({ channel }: { channel: ChatChannelDetail }) => {
  const session = useSessionContext();
  const queryClient = useQueryClient();
  const breakpoint = useBreakpoint();
  const [params, setParams] = useSearchParams();
  const threadId = validId(params.get("thread"));
  const messageParam = validId(params.get("message"));
  const [settings, setSettings] = useState<{ open: boolean; tab: SettingsTab }>({
    open: false,
    tab: "about"
  });

  // Deep link (`?message=`): the main list centres the message, or its thread root when the link
  // targets a reply. Opening a thread from the list (`?thread=` alone) never moves the list.
  const mainAnchor = messageParam ? (threadId ?? messageParam) : null;
  const [focusId, setFocusId] = useState<string | null>(mainAnchor);
  const [highlightId, setHighlightId] = useState<string | null>(mainAnchor);
  const threadFocus = threadId ? messageParam : null;

  const canRead = channel.capabilities.canRead;
  const win = useMessageWindow(channel.id, {
    enabled: canRead,
    isMember: channel.isMember,
    initialAnchor: mainAnchor
  });
  const { jumpTo, loadOlder, loadNewer, jumpToLatest } = win;
  // Stable callbacks keep the memoized list from re-rendering on unrelated state changes.
  const onLoadOlder = useCallback(() => void loadOlder(), [loadOlder]);
  const onLoadNewer = useCallback(() => void loadNewer(), [loadNewer]);
  const onJumpToLatest = useCallback(() => void jumpToLatest(), [jumpToLatest]);
  const onFocusHandled = useCallback(() => setFocusId(null), []);

  useEffect(() => {
    if (!mainAnchor || !canRead) return;
    void jumpTo(mainAnchor);
  }, [canRead, jumpTo, mainAnchor]);

  // Re-focus when a new deep link targets this already-open channel (search, inbox).
  const [seenAnchor, setSeenAnchor] = useState(mainAnchor);
  if (mainAnchor !== seenAnchor) {
    setSeenAnchor(mainAnchor);
    if (mainAnchor) {
      setFocusId(mainAnchor);
      setHighlightId(mainAnchor);
    }
  }

  useEffect(() => {
    if (!highlightId) return undefined;
    const timer = setTimeout(() => setHighlightId(null), 2600);
    return () => clearTimeout(timer);
  }, [highlightId]);

  // "Tin mới" divider: the read marker as it was when the conversation opened.
  const [dividerSeq, setDividerSeq] = useState<number | null>(() => {
    if (!channel.isMember) return null;
    const sidebarEntry = queryClient
      .getQueryData<ChatChannelCollection>(chatKeys.channels())
      ?.items.find((entry) => entry.id === channel.id);
    return sidebarEntry?.lastReadSeq ?? channel.lastReadSeq ?? null;
  });

  const pending = usePendingMessages(channel.id, null);
  const messages = useMemo(
    () => mergeWithPending(win.window?.items ?? [], pending),
    [pending, win.window?.items]
  );
  const nameOf = useUserLookup(channel, win.window?.items ?? []);
  const mentionSource = useMentionSource(channel.id);
  const uploads = useUploads(channel.id);

  const openThread = useCallback(
    (message: ChatMessage) =>
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.set("thread", message.id);
        next.delete("message");
        return next;
      }),
    [setParams]
  );
  const closeThread = useCallback(
    () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("thread");
          next.delete("message");
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const { actions, deleteDialog, setEditingId } = useConversationActions({
    channel,
    inThread: false,
    mentionSource,
    nameOf,
    onOpenThread: openThread
  });

  // Live end + visible tab → mark read up to the newest message.
  const visible = useDocumentVisible();
  const [live, setLive] = useState(false);
  const setStoreLive = useActiveChannelStore((state) => state.setLive);
  const markRead = useMarkRead(channel.id, channel.isMember);
  const newestSeq = win.window ? lastSeq(win.window) : null;
  useEffect(() => {
    const watching = live && visible && !win.window?.hasNewer;
    setStoreLive(channel.id, watching);
    if (watching && newestSeq !== null) markRead(newestSeq);
  }, [channel.id, live, markRead, newestSeq, setStoreLive, visible, win.window?.hasNewer]);

  const lastOwn = useMemo(
    () =>
      [...(win.window?.items ?? [])]
        .reverse()
        .find(
          (message) =>
            message.kind === "user" && message.author?.id === session.user.id && !message.isDeleted
        ),
    [session.user.id, win.window?.items]
  );

  const mobile = breakpoint === "mobile";
  const threadMode =
    breakpoint === "desktop" ? "docked" : breakpoint === "tablet" ? "overlay" : "fullscreen";
  const direct = isDirectKind(channel.kind);

  const [dragging, setDragging] = useState(false);
  const canAttach = channel.capabilities.canPost;

  const intro = useMemo(
    () => (
      <ConversationIntro
        title={direct ? channelTitle(channel) : channelLabel(channel)}
        kind={channel.kind}
        glyph={
          direct ? (
            <span className="flex -space-x-2">
              {channel.participants.slice(0, 3).map((user) => (
                <UserAvatar
                  key={user.id}
                  user={user}
                  size="lg"
                  className="size-12 text-base ring-4 ring-background"
                />
              ))}
            </span>
          ) : undefined
        }
        description={
          direct
            ? `Đây là khởi đầu cuộc trò chuyện của bạn với ${channelTitle(channel)}.`
            : channel.description || `Đây là khởi đầu của ${channelLabel(channel)}.`
        }
      />
    ),
    [channel, direct]
  );

  return (
    <div className="flex h-full min-h-0">
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={(event) => {
          if (!canAttach || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          if (!canAttach) return;
          event.preventDefault();
          setDragging(false);
          const files = Array.from(event.dataTransfer.files);
          if (files.length > 0) uploads.addFiles(files);
        }}
      >
        <ChannelHeader
          channel={channel}
          mobile={mobile}
          onOpenSettings={(tab) => setSettings({ open: true, tab })}
        />
        {channel.archivedAt ? (
          <p className="border-b bg-warning-soft px-4 py-1.5 text-center text-xs text-foreground-muted">
            Kênh đã được lưu trữ — chỉ có thể xem lịch sử tin nhắn.
          </p>
        ) : null}

        <MessageActionsContext value={actions}>
          {!canRead ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={Lock}
                title="Bạn chưa là thành viên của kênh này"
                description="Kênh riêng tư chỉ hiển thị tin nhắn cho thành viên. Bạn có thể tự thêm mình qua danh sách thành viên nếu có quyền quản lý."
                action={
                  channel.capabilities.canManageMembers ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSettings({ open: true, tab: "members" })}
                    >
                      Quản lý thành viên
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : win.query.isError && !win.window ? (
            <div className="flex flex-1 items-center justify-center">
              <ErrorState
                error={win.query.error}
                onRetry={() => void win.query.refetch()}
                retrying={win.query.isFetching}
              />
            </div>
          ) : !win.window || win.jumping ? (
            <MessagesSkeleton />
          ) : (
            <MessageList
              key={channel.id}
              conversationLabel={channelLabel(channel)}
              messages={messages}
              myId={session.user.id}
              dividerSeq={dividerSeq}
              hasOlder={win.window.hasOlder}
              hasNewer={win.window.hasNewer}
              olderState={win.olderState}
              newerState={win.newerState}
              onLoadOlder={onLoadOlder}
              onLoadNewer={onLoadNewer}
              onJumpToLatest={onJumpToLatest}
              focusMessageId={focusId}
              onFocusHandled={onFocusHandled}
              highlightId={highlightId}
              onLiveChange={setLive}
              intro={intro}
            />
          )}
          {deleteDialog}
        </MessageActionsContext>

        {canRead || channel.capabilities.canJoin ? (
          <Composer
            key={channel.id}
            channel={channel}
            threadRootId={null}
            uploads={uploads}
            autoFocus={!mobile && !threadId}
            nameOf={nameOf}
            onBeforeSend={() => {
              setDividerSeq(null);
              if (win.window?.hasNewer) void win.jumpToLatest();
            }}
            onEditLast={lastOwn ? () => setEditingId(lastOwn.id) : undefined}
          />
        ) : null}

        {dragging ? (
          <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/60 bg-brand-soft/80 text-brand-text backdrop-blur-sm">
            <UploadCloud className="size-8" aria-hidden="true" />
            <p className="text-sm font-medium">Thả tệp để đính kèm vào {channelLabel(channel)}</p>
          </div>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {threadId && canRead ? (
          <ThreadPanel
            key={threadId}
            channel={channel}
            rootId={threadId}
            focusMessageId={threadFocus}
            mode={threadMode}
            onClose={closeThread}
          />
        ) : null}
      </AnimatePresence>

      <ChannelSettingsDialog
        channel={channel}
        open={settings.open}
        tab={settings.tab}
        onTabChange={(tab) => setSettings({ open: true, tab })}
        onOpenChange={(open) => setSettings((current) => ({ ...current, open }))}
      />
    </div>
  );
};

const MessagesSkeleton = () => (
  <div
    className="flex min-h-0 flex-1 flex-col justify-end gap-5 overflow-hidden px-4 pb-4 md:px-5"
    aria-hidden="true"
  >
    {[62, 38, 74, 50, 30].map((width, index) => (
      <div key={index} className="flex gap-2.5">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3" style={{ width: `${width}%` }} />
          {index % 2 === 0 ? (
            <Skeleton className="h-3" style={{ width: `${width - 20}%` }} />
          ) : null}
        </div>
      </div>
    ))}
  </div>
);

const ChannelSkeleton = () => (
  <div className="flex h-full flex-col">
    <div className="flex h-14 items-center gap-3 border-b px-4" aria-hidden="true">
      <Skeleton className="size-6 rounded-md" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-2.5 w-56" />
      </div>
    </div>
    <MessagesSkeleton />
    <div className="px-3 pb-4 md:px-5">
      <Skeleton className="h-[84px] rounded-xl" />
    </div>
  </div>
);

const ChannelUnavailable = ({ error, onRetry }: { error: unknown; onRetry: () => void }) => {
  const gone = isApiError(error) && (error.status === 404 || error.status === 403);
  return (
    <div className="flex h-full flex-col items-center justify-center">
      {gone ? (
        <EmptyState
          icon={
            error instanceof Error && isApiError(error) && error.status === 403
              ? ShieldOff
              : SearchX
          }
          title="Không mở được cuộc trò chuyện"
          description="Kênh không tồn tại, đã bị xóa, hoặc bạn không còn quyền truy cập."
          action={
            <Button variant="outline" size="sm" render={<Link to="/c" />} nativeButton={false}>
              <Hash />
              Về danh sách kênh
            </Button>
          }
        />
      ) : (
        <ErrorState error={error} onRetry={onRetry} />
      )}
    </div>
  );
};
