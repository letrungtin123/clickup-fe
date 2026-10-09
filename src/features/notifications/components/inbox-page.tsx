import { AtSign, BellRing, CheckCheck, Inbox, MailCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadMoreError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { Notification } from "@/contracts/notifications";
import { formatCount } from "@/features/chat/model/channels";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { canAutoLoadNextPage, pagedErrorKind } from "@/lib/paging";
import { cn } from "cn";

import { groupByDay } from "../group";
import {
  useArchiveNotifications,
  useMarkNotificationsRead,
  useNotificationFeed,
  useOpenNotification,
  useUnreadNotificationCount
} from "../hooks";
import { NotificationItem } from "./notification-item";

type InboxTab = "all" | "unread" | "mentions";

const tabs: { value: InboxTab; label: string; icon: typeof Inbox }[] = [
  { value: "all", label: "Tất cả", icon: Inbox },
  { value: "unread", label: "Chưa đọc", icon: BellRing },
  { value: "mentions", label: "Nhắc đến", icon: AtSign }
];

const isTab = (value: string | null): value is InboxTab =>
  value === "all" || value === "unread" || value === "mentions";

/** `/inbox` — notifications grouped by day with read / archive actions and infinite scroll. */
export const InboxPage = () => {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const tab: InboxTab = isTab(rawTab) ? rawTab : "all";
  const unread = useUnreadNotificationCount();
  const markRead = useMarkNotificationsRead();
  const unreadCount = unread.data ?? 0;

  const setTab = (next: InboxTab) =>
    setParams(
      (current) => {
        const value = new URLSearchParams(current);
        if (next === "all") value.delete("tab");
        else value.set("tab", next);
        return value;
      },
      { replace: true }
    );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Hộp thư"
        description="Nhắc tên, giao việc, bình luận, trả lời và hạn chót — tất cả ở một nơi."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={unreadCount === 0 || markRead.isPending}
            onClick={() => markRead.mutate("all")}
          >
            {markRead.isPending ? <Spinner /> : <CheckCheck />}
            <span className="hidden sm:inline">Đánh dấu đã đọc tất cả</span>
            <span className="sm:hidden">Đã đọc hết</span>
          </Button>
        }
      >
        <div role="tablist" aria-label="Lọc thông báo" className="-mb-3 flex gap-1">
          {tabs.map((entry) => {
            const active = entry.value === tab;
            return (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(entry.value)}
                className={cn(
                  "relative flex h-9 items-center gap-1.5 rounded-t-md px-2.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "text-foreground" : "text-foreground-muted hover:text-foreground"
                )}
              >
                <entry.icon className="size-3.5" aria-hidden="true" />
                {entry.label}
                {entry.value === "unread" && unreadCount > 0 ? (
                  <span className="rounded-full bg-brand px-1.5 text-[10px] leading-4 font-semibold text-brand-foreground tabular-nums">
                    {formatCount(unreadCount)}
                  </span>
                ) : null}
                {active ? (
                  <motion.span
                    layoutId="inbox-tab"
                    className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-foreground"
                    transition={{ duration: 0.18 }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </PageHeader>
      <InboxFeed key={tab} tab={tab} />
    </div>
  );
};

const InboxFeed = ({ tab }: { tab: InboxTab }) => {
  // Each tab is its own server-filtered feed ("Nhắc đến" = types=…mentioned, BUG-WK-47).
  const feed = useNotificationFeed(tab);
  const open = useOpenNotification();
  const markRead = useMarkNotificationsRead();
  const archive = useArchiveNotifications();
  const breakpoint = useBreakpoint();
  const sentinel = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);
  const groups = useMemo(() => groupByDay(items), [items]);

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = feed;
  const autoLoad = canAutoLoadNextPage({ hasNextPage, isFetchingNextPage, isFetchNextPageError });

  // Infinite scroll (stops after a failed page until "Thử lại").
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !autoLoad) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, autoLoad]);

  // ↑ / ↓ move between entries.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-notification-item]") ?? []
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[index === -1 ? 0 : index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  const onOpen = (notification: Notification) => open(notification);
  const onMarkRead = (notification: Notification) => markRead.mutate([notification.id]);
  const onArchive = (notification: Notification) => archive.mutate([notification.id]);

  if (feed.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 p-4" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex gap-3 px-3 py-2.5">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-3.5" style={{ width: `${50 + ((index * 17) % 35)}%` }} />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  const errorKind = pagedErrorKind(feed);
  if (errorKind === "initial") {
    return (
      <ErrorState
        error={feed.error}
        onRetry={() => void feed.refetch()}
        retrying={feed.isFetching}
      />
    );
  }
  if (items.length === 0 && !hasNextPage) {
    return (
      <EmptyState
        icon={tab === "mentions" ? AtSign : MailCheck}
        title={
          tab === "unread"
            ? "Bạn đã xem hết thông báo"
            : tab === "mentions"
              ? "Chưa có ai nhắc đến bạn"
              : "Hộp thư đang trống"
        }
        description={
          tab === "mentions"
            ? "Khi ai đó @nhắc tên bạn trong bình luận hoặc tin nhắn, thông báo sẽ hiện ở đây."
            : "Giao việc, nhắc tên, bình luận và hạn chót liên quan đến bạn sẽ xuất hiện tại đây."
        }
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" onKeyDown={onKeyDown}>
      <div ref={listRef} className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-2 py-4 md:px-4">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="flex flex-col gap-1">
            <h2 className="px-3 pb-1 text-xs font-semibold text-foreground-muted">{group.label}</h2>
            <ul className="flex flex-col gap-0.5">
              <AnimatePresence initial={false}>
                {group.items.map((notification) => (
                  <motion.li
                    key={notification.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <NotificationItem
                      notification={notification}
                      onOpen={onOpen}
                      onMarkRead={onMarkRead}
                      onArchive={onArchive}
                      swipeable={breakpoint === "mobile"}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))}
        <div ref={sentinel} className="flex min-h-10 items-center justify-center">
          {errorKind === "next" ? (
            <LoadMoreError onRetry={() => void fetchNextPage()} retrying={isFetchingNextPage} />
          ) : isFetchingNextPage ? (
            <Spinner className="size-4 text-foreground-muted" />
          ) : null}
          {!hasNextPage && items.length > 0 ? (
            <span className="text-xs text-foreground-subtle">Đã hiển thị tất cả thông báo</span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
