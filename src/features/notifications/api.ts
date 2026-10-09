import type { z } from "zod";

import { NotificationPageSchema, UnreadCountSchema } from "@/contracts/notifications";
import { api } from "@/lib/api/client";

export type NotificationFilter = "all" | "unread";

/** Inbox API (BE modules/notifications/notifications.routes.ts). */
export const notificationsApi = {
  list: (
    params: { filter: NotificationFilter; cursor?: string | null; limit?: number },
    signal?: AbortSignal
  ) =>
    api.get("/notifications", NotificationPageSchema, {
      query: { filter: params.filter, cursor: params.cursor ?? undefined, limit: params.limit ?? 30 },
      signal
    }),
  unreadCount: (signal?: AbortSignal) =>
    api.get("/notifications/unread-count", UnreadCountSchema, { signal }),
  markRead: (input: { ids: string[] } | { all: true }) =>
    api.post("/notifications/read", UnreadCountSchema, input),
  archive: (ids: string[]) => api.post("/notifications/archive", UnreadCountSchema, { ids })
};

export type UnreadCount = z.infer<typeof UnreadCountSchema>;
