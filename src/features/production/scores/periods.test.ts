import { describe, expect, it } from "vitest";

import {
  formatDayRange,
  formatPeriod,
  isPeriod,
  monthShortLabel,
  periodLabel,
  periodOfDay,
  periodRange,
  periodsBetween,
  quarterOfPeriod,
  rollupLabel,
  shiftPeriod
} from "./periods";

describe("periodOfDay", () => {
  it("puts days after the close day into the next period", () => {
    expect(periodOfDay("2026-05-25", 25)).toBe("2026-05");
    expect(periodOfDay("2026-05-26", 25)).toBe("2026-06");
    expect(periodOfDay("2026-05-31", 25)).toBe("2026-06");
    expect(periodOfDay("2026-09-26", 25)).toBe("2026-10");
    expect(periodOfDay("2026-09-25", 25)).toBe("2026-09");
  });

  it("rolls over the year end", () => {
    expect(periodOfDay("2026-12-26", 25)).toBe("2027-01");
    expect(periodOfDay("2026-12-31", 20)).toBe("2027-01");
  });

  it("follows a changed close day", () => {
    expect(periodOfDay("2026-05-21", 20)).toBe("2026-06");
    expect(periodOfDay("2026-05-20", 20)).toBe("2026-05");
  });
});

describe("periodRange", () => {
  it("runs from the day after the previous close day to this close day", () => {
    expect(periodRange("2026-06", 25)).toEqual({ from: "2026-05-26", to: "2026-06-25" });
    expect(periodRange("2026-10", 25)).toEqual({ from: "2026-09-26", to: "2026-10-25" });
  });

  it("crosses the year boundary for January", () => {
    expect(periodRange("2027-01", 25)).toEqual({ from: "2026-12-26", to: "2027-01-25" });
  });

  it("clamps the close day to 1–28", () => {
    // 28 Feb 2026 is the last day of February: the period starts on 1 March.
    expect(periodRange("2026-03", 31)).toEqual({ from: "2026-03-01", to: "2026-03-28" });
    expect(periodRange("2024-03", 28)).toEqual({ from: "2024-02-29", to: "2024-03-28" });
    expect(periodRange("2026-03", 0)).toEqual({ from: "2026-02-02", to: "2026-03-01" });
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
    expect(periodsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
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
