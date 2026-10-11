import { useQuery } from "@tanstack/react-query";

import { chatApi } from "../api";
import { chatKeys } from "../keys";

/** Who reacted to a message; fetched only while a tooltip or the reactions sheet is open. */
export const useReactionPeople = (messageId: string, enabled: boolean) =>
  useQuery({
    queryKey: chatKeys.reactions(messageId),
    queryFn: ({ signal }) => chatApi.reactionUsers(messageId, signal),
    enabled,
    staleTime: 15_000
  });
