import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";

import { useActiveChannelStore } from "@/features/chat/model/ui-state";
import { qk } from "@/lib/query-keys";
import { useRealtimeEvent } from "@/lib/realtime/hooks";
import { onUntypedServerEvent, scheduleInvalidate } from "@/lib/realtime/socket";
import { useUiStore } from "@/stores/ui-store";

import { allowsPopup, shouldToastNotification } from "./bell";
import { chatToastId } from "./chat-toast";
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
import {
  useSessionFollowsNotificationPreferences,
  useWebNotificationsEnabled
} from "./web-preference";

/**
 * Keeps the inbox live app-wide: new notifications are prepended to cached feeds, the unread badge
 * follows the server count, read state syncs across tabs/devices, and a toast offers to open the
 * target (skipped while the inbox or a bell list is on screen, when the viewer is already reading
 * that conversation, or when "Thông báo trên web" is off — the event's `popup` flag, else the
 * session's preference; see bell.ts / web-preference.ts).
 */
export const NotificationsRuntime = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const open = useOpenNotification();
  const { mutate: markRead } = useMarkNotificationsRead();
  // Prime the badge count once; realtime keeps it current afterwards.
  useUnreadNotificationCount();
  const webEnabled = useWebNotificationsEnabled();
  useSessionFollowsNotificationPreferences();

  useRealtimeEvent("notification:new", ({ notification, unreadCount, popup }) => {
    prependNotification(queryClient, notification);
    setUnreadCount(queryClient, unreadCount);
    // My Tasks never fetches tasks it does not show (PERF-07): a new assignment refreshes it.
    if (notification.type === "task.assigned") scheduleInvalidate(qk.myTasks());

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
    const bellOpen = useUiStore.getState().bellOpen;
    const allowed = allowsPopup(popup, webEnabled);
    if (!shouldToastNotification({ pathname: location.pathname, bellOpen, popup: allowed })) return;
    const description = describeNotification(notification);
    const chatChannelId = notification.type.startsWith("chat.") ? notification.target.channelId : null;
    toast(sentenceText(description), {
      // A chat notification (an @mention, a thread reply) takes over that conversation's message toast.
      id: chatChannelId ? chatToastId(chatChannelId) : `notification:${notification.id}`,
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
