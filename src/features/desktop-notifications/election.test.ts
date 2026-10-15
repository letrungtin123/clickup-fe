import { describe, expect, it } from "vitest";

import {
  CLAIM_TTL_MS,
  FOCUS_MAX_AGE_MS,
  claimDelayMs,
  claimKey,
  focusedElsewherePath,
  forgetTab,
  holdsClaim,
  markBlurred,
  markFocused,
  parseFocusRecord,
  pruneClaims,
  readFocusRecord,
  tryClaim
} from "./election";

/** localStorage stand-in shared by the "tabs" of a test. */
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

const NOW = 1_800_000_000_000;

describe("tab election (one pop-up across tabs)", () => {
  it("the first tab claims a tag, the others back off while the claim lives", () => {
    const storage = new MemoryStorage();
    expect(tryClaim(storage, "chat:m1", "tab-a", NOW)).toBe(true);
    expect(tryClaim(storage, "chat:m1", "tab-b", NOW + 10)).toBe(false);
    expect(holdsClaim(storage, "chat:m1", "tab-a")).toBe(true);
    expect(holdsClaim(storage, "chat:m1", "tab-b")).toBe(false);
    // Another message is a separate claim.
    expect(tryClaim(storage, "chat:m2", "tab-b", NOW)).toBe(true);
    // An expired claim can be taken over.
    expect(tryClaim(storage, "chat:m1", "tab-b", NOW + CLAIM_TTL_MS + 1)).toBe(true);
  });

  it("simultaneous writers settle on the last one", () => {
    const storage = new MemoryStorage();
    // Both read "free" before either wrote (race): the later write wins the settle check.
    storage.setItem(claimKey("chat:m1"), `tab-a|${NOW + CLAIM_TTL_MS}`);
    storage.setItem(claimKey("chat:m1"), `tab-b|${NOW + CLAIM_TTL_MS}`);
    expect(holdsClaim(storage, "chat:m1", "tab-a")).toBe(false);
    expect(holdsClaim(storage, "chat:m1", "tab-b")).toBe(true);
  });

  it("without storage every tab shows (the OS tag collapses duplicates)", () => {
    expect(tryClaim(null, "chat:m1", "tab-a", NOW)).toBe(true);
    expect(holdsClaim(null, "chat:m1", "tab-a")).toBe(true);
  });

  it("survives a storage that throws", () => {
    const broken = new MemoryStorage();
    broken.getItem = () => {
      throw new Error("blocked");
    };
    broken.setItem = () => {
      throw new Error("blocked");
    };
    expect(() => tryClaim(broken, "chat:m1", "tab-a", NOW)).not.toThrow();
    expect(() => markFocused(broken, "tab-a", "/", NOW)).not.toThrow();
    expect(readFocusRecord(broken)).toBeNull();
  });

  it("prunes expired claims only", () => {
    const storage = new MemoryStorage();
    tryClaim(storage, "chat:old", "tab-a", NOW - CLAIM_TTL_MS - 5);
    tryClaim(storage, "chat:new", "tab-a", NOW);
    storage.setItem("unrelated", "keep");
    pruneClaims(storage, NOW);
    expect(storage.getItem(claimKey("chat:old"))).toBeNull();
    expect(storage.getItem(claimKey("chat:new"))).not.toBeNull();
    expect(storage.getItem("unrelated")).toBe("keep");
  });
});

describe("focus record", () => {
  it("tells other tabs where the focused tab is, while it is fresh", () => {
    const storage = new MemoryStorage();
    markFocused(storage, "tab-a", "/c/x", NOW);
    const record = readFocusRecord(storage);
    expect(focusedElsewherePath(record, "tab-b", NOW + 1000)).toBe("/c/x");
    // Never "elsewhere" for the tab itself.
    expect(focusedElsewherePath(record, "tab-a", NOW + 1000)).toBeNull();
    // A crashed / frozen tab stops counting.
    expect(focusedElsewherePath(record, "tab-b", NOW + FOCUS_MAX_AGE_MS + 1)).toBeNull();
  });

  it("blur keeps the tab as last focused but not in front; it never clears another tab's record", () => {
    const storage = new MemoryStorage();
    markFocused(storage, "tab-a", "/c/x", NOW);
    markFocused(storage, "tab-b", "/inbox", NOW + 5);
    // tab-a's late blur must not touch tab-b's record.
    markBlurred(storage, "tab-a", NOW + 6);
    expect(readFocusRecord(storage)).toMatchObject({ tab: "tab-b", focused: true });
    markBlurred(storage, "tab-b", NOW + 7);
    const record = readFocusRecord(storage);
    expect(record).toMatchObject({ tab: "tab-b", focused: false });
    expect(focusedElsewherePath(record, "tab-a", NOW + 8)).toBeNull();
    forgetTab(storage, "tab-a");
    expect(readFocusRecord(storage)).not.toBeNull();
    forgetTab(storage, "tab-b");
    expect(readFocusRecord(storage)).toBeNull();
  });

  it("the last focused tab claims first", () => {
    const record = parseFocusRecord(JSON.stringify({ tab: "tab-a", path: "/", focused: false, at: NOW }));
    expect(claimDelayMs(record, "tab-a")).toBe(0);
    expect(claimDelayMs(record, "tab-b", 0)).toBe(150);
    expect(claimDelayMs(record, "tab-b", 1)).toBe(300);
    expect(claimDelayMs(null, "tab-b", 0.5)).toBeGreaterThan(0);
  });

  it("rejects malformed records", () => {
    expect(parseFocusRecord("not json")).toBeNull();
    expect(parseFocusRecord(JSON.stringify({ tab: 1 }))).toBeNull();
    expect(parseFocusRecord(null)).toBeNull();
  });
});
