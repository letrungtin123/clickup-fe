// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { announceSession, sessionSignalAction, sessionStorageKey, subscribeSession, type SessionSignal } from "./session-sync";

describe("sessionSignalAction (BUG-WK-16)", () => {
  it("reloads when another tab signs in as someone else", () => {
    expect(sessionSignalAction("user-a", { type: "signed-in", userId: "user-b" })).toBe("reload");
    expect(sessionSignalAction("user-a", { type: "signed-in", userId: "user-a" })).toBe("none");
  });

  it("signs out with the other tabs and moves /login on after a sign-in elsewhere", () => {
    expect(sessionSignalAction("user-a", { type: "signed-out" })).toBe("sign-out");
    expect(sessionSignalAction(null, { type: "signed-out" })).toBe("none");
    expect(sessionSignalAction(null, { type: "signed-in", userId: "user-b" })).toBe("refresh");
  });
});

describe("cross-tab transport", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("delivers storage-event signals from other tabs once and ignores this tab's own", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const received: SessionSignal[] = [];
    const unsubscribe = subscribeSession((signal) => received.push(signal));

    // This tab's own announcement never comes back to it.
    announceSession({ type: "signed-in", userId: "user-a" });
    const own = window.localStorage.getItem(sessionStorageKey);
    window.dispatchEvent(new StorageEvent("storage", { key: sessionStorageKey, newValue: own }));
    expect(received).toEqual([]);

    const other = JSON.stringify({ type: "signed-in", userId: "user-b", id: "e1", tab: "other-tab", at: 1 });
    window.dispatchEvent(new StorageEvent("storage", { key: sessionStorageKey, newValue: other }));
    window.dispatchEvent(new StorageEvent("storage", { key: sessionStorageKey, newValue: other }));
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: other }));
    window.dispatchEvent(new StorageEvent("storage", { key: sessionStorageKey, newValue: "{not json" }));
    expect(received).toEqual([{ type: "signed-in", userId: "user-b" }]);

    unsubscribe();
    window.dispatchEvent(
      new StorageEvent("storage", { key: sessionStorageKey, newValue: JSON.stringify({ type: "signed-out", id: "e2", tab: "other-tab", at: 2 }) })
    );
    expect(received).toHaveLength(1);
  });

  it("uses BroadcastChannel when available", () => {
    const channels: { listeners: ((event: MessageEvent) => void)[]; posted: unknown[] }[] = [];
    class FakeChannel {
      listeners: ((event: MessageEvent) => void)[] = [];
      posted: unknown[] = [];
      constructor() {
        channels.push(this);
      }
      addEventListener(_type: string, listener: (event: MessageEvent) => void) {
        this.listeners.push(listener);
      }
      removeEventListener() {}
      postMessage(message: unknown) {
        this.posted.push(message);
      }
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const received: SessionSignal[] = [];
    const unsubscribe = subscribeSession((signal) => received.push(signal));
    announceSession({ type: "signed-out" });
    expect(channels.some((channel) => channel.posted.length === 1)).toBe(true);

    const listener = channels[0]?.listeners[0];
    listener?.(new MessageEvent("message", { data: { type: "signed-out", id: "x", tab: "other-tab", at: 3 } }));
    expect(received).toEqual([{ type: "signed-out" }]);
    unsubscribe();
  });
});
