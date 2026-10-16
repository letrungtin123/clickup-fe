import { useCallback } from "react";

import type { MentionCandidate, MentionSource } from "@/components/shared/rich-text/mention-candidates";
import type { ChatChannel } from "@/contracts/chat";
import { useSessionContext } from "@/features/auth/hooks";

import { chatApi } from "../api";
import { mentionAllCandidate } from "../model/mention-all";

/**
 * People offered after "@": the directory's page maximum, so typing "@" lists everyone who can be mentioned (the
 * popup scrolls). A short page used to hide people (8 minus yourself = 7).
 */
export const mentionCandidateLimit = 50;

/**
 * @mention suggestions: people who can see the conversation (members for private channels / DMs; members and the
 * channel's department for public channels, PD-053). Channels and group DMs put "@all" first (PD-061) on a bare "@"
 * or a matching query ("all", "tất cả", "everyone", "kênh"…); a 1:1 DM never offers it.
 */
export const useMentionSource = (
  channel: Pick<ChatChannel, "id" | "kind" | "memberCount">
): MentionSource => {
  const session = useSessionContext();
  const { id: channelId, kind, memberCount } = channel;
  return useCallback(
    async (query: string, signal?: AbortSignal) => {
      const result = await chatApi.directory(
        { q: query, channelId, limit: mentionCandidateLimit },
        signal
      );
      const people: MentionCandidate[] = result.items.filter((user) => user.id !== session.user.id);
      const all = mentionAllCandidate({ kind, memberCount }, query);
      return all ? [all, ...people] : people;
    },
    [channelId, kind, memberCount, session.user.id]
  );
};
