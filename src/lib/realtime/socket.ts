import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { create } from "zustand";

import {
  roomName,
  type ClientToServerEvents,
  type RealtimeAck,
  type RealtimeRoomRef,
  type ServerToClientEvents,
  type SessionRefreshAck
} from "@/contracts/realtime";
import { webEnv } from "@/lib/env";
import { qk } from "@/lib/query-keys";

import { markRealtimeDown, markRealtimeUp, resetRealtimeGap } from "./gap";

/**
 * Realtime client (ADR-0002). One Socket.IO connection per signed-in tab, authenticated by the HttpOnly
 * session cookie. Events are cache *hints*: handlers patch / invalidate TanStack Query keys and the API
 * stays the source of truth.
 *
 * Reconnects (PERF-02): room joins are paced under the gateway's token bucket and transient join
 * failures (RATE_LIMITED, UNAVAILABLE, ack timeout) are retried with backoff for every room type. A
 * short blip (token refresh, network hiccup) only refetches the live surfaces (chat, inbox) and marks
 * the rest stale; everything on screen is refetched only after a long disconnect.
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
    if (status !== null && state.rooms[name] === status) {
      return state;
    }
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

/**
 * Subscribes to an event the synced contract may not declare yet (the payload is untrusted: validate
 * it). Lets the client handle a new server event before / without a contract re-sync.
 */
