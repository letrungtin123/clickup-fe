import { describe, expect, it } from "vitest";

import { kpiPeriodOfDay, kpiPeriodRange } from "@/contracts/production-scores";

import {
  closeDaysOf,
  formatDayRange,
  formatPeriod,
  isPeriod,
  monthShortLabel,
  periodLabel,
  periodsBetween,
  quarterOfPeriod,
  rollupLabel,
  shiftPeriod,
  upcomingCloseDayChange
} from "./periods";

// The close day moved from 25 to 20 on 11/10/2026: it applies from period 11/2026 (G15).
const changed = [
  { fromPeriod: null, closeDay: 25 },
  { fromPeriod: "2026-11", closeDay: 20 }
] as const;

describe("closeDaysOf", () => {
  it("prefers the close-day versions of /production/me", () => {
    expect(closeDaysOf({ kpiCloseDay: 25, kpiCloseDays: [...changed] })).toEqual(changed);
    expect(closeDaysOf({ kpiCloseDay: 20, kpiCloseDays: [] })).toBe(20);
    expect(closeDaysOf(undefined)).toBe(25);
  });

  it("feeds the contract period maths (one day or versions)", () => {
    const days = closeDaysOf({ kpiCloseDay: 25, kpiCloseDays: [...changed] });
    expect(kpiPeriodOfDay("2026-10-11", days)).toBe("2026-10");
    expect(kpiPeriodOfDay("2026-10-26", days)).toBe("2026-11");
    expect(kpiPeriodOfDay("2026-11-21", days)).toBe("2026-12");
    expect(kpiPeriodRange("2026-10", days)).toEqual({ from: "2026-09-26", to: "2026-10-25" });
    expect(kpiPeriodRange("2026-11", days)).toEqual({ from: "2026-10-26", to: "2026-11-20" });
    expect(kpiPeriodRange("2026-12", days)).toEqual({ from: "2026-11-21", to: "2026-12-20" });
    expect(kpiPeriodRange("2027-01", closeDaysOf({ kpiCloseDay: 25 }))).toEqual({
      from: "2026-12-26",
      to: "2027-01-25"
    });
  });
});

describe("upcomingCloseDayChange", () => {
  it("names the first period of a scheduled change", () => {
    expect(upcomingCloseDayChange(changed, "2026-10")).toEqual({
      fromPeriod: "2026-11",
      closeDay: 20
    });
    expect(upcomingCloseDayChange(changed, "2026-11")).toBeNull();
    expect(upcomingCloseDayChange(25, "2026-10")).toBeNull();
    expect(upcomingCloseDayChange([{ fromPeriod: null, closeDay: 25 }], "2026-10")).toBeNull();
  });
});

describe("close day 31 “Cuối tháng” (PD-032)", () => {
  it("periods are calendar months: February 28/29, 30- and 31-day months", () => {
    const days = closeDaysOf({
      kpiCloseDay: 31,
      kpiCloseDays: [{ fromPeriod: null, closeDay: 31 }]
    });
    expect(kpiPeriodRange("2026-02", days)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(kpiPeriodRange("2028-02", days)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(kpiPeriodRange("2026-04", days)).toEqual({ from: "2026-04-01", to: "2026-04-30" });
    expect(kpiPeriodRange("2026-12", days)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(kpiPeriodOfDay("2026-10-31", days)).toBe("2026-10");
    expect(kpiPeriodOfDay("2026-11-01", days)).toBe("2026-11");
  });

  it("a scheduled change to the month's end is announced and starts after the old close day", () => {
    const toEnd = [
      { fromPeriod: null, closeDay: 25 },
      { fromPeriod: "2026-11", closeDay: 31 }
    ];
    expect(upcomingCloseDayChange(toEnd, "2026-10")).toEqual({
      fromPeriod: "2026-11",
      closeDay: 31
    });
    expect(kpiPeriodRange("2026-11", toEnd)).toEqual({ from: "2026-10-26", to: "2026-11-30" });
    expect(kpiPeriodRange("2026-12", toEnd)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("shiftPeriod / periodsBetween", () => {
  it("moves across years in both directions", () => {
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-05", -17)).toBe("2024-12");
    expect(shiftPeriod("2026-05", 0)).toBe("2026-05");
  });

  it("lists every period inclusively", () => {
    expect(periodsBetween("2026-11", "2027-02")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02"
    ]);
    expect(periodsBetween("2026-05", "2026-05")).toEqual(["2026-05"]);
    expect(periodsBetween("2026-06", "2026-05")).toEqual([]);
  });
});

describe("labels", () => {
  it("formats periods and day ranges in Vietnamese order", () => {
    expect(formatPeriod("2026-06")).toBe("06/2026");
    expect(periodLabel("2026-06")).toBe("Kỳ 06/2026");
    expect(monthShortLabel("2026-06")).toBe("T6");
    expect(formatDayRange("2026-05-26", "2026-06-25")).toBe("26/05 – 25/06/2026");
    expect(formatDayRange("2026-12-26", "2027-01-25")).toBe("26/12/2026 – 25/01/2027");
  });

  it("labels quarter and year rollups", () => {
    expect(quarterOfPeriod("2026-06")).toBe("2026-Q2");
    expect(quarterOfPeriod("2026-10")).toBe("2026-Q4");
    expect(rollupLabel("2026-Q2")).toBe("Quý 2/2026");
    expect(rollupLabel("2026")).toBe("Năm 2026");
  });

  it("validates period keys", () => {
    expect(isPeriod("2026-06")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-6")).toBe(false);
    expect(isPeriod(null)).toBe(false);
  });
});
