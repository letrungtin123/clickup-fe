import { describe, expect, it } from "vitest";

import type { LeaveRequest } from "@/contracts/production-leave";

import {
  bucketLeaveByDay,
  daysBetween,
  draftDays,
  formatLeaveDates,
  formatLeaveDays,
  formatLeaveSpan,
  leaveLoad,
  leaveWorkdays,
  monthBounds,
  monthGrid,
  shiftDay,
  shiftMonth,
  validateLeaveDraft,
  weekdayIndex
} from "./calendar";

let sequence = 0;
const request = (overrides: Partial<LeaveRequest> & { name?: string }): LeaveRequest => {
  sequence += 1;
  const { name = "NV01", ...rest } = overrides;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    user: { id: `user-${name}`, displayName: name, email: null, avatarUrl: null },
    team: null,
    fromDate: "2026-10-12",
    toDate: "2026-10-12",
    part: "FULL_DAY",
    days: 1,
    note: null,
    status: "APPROVED",
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    cancelledAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    canCancel: false,
    canDecide: false,
    ...rest
  };
};

describe("day arithmetic", () => {
  it("shifts days across months and years", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29");
    expect(daysBetween("2026-10-12", "2026-10-14")).toBe(3);
    expect(daysBetween("2026-10-14", "2026-10-12")).toBe(0);
  });

  it("starts weeks on Monday", () => {
    expect(weekdayIndex("2026-10-12")).toBe(0); // Monday
    expect(weekdayIndex("2026-10-18")).toBe(6); // Sunday
  });

  it("moves months and finds their bounds", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthBounds("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthBounds("2024-02")).toEqual({ first: "2024-02-01", last: "2024-02-29" });
  });
});