export const onUntypedServerEvent = (event: string, listener: (payload: unknown) => void) => {
  const set = listeners.get(event) ?? new Set<AnyListener>();
  set.add(listener);
  listeners.set(event, set);
  return () => {
    set.delete(listener);
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

// --- Reconnect policy (pure, tested) ---------------------------------------------------------------

/** Disconnects longer than this refetch everything on screen after the reconnect. */
export const reconnectRefetchAfterMs = 30_000;

/**
 * - "none": the server recovered the session (Socket.IO connection state recovery replayed what we missed);
 * - "live": short blip — refetch the live surfaces (chat, inbox), mark everything else stale;
 * - "all": long gap — refetch every active query.
 */
export type ReconnectPlan = "none" | "live" | "all";

export const reconnectPlan = (gapMs: number, recovered: boolean): ReconnectPlan => {
  if (recovered) return "none";
  return gapMs > reconnectRefetchAfterMs ? "all" : "live";
};

/** Queries refetched after a short blip: conversations, threads and the inbox. */
export const isLiveSurfaceKey = (key: QueryKey) =>
  key[0] === "notifications" ||
  (key[0] === "chat" && (key[1] === "channels" || key[1] === "channel" || key[1] === "thread"));

const applyReconnectPlan = (client: QueryClient, plan: ReconnectPlan) => {
  if (plan === "all") {
    void client.invalidateQueries();
    return;
  }
  if (plan === "live") {
    // Stale everywhere (refetched on the next mount / focus), refetched now only where it matters.
    void client.invalidateQueries({ refetchType: "none" });
    void client.invalidateQueries({ predicate: (query) => isLiveSurfaceKey(query.queryKey) });
  }
};

export type JoinOutcome = "joined" | "denied" | "retry";

/** Gateway refusals that are worth retrying (token bucket, transient authorization failure). */
const retryableJoinCodes = new Set(["RATE_LIMITED", "UNAVAILABLE"]);

/** Ack timeouts and transient refusals are retried; NOT_FOUND / INVALID_ROOM / TOO_MANY_ROOMS stick. */
export const classifyJoinAck = (error: Error | null, result: RealtimeAck | undefined): JoinOutcome => {
  if (error || !result) return "retry";
  if (result.ok) return "joined";
  return retryableJoinCodes.has(result.code) ? "retry" : "denied";
};

/** Exponential backoff with jitter for a room join retry (attempt 0 → ~1 s, capped at 30 s). */
export const joinRetryDelay = (attempt: number, random: number = Math.random()) =>
  Math.min(30_000, 1000 * 2 ** attempt) * (0.75 + random * 0.5);

// --- Connection ---------------------------------------------------------------------------------------

type ConnectOptions = {
  queryClient: QueryClient;
  /** Refreshes the HttpOnly session cookies (shared single-flight with the HTTP client). */
  refreshSession: () => Promise<boolean>;
  /** Called when the session cannot be refreshed any more. */
  onSessionLost: () => void;
  /**
   * POST /auth/socket-ticket: a short-lived ticket that hands a refreshed session to the open socket
   * (`session:refresh`), so token rotation no longer drops the connection (PERF-02).
   */
  issueSocketTicket?: (() => Promise<{ ticket: string }>) | undefined;
};

const heartbeatMs = 30_000;
const ackTimeoutMs = 10_000;
const authErrorCodes = new Set(["AUTH_REQUIRED", "AUTH_INVALID"]);
/** The gateway bucket holds 30 events and refills 15/s: 8 joins per 600 ms stays well under it. */
const joinBatch = 8;
const joinIntervalMs = 600;
const maxJoinAttempts = 6;

let socket: AppSocket | null = null;
let options: ConnectOptions | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let manualRetry: ReturnType<typeof setTimeout> | null = null;
let manualAttempts = 0;
let hasConnectedBefore = false;
let disconnectedAt: number | null = null;
let plannedReconnect = false;
const roomRefs = new Map<string, { ref: RealtimeRoomRef; count: number }>();
const joinQueue: string[] = [];
let joinTimer: ReturnType<typeof setTimeout> | null = null;
let joinWindowSent = 0;
const joinRetries = new Map<string, { attempts: number; timer: ReturnType<typeof setTimeout> | null }>();

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

const clearJoinRetry = (name: string) => {
  const state = joinRetries.get(name);
  if (state?.timer) clearTimeout(state.timer);
  joinRetries.delete(name);
};

const resetJoins = () => {
  joinQueue.length = 0;
  joinWindowSent = 0;
  if (joinTimer) {
    clearTimeout(joinTimer);
    joinTimer = null;
  }
  for (const state of joinRetries.values()) {
    if (state.timer) clearTimeout(state.timer);
  }
  joinRetries.clear();
};

const scheduleJoinRetry = (name: string) => {
  const state = joinRetries.get(name) ?? { attempts: 0, timer: null };
  joinRetries.set(name, state);
  // Gave up for this connection: the room stays "pending" and the next reconnect tries again.
  if (state.timer || state.attempts >= maxJoinAttempts) return;
  const delay = joinRetryDelay(state.attempts);
  state.attempts += 1;
  state.timer = setTimeout(() => {
    state.timer = null;
    if (roomRefs.has(name)) queueJoin(name);
  }, delay);
};

const emitJoin = (name: string) => {
  const entry = roomRefs.get(name);
  const instance = socket;
  if (!entry || !instance?.connected) {
    return;
  }
  instance
    .timeout(ackTimeoutMs)
    .emit("room:join", entry.ref, (error: Error | null, result?: RealtimeAck) => {
      // Released meanwhile, or a newer connection owns the joins now.
      if (!roomRefs.has(name) || socket !== instance) {
        return;
      }
      const outcome = classifyJoinAck(error, result);
      if (outcome === "retry") {
        scheduleJoinRetry(name);
        return;
      }
      clearJoinRetry(name);
      setRoomStatus(name, outcome);
    });
};

/** At most `joinBatch` joins per `joinIntervalMs` window; the window timer drains the rest. */
const pumpJoins = () => {
  if (!socket?.connected) {
    joinQueue.length = 0;
    return;
  }
  while (joinQueue.length > 0 && joinWindowSent < joinBatch) {
    const name = joinQueue.shift();
    if (name === undefined) break;
    joinWindowSent += 1;
    emitJoin(name);
  }
  if (!joinTimer && joinWindowSent > 0) {
    joinTimer = setTimeout(() => {
      joinTimer = null;
      joinWindowSent = 0;
      if (joinQueue.length > 0) pumpJoins();
    }, joinIntervalMs);
  }
};

/** Marks the room pending and joins it (paced). Offline: the next "connect" queues every held room. */
const queueJoin = (name: string) => {
  setRoomStatus(name, "pending");
  if (!socket?.connected) {
    return;
  }
  if (!joinQueue.includes(name)) {
    joinQueue.push(name);
  }
  pumpJoins();
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

let socketRefreshInflight: Promise<void> | null = null;

/** Hop to a new connection on purpose (the handshake reads the refreshed cookie). */
const plannedReconnectNow = (instance: AppSocket) => {
  if (socket !== instance) return;
  plannedReconnect = true;
  instance.disconnect();
  instance.connect();
};

/**
 * Hands the refreshed session to the open socket in place (`session:refresh` with a ticket, PERF-02):
 * rooms, presence and the event stream survive token rotation. Falls back to a reconnect when the
 * gateway refuses or the ticket cannot be issued. Call after every successful session refresh.
 */
export const refreshSocketSession = (): Promise<void> => {
  const instance = socket;
  const issue = options?.issueSocketTicket;
  if (!instance?.connected || !issue) return Promise.resolve();
  socketRefreshInflight ??= (async () => {
    try {
      const { ticket } = await issue();
      // The timeout() overload loses the ack type; the gateway answers with a SessionRefreshAck.
      const result = (await instance
        .timeout(ackTimeoutMs)
        .emitWithAck("session:refresh", { ticket })) as SessionRefreshAck;
      // Revoked: the gateway disconnects the socket itself and the reauthenticate path takes over.
      if (result.ok || result.code === "SESSION_REVOKED") return;
      plannedReconnectNow(instance);
    } catch {
      if (instance.connected) plannedReconnectNow(instance);
    }
  })().finally(() => {
    socketRefreshInflight = null;
  });
  return socketRefreshInflight;
};

/**
 * The gateway warns ~60 s before the access token expires: refresh the session now. A successful
 * refresh hands the new token to the socket through the refresh listener (refreshSocketSession);
 * without ticket support the socket reconnects instead.
 */
const refreshBeforeExpiry = async () => {
  if (!options?.issueSocketTicket) {
    await reauthenticate();
    return;
  }
  const ok = (await options.refreshSession()) ?? false;
  if (!ok && socket) {
    setStatus("offline");
    options.onSessionLost();
  }
};

/**
 * Refresh cookies, then reconnect so the gateway re-authenticates the handshake with the new token.
 * The gap is a few hundred milliseconds, so the reconnect only refetches the live surfaces.
 */
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
  // A planned, sub-second hop: focus refetches are not re-armed for it (the "live" reconnect plan
  // still refreshes chat and the inbox).
  plannedReconnect = true;
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

const handleAccessRevoked = (event: ServerEventPayload<"access:revoked">) => {
  const name = roomName(event.room);
  // The server already removed us from the room; forget it so reconnects do not re-join.
  roomRefs.delete(name);
  clearJoinRetry(name);
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
    markRealtimeUp();
    startHeartbeat();
    resetJoins();
    for (const name of roomRefs.keys()) {
      queueJoin(name);
    }
    if (hasConnectedBefore && options) {
      const gapMs = disconnectedAt === null ? 0 : Date.now() - disconnectedAt;
      applyReconnectPlan(options.queryClient, reconnectPlan(gapMs, instance.recovered));
    }
    disconnectedAt = null;
    hasConnectedBefore = true;
  });

  instance.on("disconnect", (reason) => {
    stopHeartbeat();
    resetJoins();
    disconnectedAt ??= Date.now();
    if (!plannedReconnect) markRealtimeDown();
    plannedReconnect = false;
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
    void refreshBeforeExpiry();
  });

  instance.on("project:structure", handleProjectStructure);
  // task:changed is applied per task by <TaskRuntime/> (features/tasks/realtime.tsx).
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
  resetJoins();
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
  disconnectedAt = null;
  plannedReconnect = false;
  manualAttempts = 0;
  roomRefs.clear();
  resetRealtimeGap();
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
    queueJoin(name);
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
      clearJoinRetry(name);
      const queued = joinQueue.indexOf(name);
      if (queued !== -1) joinQueue.splice(queued, 1);
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
