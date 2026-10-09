import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RealtimeAck } from "@/contracts/realtime";
import { shouldRefetchOnFocus } from "@/lib/query-client";

import { isRealtimeLive, markRealtimeDown, markRealtimeUp, realtimeMissedSince, resetRealtimeGap } from "./gap";

type Handler = (...args: unknown[]) => void;
type JoinCall = { room: { type: string; id: string }; ack: (error: Error | null, result?: RealtimeAck) => void };

/** Minimal stand-in for a socket.io client socket: records joins, lets the test fire lifecycle events. */
class FakeSocket {
  connected = false;
  active = true;
  recovered = false;
  handlers = new Map<string, Handler[]>();
  joins: JoinCall[] = [];
  emitted: string[] = [];
  refreshes: unknown[] = [];
  refreshAck: { ok: true; expiresAt: number } | { ok: false; code: string } = { ok: true, expiresAt: 1 };
  reconnects = 0;
  io = { on: () => undefined };
  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  onAny() {
    return this;
  }
  fire(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
  connect() {
    this.reconnects += 1;
    return this;
  }
  disconnect() {
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  emit(event: string) {
    this.emitted.push(event);
    return this;
  }
  timeout() {
    return {
      emit: (event: string, room: JoinCall["room"], ack: JoinCall["ack"]) => {
        if (event === "room:join") this.joins.push({ room, ack });
      },
      emitWithAck: (event: string, input: unknown) => {
        if (event === "session:refresh") this.refreshes.push(input);
        return Promise.resolve(this.refreshAck);
      }
    };
  }
}

let fake: FakeSocket;
vi.mock("socket.io-client", () => ({ io: () => fake }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const load = async () => {
  vi.resetModules();
  return import("./socket");
};

const connectFake = async (client = new QueryClient(), extra: { issueSocketTicket?: () => Promise<{ ticket: string }>; refreshSession?: () => Promise<boolean> } = {}) => {
  const socket = await load();
  socket.connectRealtime({
    queryClient: client,
    refreshSession: extra.refreshSession ?? (() => Promise.resolve(true)),
    onSessionLost: () => undefined,
    issueSocketTicket: extra.issueSocketTicket
  });
  fake.connected = true;
  fake.fire("connect");
  return { socket, client };
};

describe("realtime gap tracker", () => {
  beforeEach(() => resetRealtimeGap());

  it("reports missed events while down and for data fetched before the last drop", () => {
    expect(isRealtimeLive()).toBe(false);
    expect(realtimeMissedSince(1_000)).toBe(true);
    markRealtimeUp();
    expect(realtimeMissedSince(1_000)).toBe(false);
    markRealtimeDown(5_000);
    markRealtimeUp();
    expect(realtimeMissedSince(4_000)).toBe(true);
    expect(realtimeMissedSince(6_000)).toBe(false);
  });

  it("refetches on focus only when realtime missed something or the data is old", () => {
    const now = 10 * 60_000;
    markRealtimeUp();
    expect(shouldRefetchOnFocus(now - 60_000, now)).toBe(false);
    expect(shouldRefetchOnFocus(now - 6 * 60_000, now)).toBe(true);
    expect(shouldRefetchOnFocus(0, now)).toBe(true);
    markRealtimeDown(now - 30_000);
    markRealtimeUp();
    expect(shouldRefetchOnFocus(now - 60_000, now)).toBe(true);
    expect(shouldRefetchOnFocus(now - 10_000, now)).toBe(false);
  });
});

describe("reconnect policy", () => {
  it("refetches everything only after a long gap", async () => {
    const { reconnectPlan, reconnectRefetchAfterMs } = await load();
    expect(reconnectPlan(500, false)).toBe("live");
    expect(reconnectPlan(reconnectRefetchAfterMs + 1, false)).toBe("all");
    expect(reconnectPlan(reconnectRefetchAfterMs + 1, true)).toBe("none");
  });

  it("limits short-blip refetches to chat and the inbox", async () => {
    const { isLiveSurfaceKey } = await load();
    expect(isLiveSurfaceKey(["chat", "channels"])).toBe(true);
    expect(isLiveSurfaceKey(["chat", "channel", "x", "messages", "root"])).toBe(true);
    expect(isLiveSurfaceKey(["notifications", "feed", "all"])).toBe(true);
    expect(isLiveSurfaceKey(["chat", "attachment-url", "x"])).toBe(false);
    expect(isLiveSurfaceKey(["project", "p", "tasks", {}])).toBe(false);
  });

  it("retries transient join failures and keeps real denials", async () => {
    const { classifyJoinAck, joinRetryDelay } = await load();
    expect(classifyJoinAck(null, { ok: true })).toBe("joined");
    expect(classifyJoinAck(null, { ok: false, code: "RATE_LIMITED" })).toBe("retry");
    expect(classifyJoinAck(null, { ok: false, code: "UNAVAILABLE" })).toBe("retry");
    expect(classifyJoinAck(new Error("timeout"), undefined)).toBe("retry");
    expect(classifyJoinAck(null, { ok: false, code: "NOT_FOUND" })).toBe("denied");
    expect(joinRetryDelay(0, 0.5)).toBe(1000);
    expect(joinRetryDelay(10, 0.5)).toBe(30_000);
  });
});

describe("room joins", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake = new FakeSocket();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("paces joins in batches and retries rate-limited rooms of every type", async () => {
    const { socket } = await connectFake();
    const releases = Array.from({ length: 12 }, (_, index) =>
      socket.retainRoom({ type: index % 2 ? "project" : "task", id: uuid(index) })
    );
    // First batch immediately, the rest after the pacing interval.
    expect(fake.joins).toHaveLength(8);
    vi.advanceTimersByTime(600);
    expect(fake.joins).toHaveLength(12);

    const limited = fake.joins[0];
    limited?.ack(null, { ok: false, code: "RATE_LIMITED" });
    expect(socket.useRealtimeStore.getState().rooms[`task:${uuid(0)}`]).toBe("pending");
    vi.advanceTimersByTime(1_300);
    expect(fake.joins).toHaveLength(13);
    expect(fake.joins[12]?.room).toEqual({ type: "task", id: uuid(0) });
    fake.joins[12]?.ack(null, { ok: true });
    expect(socket.useRealtimeStore.getState().rooms[`task:${uuid(0)}`]).toBe("joined");

    fake.joins[1]?.ack(null, { ok: false, code: "NOT_FOUND" });
    expect(socket.useRealtimeStore.getState().rooms[`project:${uuid(1)}`]).toBe("denied");
    releases.forEach((release) => release());
    socket.disconnectRealtime();
  });

  it("refetches only live surfaces after a short blip and everything after a long one", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { socket } = await connectFake(client);
    fake.connected = false;
    fake.fire("disconnect", "transport close");
    vi.advanceTimersByTime(5_000);
    fake.connected = true;
    fake.fire("connect");
    expect(spy).toHaveBeenCalledWith({ refetchType: "none" });
    expect(spy).not.toHaveBeenCalledWith();

    spy.mockClear();
    fake.connected = false;
    fake.fire("disconnect", "transport close");
    vi.advanceTimersByTime(45_000);
    fake.connected = true;
    fake.fire("connect");
    expect(spy).toHaveBeenCalledWith();
    socket.disconnectRealtime();
  });
});

describe("in-place session refresh (PERF-02)", () => {
  beforeEach(() => {
    fake = new FakeSocket();
  });

  it("hands a refreshed session to the open socket without reconnecting", async () => {
    const issueSocketTicket = vi.fn(() => Promise.resolve({ ticket: "t".repeat(20) }));
    const refreshSession = vi.fn(() => Promise.resolve(true));
    const { socket } = await connectFake(new QueryClient(), { issueSocketTicket, refreshSession });
    const connects = fake.reconnects;
    // The gateway warns before expiry: the session is refreshed (the app then calls refreshSocketSession).
    fake.fire("session:expiring", { expiresAt: 1 });
    await vi.waitFor(() => expect(refreshSession).toHaveBeenCalled());
    await socket.refreshSocketSession();
    expect(fake.refreshes).toEqual([{ ticket: "t".repeat(20) }]);
    expect(fake.reconnects).toBe(connects);
    socket.disconnectRealtime();
  });

  it("falls back to a reconnect when the gateway refuses the ticket", async () => {
    const { socket } = await connectFake(new QueryClient(), { issueSocketTicket: () => Promise.resolve({ ticket: "t".repeat(20) }) });
    fake.refreshAck = { ok: false, code: "SESSION_MISMATCH" };
    const connects = fake.reconnects;
    await socket.refreshSocketSession();
    expect(fake.reconnects).toBe(connects + 1);
    socket.disconnectRealtime();
  });
});
