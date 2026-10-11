import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

import type { Notification } from "@/contracts/notifications";
import { TASK_PANEL_PARAM } from "@/features/tasks/use-task-panel";
import { getErrorMessage } from "@/lib/api/errors";
import { qk } from "@/lib/query-keys";

import { notificationsApi } from "./api";
import { notificationTarget } from "./describe";
import {
  applyReadToFeed,
  feedNames,
  mentionTypeList,
  prependToFeed,
  removeFromFeed,
  type Feed,
  type FeedName
} from "./feeds";

/** One inbox tab. "mentions" asks the server for mention types only (no client-side filtering). */
export const useNotificationFeed = (feed: FeedName, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.notifications.feed(feed),
    queryFn: ({ signal, pageParam }) =>
      notificationsApi.list(
        {
          filter: feed === "unread" ? "unread" : "all",
          types: feed === "mentions" ? mentionTypeList : undefined,
          cursor: pageParam,
          limit: 30
        },
        signal
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.pageInfo.hasMore ? page.pageInfo.nextCursor : null),
    enabled,
    staleTime: 30_000,
    // Bounded memory for long inboxes: keep at most 10 pages (300 items).
    maxPages: 10
  });

export const useUnreadNotificationCount = () =>
  useQuery({
    queryKey: qk.notifications.unreadCount(),
    queryFn: async ({ signal }) => (await notificationsApi.unreadCount(signal)).unreadCount,
    staleTime: 60_000
  });

// Cache helpers ------------------------------------------------------------------------------------

export const setUnreadCount = (queryClient: QueryClient, unreadCount: number) =>
  queryClient.setQueryData(qk.notifications.unreadCount(), unreadCount);

export const prependNotification = (queryClient: QueryClient, notification: Notification) => {
  for (const name of feedNames) {
    queryClient.setQueryData<Feed>(qk.notifications.feed(name), (feed) =>
      prependToFeed(name, feed, notification)
    );
  }
};

export const applyRead = (
  queryClient: QueryClient,
  ids: readonly string[] | "all",
  readAt: string
) => {
  for (const name of feedNames) {
    queryClient.setQueryData<Feed>(qk.notifications.feed(name), (feed) =>
      applyReadToFeed(feed, ids, readAt)
    );
  }
};

export const applyArchive = (queryClient: QueryClient, ids: readonly string[]) => {
  for (const name of feedNames) {
    queryClient.setQueryData<Feed>(qk.notifications.feed(name), (feed) => removeFromFeed(feed, ids));
  }
};

// Mutations ----------------------------------------------------------------------------------------

export const useMarkNotificationsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[] | "all") =>
      notificationsApi.markRead(ids === "all" ? { all: true } : { ids }),
    meta: { errorMessage: false },
    onMutate: (ids) => {
      applyRead(queryClient, ids, new Date().toISOString());
      const previous = queryClient.getQueryData<number>(qk.notifications.unreadCount());
      if (ids === "all") setUnreadCount(queryClient, 0);
      else if (previous !== undefined)
        setUnreadCount(queryClient, Math.max(0, previous - ids.length));
      return { previous };
    },
    onSuccess: (result) => setUnreadCount(queryClient, result.unreadCount),
    onError: (error, _ids, context) => {
      if (context?.previous !== undefined) setUnreadCount(queryClient, context.previous);
      void queryClient.invalidateQueries({ queryKey: qk.notifications.all() });
      toast.error(getErrorMessage(error, "Không cập nhật được trạng thái đã đọc."));
    }
  });
};

export const useArchiveNotifications = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => notificationsApi.archive(ids),
    meta: { errorMessage: false },
    onMutate: (ids) => {
      const snapshot = queryClient.getQueriesData<Feed>({ queryKey: ["notifications", "feed"] });
      applyArchive(queryClient, ids);
      return { snapshot };
    },
    onSuccess: (result) => setUnreadCount(queryClient, result.unreadCount),
    onError: (error, _ids, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      toast.error(getErrorMessage(error, "Không lưu trữ được thông báo."));
    }
  });
};

/** Opens a notification's target and marks it read. Works from any route (toasts, home widget). */
export const useOpenNotification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate: markRead } = useMarkNotificationsRead();
  return useCallback(
    (notification: Notification) => {
      if (!notification.readAt) markRead([notification.id]);
      const target = notificationTarget(notification);
      if (target.kind === "task") {
        const params = new URLSearchParams(location.search);
        params.set(TASK_PANEL_PARAM, target.taskId);
        void navigate(`${location.pathname}?${params.toString()}`);
      } else if (target.kind === "path") {
        void navigate(target.path);
      }
    },
    [location.pathname, location.search, markRead, navigate]
  );
};
