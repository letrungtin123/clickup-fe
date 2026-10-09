import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { toast } from "sonner";

import { useActiveChannelStore } from "@/features/chat/model/ui-state";
import { useRealtimeEvent } from "@/lib/realtime/hooks";

import { describeNotification, sentenceText } from "./describe";
import {
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

  useRealtimeEvent("notification:read", ({ ids, unreadCount }) => {
    applyRead(queryClient, ids, new Date().toISOString());
    setUnreadCount(queryClient, unreadCount);
  });

  return null;
};
