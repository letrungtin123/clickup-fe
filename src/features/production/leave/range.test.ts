import { describe, expect, it } from "vitest";

import { leaveLimits, type LeaveRequest } from "@/contracts/production-leave";

import { shiftDay } from "./calendar";
import {
  isCalendarDay,
  leaveFilterWindow,
  leaveModePatch,
  leaveRangeRows,
  leaveRangeSummary,
  leaveRangeSummaryText,
  parseLeaveTimeFilter,
  validateLeaveRange
} from "./range";

// PD-057 — the Lịch nghỉ time filter. Obviously fake people (the repository is public).
const today = "2026-10-16";
const params = (search: string) => new URLSearchParams(search);

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

describe("URL parameters", () => {
  it("defaults to the current month, keeps a valid ?month", () => {
    expect(parseLeaveTimeFilter(params(""), today)).toEqual({ mode: "month", month: "2026-10" });
    expect(parseLeaveTimeFilter(params("?month=2026-02"), today)).toEqual({
      mode: "month",
      month: "2026-02"
    });
    expect(parseLeaveTimeFilter(params("?month=2026-13"), today)).toEqual({
      mode: "month",
      month: "2026-10"
    });
  });

  it("any from/to selects the range mode; malformed days read as missing", () => {
    expect(parseLeaveTimeFilter(params("?from=2026-10-01&to=2026-12-31"), today)).toEqual({
      mode: "range",
      from: "2026-10-01",
      to: "2026-12-31"
    });
    // The range wins over a stale month parameter.
    expect(
      parseLeaveTimeFilter(params("?month=2026-02&from=2026-10-01&to=2026-10-31"), today).mode
    ).toBe("range");
    expect(parseLeaveTimeFilter(params("?from=2026-02-30&to=abc"), today)).toEqual({
      mode: "range",
      from: null,
      to: null
    });
    expect(parseLeaveTimeFilter(params("?to=2026-10-31"), today)).toEqual({
      mode: "range",
      from: null,
      to: "2026-10-31"
    });
  });

  it("recognises real calendar days only", () => {
    expect(isCalendarDay("2024-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-29")).toBe(false);
    expect(isCalendarDay("2026-1-01")).toBe(false);
    expect(isCalendarDay("2026-10-01T00:00")).toBe(false);
    expect(isCalendarDay(null)).toBe(false);
  });
});

describe("range validation", () => {
  it("needs both days, from ≤ to and at most maxCalendarDays days", () => {
    expect(leaveLimits.maxCalendarDays).toBe(366);
    expect(validateLeaveRange(null, "2026-10-31")).toBe("Chọn đủ Từ ngày và Đến ngày.");
    expect(validateLeaveRange("2026-10-31", "2026-10-01")).toBe(
      "Đến ngày phải sau hoặc trùng Từ ngày."
    );
    expect(validateLeaveRange("2026-10-16", "2026-10-16")).toBeNull();
    // 366 days inclusive is fine, 367 is not.
    expect(validateLeaveRange("2026-01-01", shiftDay("2026-01-01", 365))).toBeNull();
    expect(validateLeaveRange("2026-01-01", shiftDay("2026-01-01", 366))).toBe(
      "Khoảng ngày tối đa 366 ngày — hãy thu hẹp lại."
    );
  });

  it("gives the window of the filter: the whole month, or the valid range", () => {
    expect(leaveFilterWindow({ mode: "month", month: "2026-02" })).toEqual({
      from: "2026-02-01",
      to: "2026-02-28"
    });
    expect(leaveFilterWindow({ mode: "month", month: "2024-12" })).toEqual({
      from: "2024-12-01",
      to: "2024-12-31"
    });
    expect(leaveFilterWindow({ mode: "range", from: "2026-10-05", to: "2026-11-20" })).toEqual({
      from: "2026-10-05",
      to: "2026-11-20"
    });
    expect(leaveFilterWindow({ mode: "range", from: "2026-11-20", to: "2026-10-05" })).toBeNull();
    expect(leaveFilterWindow({ mode: "range", from: null, to: "2026-10-05" })).toBeNull();
  });

  it("switches modes keeping the same days in view", () => {
    expect(leaveModePatch({ mode: "month", month: "2026-09" }, "range", today)).toEqual({
      month: null,
      from: "2026-09-01",
      to: "2026-09-30"
    });
    expect(
      leaveModePatch({ mode: "range", from: "2026-08-10", to: "2026-09-10" }, "month", today)
    ).toEqual({ from: null, to: null, month: "2026-08" });
    // Back to the current month: no ?month parameter.
    expect(
      leaveModePatch({ mode: "range", from: "2026-10-02", to: "2026-10-09" }, "month", today)
    ).toEqual({ from: null, to: null, month: null });
    expect(leaveModePatch({ mode: "range", from: null, to: null }, "month", today)).toEqual({
      from: null,
      to: null,
      month: null
    });
    expect(leaveModePatch({ mode: "month", month: "2026-10" }, "month", today)).toEqual({});
  });
});

describe("Khoảng ngày list", () => {
  const span = { from: "2026-10-10", to: "2026-10-20" };

  it("keeps approved and pending requests overlapping the range, earliest first", () => {
    const before = request({ fromDate: "2026-10-01", toDate: "2026-10-09", name: "AN" });
    const crossing = request({ fromDate: "2026-10-08", toDate: "2026-10-11", name: "BINH" });
    const inside = request({ fromDate: "2026-10-15", toDate: "2026-10-15", name: "CUONG" });
    const pending = request({ fromDate: "2026-10-15", status: "PENDING", name: "AN" });
    const rejected = request({ fromDate: "2026-10-15", status: "REJECTED", name: "DUNG" });
    const cancelled = request({ fromDate: "2026-10-16", status: "CANCELLED", name: "GIANG" });
    const after = request({ fromDate: "2026-10-21", toDate: "2026-10-22", name: "HA" });
    // A half day only covers its first day, even if malformed.
    const halfBefore = request({
      fromDate: "2026-10-09",
      toDate: "2026-10-10",
      part: "MORNING",
      name: "KHOA"
    });
    const rows = leaveRangeRows(
      [after, rejected, inside, pending, crossing, before, cancelled, halfBefore],
      span
    );
    expect(rows.map((row) => row.user.displayName)).toEqual(["BINH", "AN", "CUONG"]);
    expect(rows[1]?.status).toBe("PENDING");
  });

  it("sums approved leave inside the range only, half days as 0.5", () => {
    const rows = [
      request({ fromDate: "2026-10-08", toDate: "2026-10-11", days: 4, name: "BINH" }),
      request({ fromDate: "2026-10-15", part: "AFTERNOON", days: 0.5, name: "CUONG" }),
      request({ fromDate: "2026-10-15", status: "PENDING", name: "BINH" })
    ];
    expect(leaveRangeSummary(rows, span)).toEqual({
      requests: 3,
      people: 2,
      approvedDays: 2.5,
      pending: 1
    });
    expect(leaveRangeSummaryText(rows, span)).toBe(
      "3 đơn · 2 người · 2,5 ngày nghỉ đã duyệt · 1 đơn chờ duyệt"
    );
    expect(leaveRangeSummaryText(rows.slice(0, 1), span)).toBe(
      "1 đơn · 1 người · 2 ngày nghỉ đã duyệt"
    );
  });
});
