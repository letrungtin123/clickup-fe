import type { z } from "zod";

import {
  NotificationPageSchema,
  UnreadCountSchema,
  type NotificationType
} from "@/contracts/notifications";
import { api } from "@/lib/api/client";

export type NotificationFilter = "all" | "unread";

/** Inbox tabs: "mentions" is the server-side `types=` filter over every notification. */
export type NotificationFeed = NotificationFilter | "mentions";

/** Inbox API (BE modules/notifications/notifications.routes.ts). */
export const notificationsApi = {
  list: (
    params: {
      filter: NotificationFilter;
      types?: readonly NotificationType[] | undefined;
      cursor?: string | null;
      limit?: number;
    },
    signal?: AbortSignal
  ) =>
    api.get("/notifications", NotificationPageSchema, {
      query: {
        filter: params.filter,
        types: params.types,
        cursor: params.cursor ?? undefined,
        limit: params.limit ?? 30
      },
      signal
    }),
  unreadCount: (signal?: AbortSignal) =>
    api.get("/notifications/unread-count", UnreadCountSchema, { signal }),
  markRead: (input: { ids: string[] } | { all: true }) =>
    api.post("/notifications/read", UnreadCountSchema, input),
  archive: (ids: string[]) => api.post("/notifications/archive", UnreadCountSchema, { ids })
};

export type UnreadCount = z.infer<typeof UnreadCountSchema>;
