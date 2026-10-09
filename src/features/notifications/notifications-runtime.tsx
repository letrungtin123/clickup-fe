import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";

import { useActiveChannelStore } from "@/features/chat/model/ui-state";
import { qk } from "@/lib/query-keys";
import { useRealtimeEvent } from "@/lib/realtime/hooks";
import { onUntypedServerEvent, scheduleInvalidate } from "@/lib/realtime/socket";

import { describeNotification, sentenceText } from "./describe";
import { parseArchivedEvent } from "./feeds";
import {
  applyArchive,
  applyRead,
  prependNotification,
  setUnreadCount,
  useMarkNotificationsRead,
  useOpenNotification,
  useUnreadNotificationCount
} from "./hooks";

/**
 * Keeps the inbox live app-wide: new notifications are prepended to cached feeds, the unread badge
 * follows the server count, read state syncs across tabs/devices, and a toast offers to open the
 * target (skipped while the inbox is on screen or the viewer is already reading that conversation).
 */
export const NotificationsRuntime = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const open = useOpenNotification();
  const { mutate: markRead } = useMarkNotificationsRead();
  // Prime the badge count once; realtime keeps it current afterwards.
  useUnreadNotificationCount();

  useRealtimeEvent("notification:new", ({ notification, unreadCount }) => {
    prependNotification(queryClient, notification);
    setUnreadCount(queryClient, unreadCount);
    // My Tasks never fetches tasks it does not show (PERF-07): a new assignment refreshes it.
    if (notification.type === "task.assigned") scheduleInvalidate(qk.myTasks());

    if (location.pathname === "/inbox") return;
    const active = useActiveChannelStore.getState();
    if (
      notification.target.channelId &&
      active.channelId === notification.target.channelId &&
      active.live &&
      document.visibilityState === "visible"
    ) {
      // Already reading that conversation: the mention is seen.
      markRead([notification.id]);
      return;
    }
    const description = describeNotification(notification);
    toast(sentenceText(description), {
      id: `notification:${notification.id}`,
      description: description.excerpt ?? description.subject ?? undefined,
      action: { label: "Xem", onClick: () => open(notification) },
      duration: 6000
    });
  });

  useRealtimeEvent("notification:read", (event) => {
    // An archive may arrive as a read event flagged `archived: true`: drop the items then.
    const { ids } = event;
    if ((event as { archived?: unknown }).archived === true && ids !== "all") applyArchive(queryClient, ids);
    else applyRead(queryClient, ids, new Date().toISOString());
    setUnreadCount(queryClient, event.unreadCount);
  });

  // Archived on another tab / device (BUG-WK-48): remove it here too, like read sync.
  useEffect(
    () =>
      onUntypedServerEvent("notification:archived", (payload) => {
        const event = parseArchivedEvent(payload);
        if (!event) return;
        applyArchive(queryClient, event.ids);
        if (event.unreadCount !== null) setUnreadCount(queryClient, event.unreadCount);
      }),
    [queryClient]
  );

  return null;
};
