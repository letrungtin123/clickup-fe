import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { MentionSource } from "@/components/shared/rich-text";
import type { KnowledgeSpace } from "@/contracts/knowledge";
import type { UserRef } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";
import { foldText } from "@/features/search/model";
import { useMentionSource } from "@/features/tasks/hooks";
import { qk } from "@/lib/query-keys";

import { knowledgeApi } from "./api";

/**
 * @mention suggestions for a knowledge item. Public space: anyone in the organization (everyone with
 * `knowledge.view` reads it). Private space: its members only — a mention of someone who cannot see the
 * space would only become plain text (PD-031 §05), so they are not offered.
 */
export const useKnowledgeMentionSource = (
  space: Pick<KnowledgeSpace, "id" | "visibility">
): MentionSource<UserRef> => {
  const client = useQueryClient();
  const session = useSessionContext();
  const directory = useMentionSource(undefined);
  const members = useCallback(
    async (query: string) => {
      const result = await client.fetchQuery({
        queryKey: qk.knowledge.members(space.id),
        queryFn: ({ signal }) => knowledgeApi.members(space.id, signal),
        staleTime: 60_000
      });
      const needle = foldText(query.trim());
      return result.items
        .map((member) => member.user)
        .filter((user) => user.id !== session.user.id)
        .filter((user) => !needle || foldText(`${user.displayName} ${user.email ?? ""}`).includes(needle))
        .slice(0, 8);
    },
    [client, session.user.id, space.id]
  );
  return space.visibility === "private" ? members : directory;
};
