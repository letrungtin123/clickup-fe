import { cn } from "cn";
import { ArrowRight, Bell, CheckCheck, MailCheck, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { Link } from "@/components/shared/router-link";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Notification } from "@/contracts/notifications";
import { formatCount } from "@/features/chat/model/channels";
import { pagedErrorKind } from "@/lib/paging";
import { useUiStore } from "@/stores/ui-store";

import { BELL_LIMIT, bellItems, bellLabel } from "../bell";
import {
  useMarkNotificationsRead,
  useNotificationFeed,
  useOpenNotification,
  useUnreadNotificationCount
} from "../hooks";
import { InboxNavBadge } from "./inbox-badge";
import { NotificationItem } from "./notification-item";

type Placement = "sidebar" | "rail" | "topbar";

const triggerClass: Record<Placement, string> = {
  // Next to the account menu at the top of the full sidebar (desktop / tablet overlay).
  sidebar:
    "relative flex size-8 shrink-0 items-center justify-center rounded-md text-foreground-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-surface-hover data-popup-open:text-foreground [&_svg]:size-4",
  // Icon rail (tablet / collapsed desktop): same footprint as the rail links.
  rail: "relative flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground-muted outline-none transition-colors duration-150 pointer-coarse:size-10 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-surface-hover data-popup-open:text-foreground [&_svg]:size-[18px]",
  // Phone top bar: matches the ghost icon buttons beside it.
  topbar:
    "relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground outline-none transition-colors duration-150 pointer-coarse:size-10 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted [&_svg]:size-4"
};

/**
 * Header bell (SPEC Phase 4): unread badge + the 10 newest notifications, "Đánh dấu đã đọc tất cả" and
 * "Xem tất cả" → /inbox. A popover on desktop / tablet, a bottom sheet on phones. The list shares the
 * inbox "all" feed cache, so `notification:new` / `:read` / `:archived` keep it live while open.
 */
export const NotificationBell = ({ placement }: { placement: Placement }) => {
  const [open, setOpen] = useState(false);
  const setBellOpen = useUiStore((state) => state.setBellOpen);
  const unread = useUnreadNotificationCount().data ?? 0;
  const label = bellLabel(unread);
  const close = useCallback(() => setOpen(false), []);

  // Toasts stay quiet while a bell list is on screen (NotificationsRuntime).
  useEffect(() => {
    setBellOpen(open);
    return () => setBellOpen(false);
  }, [open, setBellOpen]);

  const icon = (
    <>
      <Bell aria-hidden="true" />
      {/* Same count as "Hộp thư"; the 32px sidebar button pushes it to the corner. */}
      <InboxNavBadge
        variant="dot"
        className={placement === "sidebar" ? "-top-0.5 -right-0.5" : ""}
      />
    </>
  );

  if (placement === "topbar") {
    return (
      <>
        <button
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={triggerClass.topbar}
        >
          {icon}
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="max-h-[85dvh] gap-0 rounded-t-2xl p-0 pb-(--safe-bottom)"
          >
            <span
              aria-hidden="true"
              className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong"
            />
            <SheetDescription className="sr-only">
              {BELL_LIMIT} thông báo mới nhất. Xem tất cả trong Hộp thư.
            </SheetDescription>
            <BellPanel
              title={<SheetTitle className="text-sm font-semibold">Thông báo</SheetTitle>}
              onClose={close}
              closeButton
              className="min-h-0 flex-1"
            />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  const rail = placement === "rail";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={<PopoverTrigger aria-label={label} className={triggerClass[placement]} />}
        >
          {icon}
        </TooltipTrigger>
        <TooltipContent side={rail ? "right" : "bottom"}>Thông báo</TooltipContent>
      </Tooltip>
      <PopoverContent
        side={rail ? "right" : "bottom"}
        align="start"
        sideOffset={rail ? 8 : 6}
        className="w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0"
      >
        <BellPanel
          title={<PopoverTitle className="text-sm font-semibold">Thông báo</PopoverTitle>}
          onClose={close}
          className="max-h-[min(36rem,calc(100dvh-5rem))]"
        />
      </PopoverContent>
    </Popover>
  );
};

const BellPanel = ({
  title,
  onClose,
  closeButton = false,
  className
}: {
  title: ReactNode;
  onClose: () => void;
  closeButton?: boolean;
  className?: string;
}) => {
  const feed = useNotificationFeed("all");
  const items = useMemo(() => bellItems(feed.data), [feed.data]);
  const unread = useUnreadNotificationCount().data ?? 0;
  const { mutate: markRead, isPending: marking } = useMarkNotificationsRead();
  const openNotification = useOpenNotification();
  const listRef = useRef<HTMLUListElement | null>(null);

  const onOpen = useCallback(
    (notification: Notification) => {
      onClose();
      openNotification(notification);
    },
    [onClose, openNotification]
  );
  const onMarkRead = useCallback(
    (notification: Notification) => markRead([notification.id]),
    [markRead]
  );

  // ↑ / ↓ / Home / End move between entries (like the inbox page).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-notification-item]") ?? []
    );
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? buttons[0]
        : event.key === "End"
          ? buttons.at(-1)
          : index === -1
            ? buttons[event.key === "ArrowDown" ? 0 : buttons.length - 1]
            : buttons[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  const errorKind = pagedErrorKind(feed);

  return (
    <div className={cn("flex flex-col", className)} onKeyDown={onKeyDown}>
      <div className="flex shrink-0 items-center gap-2 border-b py-2 pr-2 pl-3.5">
        {title}
        {unread > 0 ? (
          <span className="rounded-full bg-brand px-1.5 text-[10px] leading-4 font-semibold text-brand-foreground tabular-nums">
            {formatCount(unread)}
            <span className="sr-only"> chưa đọc</span>
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto text-foreground-muted"
          disabled={unread === 0 || marking}
          onClick={() => markRead("all")}
        >
          {marking ? <Spinner /> : <CheckCheck />}
          Đánh dấu đã đọc tất cả
        </Button>
        {closeButton ? (
          <Button variant="ghost" size="icon-sm" aria-label="Đóng" onClick={onClose}>
            <X />
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {feed.isPending ? (
          <div className="flex flex-col gap-1" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex gap-3 px-3 py-2">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-2 pt-1">
                  <Skeleton className="h-3" style={{ width: `${55 + ((index * 13) % 35)}%` }} />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : errorKind === "initial" ? (
          <ErrorState
            size="sm"
            error={feed.error}
            onRetry={() => void feed.refetch()}
            retrying={feed.isFetching}
          />
        ) : items.length === 0 ? (
          <EmptyState
            size="sm"
            icon={MailCheck}
            title="Bạn đã xem hết thông báo"
            description="Giao việc, nhắc tên, bình luận và hạn chót liên quan đến bạn sẽ hiện ở đây."
          />
        ) : (
          <ul
            ref={listRef}
            aria-label={`${items.length} thông báo mới nhất`}
            className="flex flex-col gap-0.5"
          >
            {items.map((notification) => (
              <li key={notification.id}>
                <NotificationItem
                  notification={notification}
                  onOpen={onOpen}
                  onMarkRead={onMarkRead}
                  compact
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t p-1.5">
        <Link
          to="/inbox"
          onClick={onClose}
          className="flex h-8 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-brand-text outline-none transition-colors duration-150 pointer-coarse:h-10 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
        >
          Xem tất cả trong Hộp thư
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};
