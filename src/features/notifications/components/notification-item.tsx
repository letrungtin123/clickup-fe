import { cn } from "cn";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Archive, ArrowUpRight, Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { memo, useState } from "react";

import { ActionSheet, ActionSheetItem } from "@/components/shared/action-sheet";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Notification } from "@/contracts/notifications";
import { useLongPress } from "@/hooks/use-long-press";
import { useTouchPrimary } from "@/hooks/use-pointer";

import { timeAgo } from "@/features/chat/model/time";

import { describeNotification, sentenceText, type NotificationDescription } from "../describe";

const toneClasses: Record<NotificationDescription["tone"], string> = {
  brand: "bg-brand text-brand-foreground",
  warning: "bg-warning text-white",
  danger: "bg-danger text-white",
  success: "bg-success text-white",
  muted: "bg-foreground-muted text-background"
};

/** One inbox entry: actor + type badge, Vietnamese sentence, subject / excerpt, time, actions. */
export const NotificationItem = memo(function NotificationItem({
  notification,
  onOpen,
  onMarkRead,
  onArchive,
  compact = false,
  swipeable = false
}: {
  notification: Notification;
  onOpen: (notification: Notification) => void;
  onMarkRead?: ((notification: Notification) => void) | undefined;
  onArchive?: ((notification: Notification) => void) | undefined;
  compact?: boolean;
  swipeable?: boolean;
}) {
  const description = describeNotification(notification);
  const unread = !notification.readAt;
  const reduceMotion = useReducedMotion();
  const [swiping, setSwiping] = useState(false);
  const Icon = description.icon;
  // Touch: the hover actions become a long-press sheet (swipe-left still archives on phones).
  const touch = useTouchPrimary();
  const [sheetOpen, setSheetOpen] = useState(false);
  const hasActions = Boolean(onMarkRead || onArchive);
  const longPress = useLongPress(() => setSheetOpen(true), { enabled: touch && hasActions });

  const body = (
    <div
      {...longPress}
      className={cn(
        "group/notification relative flex gap-3 rounded-lg px-3 outline-none transition-colors duration-150",
        compact ? "py-2" : "py-2.5",
        unread ? "bg-brand-soft/40 hover:bg-brand-soft/70" : "hover:bg-surface-hover",
        touch && hasActions && "select-none [-webkit-touch-callout:none]",
        sheetOpen && "bg-surface-hover"
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(notification)}
        data-notification-item
        className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${description.segments.map((segment) => segment.text).join("")}${unread ? " (chưa đọc)" : ""}`}
      />
      <span className="relative mt-0.5 shrink-0">
        {notification.actor ? (
          <UserAvatar user={notification.actor} size={compact ? "md" : "lg"} />
        ) : (
          <span
            className={cn(
              "flex items-center justify-center rounded-full bg-muted text-foreground-muted",
              compact ? "size-8" : "size-10"
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
        {notification.actor ? (
          <span
            className={cn(
              "absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full ring-2 ring-background",
              toneClasses[description.tone]
            )}
            aria-hidden="true"
          >
            <Icon className="size-2.5" strokeWidth={2.5} />
          </span>
        ) : null}
      </span>
      <span className="pointer-events-none flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "text-[13px] leading-snug",
            unread ? "text-foreground" : "text-foreground-muted"
          )}
        >
          {description.segments.map((segment, index) =>
            segment.strong ? (
              <strong key={index} className="font-semibold text-foreground">
                {segment.text}
              </strong>
            ) : (
              <span key={index}>{segment.text}</span>
            )
          )}
        </span>
        {description.subject ? (
          <span className="truncate text-[13px] font-medium text-foreground">
            {description.subject}
          </span>
        ) : null}
        {description.excerpt ? (
          <span
            className={cn(
              "border-l-2 pl-2 text-xs text-foreground-muted",
              compact ? "line-clamp-1" : "line-clamp-2"
            )}
          >
            {description.excerpt}
          </span>
        ) : null}
        <time
          dateTime={notification.createdAt}
          title={format(new Date(notification.createdAt), "HH:mm, EEEE d MMMM yyyy", {
            locale: vi
          })}
          className="text-[11px] text-foreground-subtle"
        >
          {timeAgo(notification.createdAt)}
        </time>
      </span>
      {unread ? (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
      ) : null}
      {onMarkRead || onArchive ? (
        <span className="absolute top-2 right-2 z-10 hidden items-center gap-0.5 rounded-md border bg-surface-raised p-0.5 shadow-sm group-hover/notification:flex group-focus-within/notification:flex">
          {unread && onMarkRead ? (
            <ActionButton label="Đánh dấu đã đọc" onClick={() => onMarkRead(notification)}>
              <Check className="size-3.5" />
            </ActionButton>
          ) : null}
          {onArchive ? (
            <ActionButton label="Lưu trữ" onClick={() => onArchive(notification)}>
              <Archive className="size-3.5" />
            </ActionButton>
          ) : null}
        </span>
      ) : null}
    </div>
  );

  const run = (action: (notification: Notification) => void) => () => {
    setSheetOpen(false);
    action(notification);
  };
  const sheet =
    touch && hasActions ? (
      <ActionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={sentenceText(description)}
        description={timeAgo(notification.createdAt)}
      >
        <div className="flex flex-col border-t p-2">
          <ActionSheetItem icon={<ArrowUpRight />} onClick={run(onOpen)}>
            Mở
          </ActionSheetItem>
          {unread && onMarkRead ? (
            <ActionSheetItem icon={<Check />} onClick={run(onMarkRead)}>
              Đánh dấu đã đọc
            </ActionSheetItem>
          ) : null}
          {onArchive ? (
            <ActionSheetItem icon={<Archive />} onClick={run(onArchive)}>
              Lưu trữ
            </ActionSheetItem>
          ) : null}
        </div>
      </ActionSheet>
    ) : null;

  if (!swipeable || !onArchive || reduceMotion) {
    return (
      <>
        {body}
        {sheet}
      </>
    );
  }

  // Touch: swipe left to archive.
  return (
    <>
      <div className="relative overflow-hidden rounded-lg">
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-end rounded-lg bg-danger-soft pr-5 text-danger transition-opacity",
            swiping ? "opacity-100" : "opacity-0"
          )}
          aria-hidden="true"
        >
          <Archive className="size-4" />
        </div>
        <motion.div
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: -140, right: 0 }}
          dragElastic={{ left: 0.2, right: 0 }}
          dragSnapToOrigin
          onDragStart={() => setSwiping(true)}
          onDragEnd={(_event, info) => {
            setSwiping(false);
            if (info.offset.x < -90) onArchive(notification);
          }}
          className="relative bg-background"
        >
          {body}
        </motion.div>
      </div>
      {sheet}
    </>
  );
});

const ActionButton = ({
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
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          className="flex size-6 items-center justify-center rounded text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);
