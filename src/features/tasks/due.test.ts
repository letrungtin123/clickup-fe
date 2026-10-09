import { describe, expect, it } from "vitest";

import { dayToIso, datesValid, dueBucket, dueTone, formatShortDate, growableBuckets } from "./due";

// Friday 9 Oct 2026, 15:30 local time (week = Mon 5 – Sun 11).
const now = new Date(2026, 9, 9, 15, 30);
const at = (day: number, hour = 23, minute = 59) => new Date(2026, 9, day, hour, minute).toISOString();
const active = { category: "active" as const };
const done = { category: "done" as const };

describe("dueTone", () => {
  it("classifies deadlines", () => {
    expect(dueTone({ dueAt: null, completedAt: null, status: active }, now)).toBe("none");
    expect(dueTone({ dueAt: at(8), completedAt: null, status: active }, now)).toBe("overdue");
    expect(dueTone({ dueAt: at(9, 10, 0), completedAt: null, status: active }, now)).toBe("overdue");
    expect(dueTone({ dueAt: at(9), completedAt: null, status: active }, now)).toBe("today");
    expect(dueTone({ dueAt: at(10), completedAt: null, status: active }, now)).toBe("soon");
    expect(dueTone({ dueAt: at(20), completedAt: null, status: active }, now)).toBe("upcoming");
  });

  it("mutes finished work even when the deadline passed", () => {
    expect(dueTone({ dueAt: at(1), completedAt: at(2), status: done }, now)).toBe("done");
  });
});

describe("dueBucket (My tasks)", () => {
  const task = (dueAt: string | null, status: { category: "active" | "done" } = active) => ({ dueAt, completedAt: null, status });

  it("buckets by local deadline", () => {
    expect(dueBucket(task(at(7)), now)).toBe("overdue");
    expect(dueBucket(task(at(9)), now)).toBe("today");
    expect(dueBucket(task(at(11)), now)).toBe("week");
    expect(dueBucket(task(at(11, 10)), now)).toBe("week");
    expect(dueBucket(task(at(12, 0, 0)), now)).toBe("later");
    expect(dueBucket(task(null), now)).toBe("none");
  });

  it("keeps done work separate", () => {
    expect(dueBucket(task(at(7), done), now)).toBe("done");
  });
});

describe("date helpers", () => {
  it("formats relative short dates", () => {
    expect(formatShortDate(at(9), now)).toBe("Hôm nay");
    expect(formatShortDate(at(10), now)).toBe("Ngày mai");
    expect(formatShortDate(at(8), now)).toBe("Hôm qua");
    expect(formatShortDate(at(25), now)).toBe("25 thg 10");
    expect(formatShortDate(new Date(2025, 0, 3).toISOString(), now)).toBe("3 thg 1, 2025");
  });

  it("stores picked days as whole-day boundaries", () => {
    const day = new Date(2026, 9, 20, 9, 15);
    expect(new Date(dayToIso(day, "due")).getHours()).toBe(23);
    expect(new Date(dayToIso(day, "start")).getHours()).toBe(0);
  });

  it("validates due ≥ start", () => {
    expect(datesValid(at(5, 0, 0), at(6))).toBe(true);
    expect(datesValid(at(6, 0, 0), at(5))).toBe(false);
    expect(datesValid(null, at(5))).toBe(true);
  });
});

describe("growableBuckets (WK-58)", () => {
  const task = (dueAt: string | null) => ({ dueAt, completedAt: null, status: active });

  it("marks the last loaded deadline's bucket and every later one", () => {
    const grow = growableBuckets([task(at(7)), task(at(11))], true, false, now);
    expect([...grow].sort()).toEqual(["later", "none", "week"]);
    expect(grow.has("overdue")).toBe(false);
  });

  it("only undated (and done) work can follow an undated last item", () => {
    expect([...growableBuckets([task(at(7)), task(null)], true, true, now)].sort()).toEqual(["done", "none"]);
  });

  it("marks nothing when every page is loaded", () => {
    expect(growableBuckets([task(at(7))], false, true, now).size).toBe(0);
  });
});
