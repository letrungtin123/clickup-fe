import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type { ThreadPage } from "@/contracts/chat";

import { chatApi } from "../api";
import { chatErrorMessage, isChannelGone } from "../errors";
import { chatKeys } from "../keys";
import { fromThreadPages, type ThreadState } from "../model/thread";

const PAGE = 50;
/** Replies loaded up front; longer threads continue with "load more". */
const INITIAL_PAGES = 4;

/** Thread root + replies (oldest → newest). Live replies are merged by the chat runtime. */
export const useThread = (rootId: string) => {
  const queryClient = useQueryClient();
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: chatKeys.thread(rootId),
    queryFn: async ({ signal }) => {
      const pages: ThreadPage[] = [];
      let cursor: string | undefined;
      for (let index = 0; index < INITIAL_PAGES; index += 1) {
        const page = await chatApi.thread(
          rootId,
          { limit: PAGE, ...(cursor ? { cursor } : {}) },
          signal
        );
        pages.push(page);
        if (!page.pageInfo.hasMore || !page.pageInfo.nextCursor) break;
        cursor = page.pageInfo.nextCursor;
      }
      const state = fromThreadPages(pages);
      if (!state) throw new Error("Empty thread response");
      return state;
    },
    staleTime: 60_000,
    retry: (failureCount, error) => !isChannelGone(error) && failureCount < 2
  });

  const loadMore = useCallback(async () => {
    const current = queryClient.getQueryData<ThreadState>(chatKeys.thread(rootId));
    if (!current?.hasMore || !current.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const page = await chatApi.thread(rootId, { limit: PAGE, cursor: current.nextCursor });
      queryClient.setQueryData<ThreadState>(chatKeys.thread(rootId), (thread) => {
        if (!thread) return thread;
        const seen = new Set(thread.items.map((item) => item.id));
        return {
          root: page.root,
          items: [...thread.items, ...page.items.filter((item) => !seen.has(item.id))],
          nextCursor: page.pageInfo.nextCursor,
          hasMore: page.pageInfo.hasMore
        };
      });
    } catch (error) {
      setLoadError(chatErrorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, queryClient, rootId]);

  return { query, loadMore, loadingMore, loadError };
};
