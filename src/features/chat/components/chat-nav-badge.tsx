import { cn } from "cn";
import { useMemo } from "react";

import { useChannels } from "../hooks/use-channels";
import { formatCount, hasUnread, isMuted } from "../model/channels";

/**
 * Unread indicator for chat entry points that are not the sidebar sections (mobile top bar,
 * tablet icon rail). Counts what the sidebar badges count — mentions everywhere plus unread
 * direct messages that are not muted — and falls back to a plain dot for other unread channels.
 * Data comes from the channel list ChatRuntime keeps live, so no extra request is made.
 */
export const ChatNavBadge = ({ className }: { className?: string }) => {
  const channels = useChannels();
  const { count, unread } = useMemo(() => {
    let total = 0;
    let any = false;
    for (const channel of channels.data?.items ?? []) {
      const direct = channel.kind === "dm" || channel.kind === "group_dm";
      if (channel.mentionCount > 0) total += channel.mentionCount;
      else if (direct && channel.unreadCount > 0 && !isMuted(channel)) total += channel.unreadCount;
      if (hasUnread(channel)) any = true;
    }
    return { count: total, unread: any };
  }, [channels.data]);

  if (count > 0) {
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
  if (!unread) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-1.5 right-1.5 size-2 rounded-full bg-foreground/70 ring-2 ring-canvas",
        className
      )}
    />
  );
};
