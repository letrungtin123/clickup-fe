import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { isApiError } from "@/lib/api/errors";

import { chatApi } from "../api";
import { chatErrorMessage, isChannelGone } from "../errors";
import { chatKeys } from "../keys";
import {
  firstSeq,
  fromHistory,
  lastSeq,
  mergeNewer,
  mergeOlder,
  mergeRefresh,
  type MessageWindow
} from "../model/window";

const PAGE = 50;

/**
 * One channel's message window in the query cache (`chatKeys.messages(channelId)`).
 * - The query itself loads (and on refetch reconciles) the latest page.
 * - `loadOlder` / `loadNewer` page by seq; `jumpTo` replaces the window around a message.
 * - Realtime events are merged by the chat runtime (no refetch per event).
 */
export const useMessageWindow = (
  channelId: string,
  options: { enabled: boolean; isMember: boolean; initialAnchor: string | null }
) => {
  const queryClient = useQueryClient();
  const key = chatKeys.messages(channelId);
  // A deep link loads its "around" window first, so the latest page is not fetched for nothing.
  const [jumping, setJumping] = useState<string | null>(() => {
    if (!options.initialAnchor) return null;
    const cached = queryClient.getQueryData<MessageWindow>(key);
    return cached?.items.some((message) => message.id === options.initialAnchor)
      ? null
      : options.initialAnchor;
  });
  const [olderState, setOlderState] = useState<"idle" | "loading" | "error">("idle");
  const [newerState, setNewerState] = useState<"idle" | "loading" | "error">("idle");
  const inflight = useRef({
    older: false,
    newer: false,
    jump: null as { id: string; promise: Promise<boolean> } | null
  });

  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const latest = fromHistory(await chatApi.history(channelId, { limit: PAGE }, signal));
      return mergeRefresh(queryClient.getQueryData<MessageWindow>(key), latest);
    },
    enabled: options.enabled && jumping === null,
    // Members get every change over the socket; previews of public channels poll on focus.
    staleTime: options.isMember ? 5 * 60_000 : 15_000,
    retry: (failureCount, error) => !isChannelGone(error) && failureCount < 2
  });

  const loadOlder = useCallback(async () => {
    const current = queryClient.getQueryData<MessageWindow>(key);
    const before = current ? firstSeq(current) : null;
    if (!current?.hasOlder || before === null || inflight.current.older) return;
    inflight.current.older = true;
    setOlderState("loading");
    try {
      const page = await chatApi.history(channelId, { before, limit: PAGE });
      queryClient.setQueryData<MessageWindow>(key, (window) => (window ? mergeOlder(window, page) : window));
      setOlderState("idle");
    } catch {
      setOlderState("error");
    } finally {
      inflight.current.older = false;
    }
    // key is derived from channelId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, queryClient]);

  const loadNewer = useCallback(async () => {
    const current = queryClient.getQueryData<MessageWindow>(key);
    const after = current ? lastSeq(current) : null;
    if (!current?.hasNewer || after === null || inflight.current.newer) return;
    inflight.current.newer = true;
    setNewerState("loading");
    try {
      const page = await chatApi.history(channelId, { after, limit: PAGE });
      queryClient.setQueryData<MessageWindow>(key, (window) => (window ? mergeNewer(window, page) : window));
      setNewerState("idle");
    } catch {
      setNewerState("error");
    } finally {
      inflight.current.newer = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, queryClient]);

  /** Replaces the window with one centred on `messageId`. Resolves false when it is gone. */
  const jumpTo = useCallback(
    (messageId: string): Promise<boolean> => {
      const current = queryClient.getQueryData<MessageWindow>(key);
      if (current?.items.some((message) => message.id === messageId)) {
        setJumping(null);
        return Promise.resolve(true);
      }
      const running = inflight.current.jump;
      if (running && running.id === messageId) return running.promise;
      setJumping(messageId);
      const promise = (async () => {
        try {
          const page = await chatApi.history(channelId, { around: messageId, limit: PAGE });
          await queryClient.cancelQueries({ queryKey: key, exact: true });
          queryClient.setQueryData<MessageWindow>(key, fromHistory(page));
          return true;
        } catch (error) {
          toast.error(
            isApiError(error) && error.status === 404
              ? "Không tìm thấy tin nhắn — có thể nó đã bị xóa."
              : chatErrorMessage(error)
          );
          return false;
        } finally {
          inflight.current.jump = null;
          setJumping(null);
        }
      })();
      inflight.current.jump = { id: messageId, promise };
      return promise;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelId, queryClient]
  );

  /** Back to the live end (after reading history). */
  const jumpToLatest = useCallback(async () => {
    const current = queryClient.getQueryData<MessageWindow>(key);
    if (current && !current.hasNewer) return;
    setJumping("latest");
    try {
      const page = await chatApi.history(channelId, { limit: PAGE });
      queryClient.setQueryData<MessageWindow>(key, fromHistory(page));
    } catch (error) {
      toast.error(chatErrorMessage(error));
    } finally {
      setJumping(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, queryClient]);

  return {
    query,
    window: query.data,
    jumping,
    olderState,
    newerState,
    loadOlder,
    loadNewer,
    jumpTo,
    jumpToLatest
  };
};
