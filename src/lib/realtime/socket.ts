import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { create } from "zustand";

import {
  roomName,
  type ClientToServerEvents,
  type RealtimeAck,
  type RealtimeRoomRef,
  type ServerToClientEvents
} from "@/contracts/realtime";
import { webEnv } from "@/lib/env";
import { qk } from "@/lib/query-keys";

/**
 * Realtime client (ADR-0002). One Socket.IO connection per signed-in tab, authenticated by the HttpOnly
 * session cookie. Events are cache *hints*: handlers invalidate TanStack Query keys and the API stays the
 * source of truth. After any reconnect every active query is refetched to reconcile missed events.
 */

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ServerEventName = keyof ServerToClientEvents;
export type ServerEventPayload<E extends ServerEventName> = Parameters<ServerToClientEvents[E]>[0];

export type RealtimeStatus = "idle" | "connecting" | "connected" | "reconnecting" | "offline";
export type RoomStatus = "pending" | "joined" | "denied";

type RealtimeState = {
  status: RealtimeStatus;
  rooms: Record<string, RoomStatus>;
};

export const useRealtimeStore = create<RealtimeState>(() => ({ status: "idle", rooms: {} }));

const setStatus = (status: RealtimeStatus) => useRealtimeStore.setState({ status });
const setRoomStatus = (name: string, status: RoomStatus | null) =>
  useRealtimeStore.setState((state) => {
    const rooms = { ...state.rooms };
    if (status === null) {
      delete rooms[name];
    } else {
      rooms[name] = status;
    }
    return { rooms };
  });

// --- Local event bus: hooks subscribe here, independent of the socket's lifecycle ----------------------

type AnyListener = (payload: unknown) => void;
const listeners = new Map<string, Set<AnyListener>>();

export const onServerEvent = <E extends ServerEventName>(
  event: E,
  listener: (payload: ServerEventPayload<E>) => void
) => {
  const set = listeners.get(event) ?? new Set<AnyListener>();
  set.add(listener as AnyListener);
  listeners.set(event, set);
  return () => {
    set.delete(listener as AnyListener);
  };
};

const dispatch = (event: string, payload: unknown) => {
  const set = listeners.get(event);
  if (!set) {
    return;
  }
  for (const listener of [...set]) {
    try {
      listener(payload);
    } catch (error) {
      console.error(`[realtime] listener for ${event} failed`, error);
    }
  }
};

// --- Connection ---------------------------------------------------------------------------------------

type ConnectOptions = {
  queryClient: QueryClient;
  /** Refreshes the HttpOnly session cookies (shared single-flight with the HTTP client). */
  refreshSession: () => Promise<boolean>;
  /** Called when the session cannot be refreshed any more. */
  onSessionLost: () => void;
};

const heartbeatMs = 30_000;
const ackTimeoutMs = 10_000;
const authErrorCodes = new Set(["AUTH_REQUIRED", "AUTH_INVALID"]);

let socket: AppSocket | null = null;
let options: ConnectOptions | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let manualRetry: ReturnType<typeof setTimeout> | null = null;
let manualAttempts = 0;
let hasConnectedBefore = false;
const roomRefs = new Map<string, { ref: RealtimeRoomRef; count: number }>();

export const getSocket = () => socket;

// Coalesce invalidations from bursts of events into one refetch per key.
const pendingInvalidations = new Map<string, { queryKey: QueryKey; exact: boolean }>();
let invalidateTimer: ReturnType<typeof setTimeout> | null = null;

export const scheduleInvalidate = (queryKey: QueryKey, exact = false) => {
  pendingInvalidations.set(`${exact ? "=" : "^"}${JSON.stringify(queryKey)}`, { queryKey, exact });
  invalidateTimer ??= setTimeout(() => {
    invalidateTimer = null;
    const client = options?.queryClient;
    const batch = [...pendingInvalidations.values()];
    pendingInvalidations.clear();
    for (const entry of batch) {
      void client?.invalidateQueries({ queryKey: entry.queryKey, exact: entry.exact });
    }
  }, 120);
};

const emitJoin = (ref: RealtimeRoomRef) => {
  const name = roomName(ref);
  if (!socket?.connected) {
    setRoomStatus(name, "pending");
    return;
  }
  setRoomStatus(name, "pending");
  socket
    .timeout(ackTimeoutMs)
    .emit("room:join", ref, (error: Error | null, result?: RealtimeAck) => {
      if (!roomRefs.has(name)) {
        return;
      }
      if (error || !result) {
        // Timed out — the next reconnect re-joins; keep it pending.
        return;
      }
      setRoomStatus(name, result.ok ? "joined" : "denied");
    });
};

const startHeartbeat = () => {
  stopHeartbeat();
  heartbeat = setInterval(() => socket?.emit("presence:heartbeat"), heartbeatMs);
};

const stopHeartbeat = () => {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
};

const scheduleManualReconnect = () => {
  if (manualRetry || !socket) {
    return;
  }
  const delay = Math.min(30_000, 1000 * 2 ** manualAttempts) * (0.75 + Math.random() * 0.5);
  manualAttempts += 1;
  manualRetry = setTimeout(() => {
    manualRetry = null;
    socket?.connect();
  }, delay);
};

/** Refresh cookies, then reconnect so the gateway re-authenticates the handshake with the new token. */
const reauthenticate = async () => {
  const ok = (await options?.refreshSession()) ?? false;
  if (!socket) {
    return;
  }
  if (!ok) {
    setStatus("offline");
    options?.onSessionLost();
    return;
  }
  socket.disconnect();
  socket.connect();
};

