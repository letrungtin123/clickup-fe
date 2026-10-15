// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deliverOnce } from "./deliver";
import { CLAIM_TTL_MS, claimKey } from "./election";

let shown: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  shown = [];
  vi.stubGlobal(
    "Notification",
    class {
      static permission: NotificationPermission = "granted";
      onclick: unknown = null;
      constructor(_title: string, options: NotificationOptions = {}) {
        shown.push(options.tag ?? "");
      }
      close() {}
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const run = async (tag: string, recheck?: () => boolean) => {
  const pending = deliverOnce({ title: "An", body: "Chào", tag }, recheck);
  await vi.advanceTimersByTimeAsync(1000);
  await pending;
};

describe("delivering one pop-up", () => {
  it("shows once per tag, even when the event arrives twice", async () => {
    await run("chat:a");
    await run("chat:a");
    expect(shown).toEqual(["chat:a"]);
  });

  it("backs off when another tab already claimed the message", async () => {
    window.localStorage.setItem(claimKey("chat:b"), `other-tab|${Date.now() + CLAIM_TTL_MS}`);
    await run("chat:b");
    expect(shown).toEqual([]);
  });

  it("drops it when the person opened the conversation meanwhile", async () => {
    await run("chat:c", () => false);
    expect(shown).toEqual([]);
  });
});
