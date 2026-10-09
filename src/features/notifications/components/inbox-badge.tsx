import { cn } from "cn";

import { formatCount } from "@/features/chat/model/channels";

import { useUnreadNotificationCount } from "../hooks";

/**
 * Unread inbox count for the sidebar "Hộp thư" entry. `variant="dot"` is the icon-rail version.
 * The count is primed by NotificationsRuntime and kept live by `notification:new` / `:read`.
 */
export const InboxNavBadge = ({
  variant = "count",
  className
}: {
  variant?: "count" | "dot";
  className?: string;
}) => {
  const unread = useUnreadNotificationCount();
  const count = unread.data ?? 0;
  if (count <= 0) return null;
  if (variant === "dot") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-0.5 text-[9px] leading-none font-semibold text-brand-foreground ring-2 ring-canvas tabular-nums",
          className
        )}
      >
        {formatCount(count, 9)}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground tabular-nums",
        className
      )}
    >
      <span className="sr-only">, </span>
      {formatCount(count)}
      <span className="sr-only"> chưa đọc</span>
    </span>
  );
};
