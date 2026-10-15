import { useQuery } from "@tanstack/react-query";

import type { ReactionUsers } from "@/contracts/chat";

import { chatApi } from "../api";
import { chatKeys } from "../keys";

/**
 * Everyone who reacted to a message; fetched only while the reactions sheet is open. `preview` (the
 * message's own reactions with their first reactors) shows at once until the full list arrives.
 */
export const useReactionPeople = (messageId: string, enabled: boolean, preview?: ReactionUsers) =>
  useQuery({
    queryKey: chatKeys.reactions(messageId),
    queryFn: ({ signal }) => chatApi.reactionUsers(messageId, signal),
    enabled,
    staleTime: 15_000,
    ...(preview ? { placeholderData: preview } : {})
  });
