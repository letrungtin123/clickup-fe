import { useCallback } from "react";

import type { MentionSource } from "@/components/shared/rich-text";
import { useSessionContext } from "@/features/auth/hooks";

import { chatApi } from "../api";

/**
 * People offered after "@": the directory's page maximum, so typing "@" lists everyone who can be mentioned (the
 * popup scrolls). A short page used to hide people (8 minus yourself = 7).
 */
export const mentionCandidateLimit = 50;

/**
 * @mention suggestions: people who can see the conversation (members for private channels / DMs; members and the
 * channel's department for public channels, PD-053).
 */
export const useMentionSource = (channelId: string): MentionSource => {
  const session = useSessionContext();
  return useCallback(
    async (query: string, signal?: AbortSignal) => {
      const result = await chatApi.directory(
        { q: query, channelId, limit: mentionCandidateLimit },
        signal
      );
      return result.items.filter((user) => user.id !== session.user.id);
    },
    [channelId, session.user.id]
  );
};