describe("monthGrid", () => {
  it("covers whole Monday-first weeks around the month", () => {
    const grid = monthGrid("2026-10"); // 1 Oct 2026 is a Thursday, 31 Oct a Saturday
    expect(grid.from).toBe("2026-09-28");
    expect(grid.to).toBe("2026-11-01");
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.weeks[0]?.[0]).toEqual({ day: "2026-09-28", inMonth: false });
    expect(grid.weeks[0]?.[3]).toEqual({ day: "2026-10-01", inMonth: true });
  });

  it("fits inside one calendar query", () => {
    for (const month of ["2026-02", "2026-03", "2026-05", "2026-08", "2027-01"]) {
      const grid = monthGrid(month);
      expect(daysBetween(grid.from, grid.to)).toBeLessThanOrEqual(42);
      expect(grid.weeks.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("bucketLeaveByDay", () => {
  it("spreads full-day requests over every covered day", () => {
    const multi = request({ fromDate: "2026-10-12", toDate: "2026-10-14", days: 3 });
    const byDay = bucketLeaveByDay([multi], "2026-09-28", "2026-11-01");
    expect([...byDay.keys()]).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(byDay.get("2026-10-13")?.[0]?.amount).toBe(1);
  });

  it("marks half days with 0.5 on their single day", () => {
    const morning = request({ part: "MORNING", days: 0.5, name: "NV02" });
    const afternoon = request({ part: "AFTERNOON", days: 0.5, name: "NV03" });
    const full = request({ name: "NV04" });
    const byDay = bucketLeaveByDay([morning, afternoon, full], "2026-10-01", "2026-10-31");
    const entries = byDay.get("2026-10-12") ?? [];
    expect(
      entries.map((entry) => [entry.request.user.displayName, entry.part, entry.amount])
    ).toEqual([
      ["NV02", "MORNING", 0.5],
      ["NV03", "AFTERNOON", 0.5],
      ["NV04", "FULL_DAY", 1]
    ]);
    expect(leaveLoad(entries)).toBe(2);
    // A malformed half day spanning several days still only counts its first day.
    const broken = request({ part: "MORNING", toDate: "2026-10-13" });
    expect([...bucketLeaveByDay([broken], "2026-10-01", "2026-10-31").keys()]).toEqual([
      "2026-10-12"
    ]);
  });

  it("clips requests to the visible window at month edges", () => {
    const crossing = request({ fromDate: "2026-09-29", toDate: "2026-10-02", days: 4 });
    const byDay = bucketLeaveByDay([crossing], "2026-10-01", "2026-10-31");
    expect([...byDay.keys()]).toEqual(["2026-10-01", "2026-10-02"]);
    const yearEnd = request({ fromDate: "2026-12-30", toDate: "2027-01-02", days: 4 });
    expect([...bucketLeaveByDay([yearEnd], "2026-12-28", "2026-12-31").keys()]).toEqual([
      "2026-12-30",
      "2026-12-31"
    ]);
    const outside = request({ fromDate: "2026-09-29", toDate: "2026-09-30", part: "FULL_DAY" });
    expect(bucketLeaveByDay([outside], "2026-10-01", "2026-10-31").size).toBe(0);
    const halfBefore = request({ fromDate: "2026-09-30", toDate: "2026-09-30", part: "MORNING" });
    expect(bucketLeaveByDay([halfBefore], "2026-10-01", "2026-10-31").size).toBe(0);
  });

  it("shows approved before pending and hides rejected or cancelled requests", () => {
    const pending = request({ status: "PENDING", name: "AN" });
    const approved = request({ status: "APPROVED", name: "BINH" });
    const rejected = request({ status: "REJECTED", name: "CUONG" });
    const cancelled = request({ status: "CANCELLED", name: "DUNG" });
    const entries =
      bucketLeaveByDay([pending, approved, rejected, cancelled], "2026-10-01", "2026-10-31").get(
        "2026-10-12"
      ) ?? [];
    expect(entries.map((entry) => entry.request.user.displayName)).toEqual(["BINH", "AN"]);
  });
});

describe("request form", () => {
  const today = "2026-10-09";

  it("counts draft days, half days as 0.5", () => {
    expect(draftDays({ fromDate: "2026-10-12", toDate: "2026-10-14", part: "FULL_DAY" })).toBe(3);
    expect(draftDays({ fromDate: "2026-10-12", toDate: "2026-10-12", part: "MORNING" })).toBe(0.5);
    expect(draftDays({ fromDate: "2026-10-14", toDate: "2026-10-12", part: "FULL_DAY" })).toBe(0);
  });

  it("mirrors the server limits", () => {
    const ok = { fromDate: "2026-10-12", toDate: "2026-10-12", part: "MORNING" as const, note: "" };
    expect(validateLeaveDraft(ok, today)).toBeNull();
    expect(validateLeaveDraft({ ...ok, toDate: "2026-10-13" }, today)).toMatch(/nửa ngày/);
    expect(validateLeaveDraft({ ...ok, toDate: "2026-10-11" }, today)).toMatch(/Ngày kết thúc/);
    expect(validateLeaveDraft({ ...ok, part: "FULL_DAY", toDate: "2026-11-12" }, today)).toMatch(
      /tối đa 31 ngày/
    );
    expect(
      validateLeaveDraft({ ...ok, fromDate: "2026-09-08", toDate: "2026-09-08" }, today)
    ).toMatch(/đã qua/);
    // PD-051: never in the past — yesterday is refused, today is fine.
    expect(
      validateLeaveDraft(
        { ...ok, part: "FULL_DAY", fromDate: shiftDay(today, -1), toDate: today },
        today
      )
    ).toMatch(/đã qua/);
    expect(validateLeaveDraft({ ...ok, fromDate: today, toDate: today }, today)).toBeNull();
    expect(
      validateLeaveDraft({ ...ok, fromDate: "2027-10-11", toDate: "2027-10-11" }, today)
    ).toMatch(/trước tối đa/);
  });
});

describe("labels", () => {
  it("formats date ranges compactly", () => {
    expect(formatLeaveDates("2026-10-12", "2026-10-12")).toBe("12/10/2026");
    expect(formatLeaveDates("2026-10-12", "2026-10-14")).toBe("12/10 – 14/10/2026");
    expect(formatLeaveDates("2026-12-28", "2027-01-02")).toBe("28/12/2026 – 02/01/2027");
    expect(formatLeaveDays(0.5)).toBe("0,5 ngày");
    expect(formatLeaveDays(3)).toBe("3 ngày");
  });
});

describe("working days used by KPI (BUG-PR-26)", () => {
  // 2026-10-11 is a Sunday.
  it("counts Monday–Saturday only; a half day is 0.5 on a working day", () => {
    expect(leaveWorkdays({ fromDate: "2026-10-11", toDate: "2026-10-11", part: "FULL_DAY" })).toBe(
      0
    );
    expect(leaveWorkdays({ fromDate: "2026-10-10", toDate: "2026-10-12", part: "FULL_DAY" })).toBe(
      2
    );
    expect(leaveWorkdays({ fromDate: "2026-10-05", toDate: "2026-10-11", part: "FULL_DAY" })).toBe(
      6
    );
    expect(leaveWorkdays({ fromDate: "2026-10-12", toDate: "2026-10-12", part: "MORNING" })).toBe(
      0.5
    );
    expect(leaveWorkdays({ fromDate: "2026-10-11", toDate: "2026-10-11", part: "AFTERNOON" })).toBe(
      0
    );
    expect(leaveWorkdays({ fromDate: "2026-10-12", toDate: "2026-10-10", part: "FULL_DAY" })).toBe(
      0
    );
  });

  it("names the working days only when they differ from the calendar days", () => {
    expect(
      formatLeaveSpan({ fromDate: "2026-10-11", toDate: "2026-10-11", part: "FULL_DAY" }, 1)
    ).toBe("1 ngày · 0 ngày làm việc");
    expect(
      formatLeaveSpan({ fromDate: "2026-10-10", toDate: "2026-10-12", part: "FULL_DAY" }, 3)
    ).toBe("3 ngày · 2 ngày làm việc");
    expect(
      formatLeaveSpan({ fromDate: "2026-10-12", toDate: "2026-10-13", part: "FULL_DAY" }, 2)
    ).toBe("2 ngày");
    expect(
      formatLeaveSpan({ fromDate: "2026-10-12", toDate: "2026-10-12", part: "MORNING" }, 0.5)
    ).toBe("0,5 ngày");
  });
});
