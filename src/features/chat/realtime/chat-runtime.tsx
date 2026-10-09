import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import type { ChatChannelCollection, ChatChannelDetail } from "@/contracts/chat";
import { useSessionContext } from "@/features/auth/hooks";
import { useRealtimeEvent } from "@/lib/realtime/hooks";
import { scheduleInvalidate } from "@/lib/realtime/socket";
import { qk } from "@/lib/query-keys";

import { useChannels, forgetChannel } from "../hooks/use-channels";
import { chatKeys } from "../keys";
import { mergeChannelInfo, roomCandidates, updateSidebarChannel } from "../model/channels";
import { conversationKey } from "../model/pending";
import { useActiveChannelStore, useTypingStore } from "../model/ui-state";
import {
  receiveDeletion,
  receiveEdit,
  receiveMessage,
  receiveReaction,
  receiveReadState
} from "./cache";
import { useChannelRooms } from "./use-channel-rooms";

/** Rooms kept per socket for chat (gateway cap is 300; projects and tasks use the rest). */
const MAX_CHANNEL_ROOMS = 250;

/**
 * App-wide chat runtime (mounted once inside the authenticated shell, independent of which
 * navigation tree is visible): joins the viewer's channel rooms and applies every chat event to the
 * query cache so the sidebar, open conversations and threads stay live.
 */
export const ChatRuntime = () => {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const myId = session.user.id;
  const channels = useChannels();
  const activeChannelId = useActiveChannelStore((state) => state.channelId);

  const roomIds = useMemo(() => {
    const items = channels.data?.items ?? [];
    const ids = roomCandidates(items, MAX_CHANNEL_ROOMS);
    // The open conversation always gets live updates, even when it is old.
    if (
      activeChannelId &&
      !ids.includes(activeChannelId) &&
      items.some((channel) => channel.id === activeChannelId && channel.isMember)
    ) {
      ids.push(activeChannelId);
    }
    return ids;
  }, [activeChannelId, channels.data]);

  useChannelRooms(channels.data ? roomIds : undefined);

  useRealtimeEvent("chat:message", (event) =>
    receiveMessage(queryClient, event, myId, { fromRealtime: true })
  );
  useRealtimeEvent("chat:message:updated", (event) => receiveEdit(queryClient, event));
  useRealtimeEvent("chat:message:deleted", (event) => receiveDeletion(queryClient, event));
  useRealtimeEvent("chat:reaction", (event) => receiveReaction(queryClient, event, myId));
  useRealtimeEvent("chat:read", (event) => receiveReadState(queryClient, event));

  useRealtimeEvent("chat:typing", (event) => {
    if (event.userId === myId) return;
    useTypingStore.getState().touch(conversationKey(event.channelId, event.threadRootId), event.userId);
  });

  useRealtimeEvent("chat:channel", (event) => {
    const aboutMe = event.userIds.includes(myId);
    const detailKey = chatKeys.channel(event.channelId);
    switch (event.kind) {
      case "joined": {
        if (aboutMe) {
          // Added to a channel / DM: the sidebar entry carries viewer-specific counts → refetch.
          scheduleInvalidate(chatKeys.channels(), true);
          scheduleInvalidate(detailKey, true);
        } else {
          scheduleInvalidate(chatKeys.membersAll(event.channelId));
        }
        break;
      }
      case "left": {
        if (aboutMe) {
          forgetChannel(queryClient, event.channelId);
          scheduleInvalidate(detailKey, true);
          scheduleInvalidate(chatKeys.channels(), true);
        } else {
          scheduleInvalidate(chatKeys.membersAll(event.channelId));
        }
        break;
      }
      case "updated":
      case "archived": {
        if (aboutMe) {
          // My access / role changed: capabilities must be re-read.
          scheduleInvalidate(detailKey, true);
          scheduleInvalidate(chatKeys.membersAll(event.channelId));
        } else if (event.userIds.length > 0) {
          scheduleInvalidate(chatKeys.membersAll(event.channelId));
        }
        const cached = queryClient.getQueryData<ChatChannelDetail>(detailKey);
        if (event.kind === "archived" || (event.channel && cached && cached.kind !== event.channel.kind)) {
          // capabilities (canPost, canJoin…) follow the archived flag and the channel kind
          scheduleInvalidate(detailKey, true);
        }
        break;
      }
      case "deleted": {
        forgetChannel(queryClient, event.channelId);
        scheduleInvalidate(detailKey, true);
        break;
      }
    }
    const info = event.channel;
    if (info && event.kind !== "deleted" && !(event.kind === "left" && aboutMe)) {
      queryClient.setQueryData<ChatChannelCollection>(chatKeys.channels(), (collection) =>
        updateSidebarChannel(collection, event.channelId, (channel) => mergeChannelInfo(channel, info))
      );
      queryClient.setQueryData<ChatChannelDetail>(detailKey, (detail) => {
        if (!detail) return detail;
        const merged = mergeChannelInfo(detail, info);
        // Archive flips the posting capability; the refetch above brings the authoritative set.
        return info.archivedAt && !detail.archivedAt
          ? {
              ...merged,
              capabilities: { ...merged.capabilities, canPost: false, canJoin: false }
            }
          : merged;
      });
    }
  });

  // Room access was revoked (removed, downgraded, channel deleted): the room manager re-joins when
  // still allowed; the channel detail decides what the open view shows.
  useRealtimeEvent("access:revoked", (event) => {
    if (event.room.type !== "channel") return;
    scheduleInvalidate(chatKeys.channel(event.room.id), true);
    scheduleInvalidate(chatKeys.channels(), true);
  });

  // Project sidebar hints (ids only).
  useRealtimeEvent("workspace:sidebar", (event) => {
    scheduleInvalidate(qk.projects(), true);
    if (event.kind === "removed" || event.kind === "project") {
      scheduleInvalidate(qk.project(event.projectId), true);
    }
  });

  return null;
};
