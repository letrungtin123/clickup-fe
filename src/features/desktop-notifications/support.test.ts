import { describe, expect, it } from "vitest";

import {
  PROMPT_SNOOZE_MS,
  defaultDesktopPrefs,
  isPromptSnoozed,
  parsePrefs,
  readPrefs,
  snoozePrompt,
  writePrefs
} from "./storage";
import { detectDesktopSupport, type SupportEnv } from "./support";

const desktopChrome: SupportEnv = {
  hasNotification: true,
  secure: true,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  maxTouchPoints: 0
};

describe("desktop notification support", () => {
  it("desktop browser over HTTPS is supported", () => {
    expect(detectDesktopSupport(desktopChrome)).toBe("supported");
    // A touch-screen Windows laptop is still a desktop.
    expect(detectDesktopSupport({ ...desktopChrome, maxTouchPoints: 10 })).toBe("supported");
  });

  it("phones and tablets are not (web pages get no OS pop-ups there)", () => {
    expect(
      detectDesktopSupport({
        ...desktopChrome,
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"
      })
    ).toBe("mobile");
    expect(
      detectDesktopSupport({
        ...desktopChrome,
        hasNotification: false,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
      })
    ).toBe("mobile");
    // iPadOS pretends to be a Mac.
    expect(
      detectDesktopSupport({
        ...desktopChrome,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
        maxTouchPoints: 5
      })
    ).toBe("mobile");
    expect(detectDesktopSupport({ ...desktopChrome, uaMobile: true })).toBe("mobile");
  });

  it("needs a secure context and the Notification API", () => {
    expect(detectDesktopSupport({ ...desktopChrome, secure: false })).toBe("insecure");
    expect(detectDesktopSupport({ ...desktopChrome, hasNotification: false })).toBe("unsupported");
  });
});

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

describe("per-device preferences", () => {
  it("defaults to everything on and repairs broken values field by field", () => {
    expect(parsePrefs(null)).toEqual(defaultDesktopPrefs);
    expect(parsePrefs("{oops")).toEqual(defaultDesktopPrefs);
    expect(parsePrefs(JSON.stringify({ chat: false, chatPreview: "no" }))).toEqual({
      chat: false,
      chatPreview: true,
      work: true
    });
  });

  it("writes a patch over the stored value", () => {
    const storage = new MemoryStorage();
    writePrefs({ chatPreview: false }, storage);
    writePrefs({ work: false }, storage);
    expect(readPrefs(storage)).toEqual({ chat: true, chatPreview: false, work: false });
  });

  it("works without storage", () => {
    expect(readPrefs(null)).toEqual(defaultDesktopPrefs);
    expect(() => writePrefs({ chat: false }, null)).not.toThrow();
  });

  it("'Để sau' hides the prompt for 7 days", () => {
    const storage = new MemoryStorage();
    const now = 1_800_000_000_000;
    expect(isPromptSnoozed(now, storage)).toBe(false);
    snoozePrompt(now, storage);
    expect(isPromptSnoozed(now + PROMPT_SNOOZE_MS - 1, storage)).toBe(true);
    expect(isPromptSnoozed(now + PROMPT_SNOOZE_MS + 1, storage)).toBe(false);
  });
});
