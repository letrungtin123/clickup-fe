import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

import type { Notification, NotificationPage } from "@/contracts/notifications";
import { TASK_PANEL_PARAM } from "@/features/tasks/use-task-panel";
import { getErrorMessage } from "@/lib/api/errors";
import { qk } from "@/lib/query-keys";

import { notificationsApi, type NotificationFilter } from "./api";
import { notificationTarget } from "./describe";

type Feed = InfiniteData<NotificationPage, string | null>;

export const useNotificationFeed = (filter: NotificationFilter, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.notifications.feed(filter),
    queryFn: ({ signal, pageParam }) =>
      notificationsApi.list({ filter, cursor: pageParam, limit: 30 }, signal),
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

const mapFeeds = (
  queryClient: QueryClient,
  update: (item: Notification) => Notification | null
) => {
  for (const filter of ["all", "unread"] as const) {
    queryClient.setQueryData<Feed>(qk.notifications.feed(filter), (feed) => {
      if (!feed) return feed;
      let changed = false;
      const pages = feed.pages.map((page) => {
        let pageChanged = false;
        const items: Notification[] = [];
        for (const item of page.items) {
          const next = update(item);
          if (next !== item) pageChanged = true;
          if (next) items.push(next);
        }
        if (!pageChanged) return page;
        changed = true;
        return { ...page, items };
      });
      return changed ? { ...feed, pages } : feed;
    });
  }
};

export const setUnreadCount = (queryClient: QueryClient, unreadCount: number) =>
  queryClient.setQueryData(qk.notifications.unreadCount(), unreadCount);

export const prependNotification = (queryClient: QueryClient, notification: Notification) => {
  for (const filter of ["all", "unread"] as const) {
    queryClient.setQueryData<Feed>(qk.notifications.feed(filter), (feed) => {
      const first = feed?.pages[0];
      if (!feed || !first) return feed;
      if (feed.pages.some((page) => page.items.some((item) => item.id === notification.id))) {
        return feed;
      }
      return {
        ...feed,
        pages: [{ ...first, items: [notification, ...first.items] }, ...feed.pages.slice(1)]
      };
    });
  }
};

export const applyRead = (queryClient: QueryClient, ids: readonly string[] | "all", readAt: string) => {
  const idSet = ids === "all" ? null : new Set(ids);
  mapFeeds(queryClient, (item) =>
    item.readAt || (idSet && !idSet.has(item.id)) ? item : { ...item, readAt }
  );
};

export const applyArchive = (queryClient: QueryClient, ids: readonly string[]) => {
  const idSet = new Set(ids);
  mapFeeds(queryClient, (item) => (idSet.has(item.id) ? null : item));
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
      else if (previous !== undefined) setUnreadCount(queryClient, Math.max(0, previous - ids.length));
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