const handleProjectStructure = (event: ServerEventPayload<"project:structure">) => {
  scheduleInvalidate(qk.projects(), true);
  scheduleInvalidate(qk.project(event.projectId), true);
  if (event.kind === "members") {
    scheduleInvalidate(qk.projectMembers(event.projectId));
  }
  if (event.kind === "statuses") {
    scheduleInvalidate(["project", event.projectId, "statuses"]);
    scheduleInvalidate(qk.tasks(event.projectId));
  }
};

const handleTaskChanged = (event: ServerEventPayload<"task:changed">) => {
  scheduleInvalidate(qk.tasks(event.projectId));
  scheduleInvalidate(qk.myTasks());
  scheduleInvalidate(qk.task(event.taskId), true);
  if (event.parentTaskId) {
    scheduleInvalidate(qk.task(event.parentTaskId), true);
  }
};

const handleAccessRevoked = (event: ServerEventPayload<"access:revoked">) => {
  const name = roomName(event.room);
  // The server already removed us from the room; forget it so reconnects do not re-join.
  roomRefs.delete(name);
  setRoomStatus(name, "denied");
  if (event.room.type === "project") {
    scheduleInvalidate(qk.projects(), true);
    scheduleInvalidate(qk.project(event.room.id));
  } else if (event.room.type === "task") {
    scheduleInvalidate(qk.task(event.room.id));
  } else {
    scheduleInvalidate(qk.chat.all());
  }
};

const wireSocket = (instance: AppSocket) => {
  instance.on("connect", () => {
    manualAttempts = 0;
    setStatus("connected");
    startHeartbeat();
    for (const { ref } of roomRefs.values()) {
      emitJoin(ref);
    }
    if (hasConnectedBefore) {
      // We may have missed events while offline: refetch whatever is on screen.
      void options?.queryClient.invalidateQueries();
    }
    hasConnectedBefore = true;
  });

  instance.on("disconnect", (reason) => {
    stopHeartbeat();
    for (const name of roomRefs.keys()) {
      setRoomStatus(name, "pending");
    }
    if (reason === "io client disconnect") {
      return;
    }
    setStatus("reconnecting");
    if (reason === "io server disconnect") {
      // Server closed the socket (e.g. access token expired): refresh and reconnect manually.
      void reauthenticate();
    }
  });

  instance.on("connect_error", (error: Error & { data?: { code?: string } }) => {
    const code = error.data?.code ?? error.message;
    setStatus(hasConnectedBefore ? "reconnecting" : "connecting");
    if (instance.active) {
      return; // transport-level failure: socket.io's own backoff keeps retrying
    }
    if (authErrorCodes.has(code)) {
      void reauthenticate();
      return;
    }
    scheduleManualReconnect();
  });

  instance.io.on("reconnect_attempt", () => setStatus("reconnecting"));

  instance.on("session:expiring", () => {
    void reauthenticate();
  });

  instance.on("project:structure", handleProjectStructure);
  instance.on("task:changed", handleTaskChanged);
  instance.on("task:timeline", (event) => scheduleInvalidate(qk.timeline(event.taskId)));
  instance.on("access:revoked", handleAccessRevoked);

  instance.onAny((event: string, payload: unknown) => dispatch(event, payload));
};

/** Opens the singleton connection (idempotent). Call once the user is authenticated. */
export const connectRealtime = (connectOptions: ConnectOptions) => {
  options = connectOptions;
  if (socket) {
    if (!socket.connected && !socket.active) {
      socket.connect();
    }
    return socket;
  }

  const instance: AppSocket = io(webEnv.realtimeUrl || undefined, {
    path: webEnv.realtimePath,
    withCredentials: true,
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15_000,
    randomizationFactor: 0.5,
    timeout: 15_000
  });
  socket = instance;
  wireSocket(instance);
  setStatus("connecting");
  instance.connect();
  return instance;
};

/** Closes the connection and forgets every room (logout). */
export const disconnectRealtime = () => {
  stopHeartbeat();
  if (manualRetry) {
    clearTimeout(manualRetry);
    manualRetry = null;
  }
  if (invalidateTimer) {
    clearTimeout(invalidateTimer);
    invalidateTimer = null;
  }
  pendingInvalidations.clear();
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  options = null;
  hasConnectedBefore = false;
  manualAttempts = 0;
  roomRefs.clear();
  useRealtimeStore.setState({ status: "idle", rooms: {} });
};

/** Reference-counted room membership. Returns a release function. */
export const retainRoom = (ref: RealtimeRoomRef) => {
  const name = roomName(ref);
  const entry = roomRefs.get(name);
  if (entry) {
    entry.count += 1;
  } else {
    roomRefs.set(name, { ref, count: 1 });
    emitJoin(ref);
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const current = roomRefs.get(name);
    if (!current) {
      return;
    }
    current.count -= 1;
    if (current.count <= 0) {
      roomRefs.delete(name);
      setRoomStatus(name, null);
      if (socket?.connected) {
        socket.emit("room:leave", ref);
      }
    }
  };
};

/** Asks the gateway which of `userIds` are online (≤200 per call). */
export const queryPresence = async (userIds: readonly string[]): Promise<string[]> => {
  const instance = socket;
  if (!instance?.connected || userIds.length === 0) {
    return [];
  }
  const chunks: string[][] = [];
  for (let index = 0; index < userIds.length; index += 200) {
    chunks.push(userIds.slice(index, index + 200));
  }
  const results = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<string[]>((resolve) => {
          instance
            .timeout(ackTimeoutMs)
            .emit(
              "presence:query",
              { userIds: chunk },
              (error: Error | null, result?: { online: string[] }) => {
                resolve(error || !result ? [] : result.online);
              }
            );
        })
    )
  );
  return results.flat();
};
