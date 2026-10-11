import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useSessionContext } from "@/features/auth/hooks";
import { qk } from "@/lib/query-keys";

import { isNotificationPreferencesResult } from "./bell";

/**
 * "Thông báo trên web" (app_users.notify_web, PD-021) as the session knows it. Off = new notifications do
 * not pop up as toasts; the inbox, the bell list and the unread badges always work. Realtime events
 * carry their own `popup` flag (bell.ts#allowsPopup), this is the fallback for older servers.
 */
export const useWebNotificationsEnabled = () =>
  useSessionContext().notificationPreferences.notifyWeb;

/**
 * Settings › Hồ sơ › Thông báo saves through PATCH /me/notification-preferences (production hooks):
 * once the server confirms, re-read the session so its `notificationPreferences` copy follows.
 */
export const useSessionFollowsNotificationPreferences = () => {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "success") return;
        if (!isNotificationPreferencesResult(event.action.data)) return;
        void queryClient.invalidateQueries({ queryKey: qk.session(), exact: true });
      }),
    [queryClient]
  );
};
