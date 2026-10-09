import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import type { ChannelMemberPage, ChatChannelDetail, ChatMessage } from "@/contracts/chat";
import type { UserRef } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";

import { chatKeys } from "../keys";

/**
 * Resolves user ids to names for typing indicators and system messages from data the client already
 * holds (the viewer, DM participants, loaded members, message authors) — never a request per id.
 */
export const useUserLookup = (
  channel: ChatChannelDetail | undefined,
  messages: readonly ChatMessage[]
) => {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const channelId = channel?.id;

  const authors = useMemo(() => {
    const map = new Map<string, UserRef>();
    for (const message of messages) {
      if (message.author) map.set(message.author.id, message.author);
    }
    return map;
  }, [messages]);

  return useCallback(
    (userId: string): string | null => {
      if (userId === session.user.id) return "bạn";
      const participant = channel?.participants.find((user) => user.id === userId);
      if (participant) return participant.displayName;
      const author = authors.get(userId);
      if (author) return author.displayName;
      if (channelId) {
        const memberPages = queryClient.getQueriesData<InfiniteData<ChannelMemberPage>>({
          queryKey: chatKeys.membersAll(channelId)
        });
        for (const [, data] of memberPages) {
          for (const page of data?.pages ?? []) {
            const member = page.items.find((item) => item.user.id === userId);
            if (member) return member.user.displayName;
          }
        }
      }
      return null;
    },
    [authors, channel?.participants, channelId, queryClient, session.user.id]
  );
};
