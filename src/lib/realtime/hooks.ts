import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useMemo } from "react";

import { roomName, type RealtimeRoomRef } from "@/contracts/realtime";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";

import {
  connectRealtime,
  onServerEvent,
  queryPresence,
  retainRoom,
  useRealtimeStore,
  type RoomStatus,
  type ServerEventName,
  type ServerEventPayload
} from "./socket";

/** Opens the realtime connection for the signed-in shell. Disconnect happens on logout. */
export const useRealtimeConnection = (onSessionLost: () => void) => {
  const queryClient = useQueryClient();
  const handleSessionLost = useEffectEvent(onSessionLost);

  useEffect(() => {
    connectRealtime({
      queryClient,
      refreshSession: api.refreshSession,
      onSessionLost: () => handleSessionLost()
    });
  }, [queryClient]);
};

export const useRealtimeStatus = () => useRealtimeStore((state) => state.status);

/**
 * Joins a realtime room (project | channel | task) while the component is mounted. Joins are
 * ref-counted, acknowledged by the gateway, re-joined after reconnects and left on unmount.
 * Pass null to skip. Returns the join status ("denied" = not authorized / not found).
 */
export const useRealtimeRoom = (ref: RealtimeRoomRef | null): RoomStatus | null => {
  const type = ref?.type;
  const id = ref?.id;
  useEffect(() => {
    if (!type || !id) {
      return undefined;
    }
    return retainRoom({ type, id });
  }, [type, id]);

  return useRealtimeStore((state) =>
    type && id ? (state.rooms[roomName({ type, id })] ?? "pending") : null
  );
};

/** Subscribes to a typed server event. The handler always sees the latest props/state. */
export const useRealtimeEvent = <E extends ServerEventName>(
  event: E,
  handler: (payload: ServerEventPayload<E>) => void,
  enabled = true
) => {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    return onServerEvent(event, (payload) => onEvent(payload));
  }, [enabled, event]);
};

const emptyOnline: ReadonlySet<string> = new Set();

/** Online subset of `userIds`, polled through the gateway every 45s while connected. */
export const usePresence = (userIds: readonly string[]): ReadonlySet<string> => {
  const connected = useRealtimeStore((state) => state.status === "connected");
  const key = qk.presence(userIds);
  const ids = key[1];
  const query = useQuery({
    queryKey: key,
    queryFn: () => queryPresence(ids),
    enabled: connected && ids.length > 0,
    refetchInterval: 45_000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    retry: false
  });
  return useMemo(() => (query.data ? new Set(query.data) : emptyOnline), [query.data]);
};
