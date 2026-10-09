import { useCallback } from "react";

import type { MentionSource } from "@/components/shared/rich-text";
import { useSessionContext } from "@/features/auth/hooks";

import { chatApi } from "../api";

/** @mention suggestions: people who can see the conversation (members for private channels / DMs). */
export const useMentionSource = (channelId: string): MentionSource => {
  const session = useSessionContext();
  return useCallback(
    async (query: string, signal?: AbortSignal) => {
      const result = await chatApi.directory({ q: query, channelId, limit: 8 }, signal);
      return result.items.filter((user) => user.id !== session.user.id);
    },
    [channelId, session.user.id]
  );
};
