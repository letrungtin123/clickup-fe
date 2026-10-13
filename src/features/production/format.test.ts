import { describe, expect, it } from "vitest";

import {
  addDays,
  closeDayChange,
  closeDayLabel,
  closeDaySchedule,
  dateToDay,
  dayInRange,
  dayToDate,
  formatCredit,
  formatDay,
  formatKpiPeriod,
  formatMoney,
  formatVersionRange,
  isDay,
  formatNumber,
  formatPercent,
  kpiPeriod,
  normalizeCloseDay,
  parseCreditInput,
  parseDecimalInput,
  parseMoneyInput,
  todayIn
} from "./format";

// Intl may use narrow no-break spaces in currency output; compare on normalized spaces.
const spaces = (value: string) => value.replace(/[^\S\n]/g, " ");

describe("formatCredit", () => {
  it("always shows two decimals with the Vietnamese separator", () => {
    expect(formatCredit(1)).toBe("1,00");
    expect(formatCredit(1.48)).toBe("1,48");
    expect(formatCredit(0.1)).toBe("0,10");
    expect(formatCredit(1234.5)).toBe("1.234,50");
  });

  it("renders a dash for missing values", () => {
    expect(formatCredit(null)).toBe("—");
    expect(formatCredit(undefined)).toBe("—");
    expect(formatCredit(Number.NaN)).toBe("—");
  });
});

describe("formatMoney", () => {
  it("formats VND without decimals", () => {
    expect(spaces(formatMoney(7000))).toBe("7.000 ₫");
    expect(spaces(formatMoney(0))).toBe("0 ₫");
    expect(spaces(formatMoney(1_250_000))).toBe("1.250.000 ₫");
  });

  it("shows a dash when there is no price", () => {
    expect(formatMoney(null)).toBe("—");
  });
});

describe("parseCreditInput", () => {
  it("accepts comma or dot decimals", () => {
    expect(parseCreditInput("1,48")).toEqual({ ok: true, value: 1.48 });
    expect(parseCreditInput("1.5")).toEqual({ ok: true, value: 1.5 });
    expect(parseCreditInput(" 3 ")).toEqual({ ok: true, value: 3 });
  });

  it("handles grouping when both separators appear", () => {
    expect(parseCreditInput("1.234,5")).toEqual({ ok: true, value: 1234.5 });
    expect(parseCreditInput("1,234.25")).toEqual({ ok: true, value: 1234.25 });
  });

  it("treats empty as no value", () => {
    expect(parseCreditInput("")).toEqual({ ok: true, value: null });
  });

  it("rejects more than two decimals, negatives and text", () => {
    expect(parseCreditInput("1,234").ok).toBe(false);
    expect(parseCreditInput("-1").ok).toBe(false);
    expect(parseCreditInput("abc").ok).toBe(false);
    expect(parseCreditInput("100000000").ok).toBe(false);
  });
});

describe("parseMoneyInput", () => {
  it("strips grouping, spaces and currency marks", () => {
    expect(parseMoneyInput("7.000")).toEqual({ ok: true, value: 7000 });
    expect(parseMoneyInput("7 000 ₫")).toEqual({ ok: true, value: 7000 });
    expect(parseMoneyInput("15000đ")).toEqual({ ok: true, value: 15000 });
    expect(parseMoneyInput("20,000 VND")).toEqual({ ok: true, value: 20000 });
  });

  it("treats empty as no price", () => {
    expect(parseMoneyInput("  ")).toEqual({ ok: true, value: null });
  });

  it("rejects non-integers and huge values", () => {
    expect(parseMoneyInput("abc").ok).toBe(false);
    expect(parseMoneyInput("-5").ok).toBe(false);
    expect(parseMoneyInput("2000000000").ok).toBe(false);
  });
});

describe("calendar days", () => {
  it("validates real calendar days only", () => {
    expect(isDay("2026-10-09")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-1-9")).toBe(false);
  });

  it("converts between days and local dates without timezone drift", () => {
    const date = dayToDate("2026-03-01");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(1);
    expect(dateToDay(new Date(2026, 11, 31))).toBe("2026-12-31");
    expect(dayToDate("nope")).toBeNull();
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("formats dd/MM/yyyy", () => {
    expect(formatDay("2026-10-09")).toBe("09/10/2026");
    expect(formatDay(null)).toBe("—");
  });

  it("computes today in the organization timezone", () => {
    // 2026-10-09 18:30 UTC is already 10 Oct in Ho Chi Minh City (UTC+7).
    const instant = new Date(Date.UTC(2026, 9, 9, 18, 30));
    expect(todayIn("Asia/Ho_Chi_Minh", instant)).toBe("2026-10-10");
    expect(todayIn("UTC", instant)).toBe("2026-10-09");
  });
});

describe("kpiPeriod", () => {
  it("runs from the day after the previous close day through this month's close day", () => {
    // daysLeft counts today, like the API forecast (BUG-PR-24): 1 on the close day.
    expect(kpiPeriod("2026-10-09", 25)).toEqual({
      period: "2026-10",
      start: "2026-09-26",
      end: "2026-10-25",
      daysLeft: 17
    });
    expect(kpiPeriod("2026-10-25", 25)).toEqual({
      period: "2026-10",
      start: "2026-09-26",
      end: "2026-10-25",
      daysLeft: 1
    });
  });

  it("rolls into the next period after the close day, across years", () => {
    expect(kpiPeriod("2026-10-26", 25)).toEqual({
      period: "2026-11",
      start: "2026-10-26",
      end: "2026-11-25",
      daysLeft: 31
    });
    expect(kpiPeriod("2026-12-30", 20)).toEqual({
      period: "2027-01",
      start: "2026-12-21",
      end: "2027-01-20",
      daysLeft: 22
    });
  });

  it("31 = “Cuối tháng”: the calendar month (February 28/29, 30-day months)", () => {
    expect(kpiPeriod("2026-03-01", 31)).toEqual({
      period: "2026-03",
      start: "2026-03-01",
      end: "2026-03-31",
      daysLeft: 31
    });
    expect(kpiPeriod("2026-02-28", 31)).toEqual({
      period: "2026-02",
      start: "2026-02-01",
      end: "2026-02-28",
      daysLeft: 1
    });
    expect(kpiPeriod("2028-02-10", 31)).toMatchObject({ start: "2028-02-01", end: "2028-02-29" });
    expect(kpiPeriod("2026-04-30", 31)).toMatchObject({
      period: "2026-04",
      end: "2026-04-30",
      daysLeft: 1
    });
    expect(kpiPeriod("2026-12-31", 31)).toMatchObject({ period: "2026-12", start: "2026-12-01" });
  });

  it("25 → 31 and 31 → 25 changes keep periods contiguous", () => {
    const toEnd = [
      { fromPeriod: null, closeDay: 25 },
      { fromPeriod: "2026-10", closeDay: 31 }
    ];
    expect(kpiPeriod("2026-09-26", toEnd)).toMatchObject({
      period: "2026-10",
      start: "2026-09-26",
      end: "2026-10-31"
    });
    expect(kpiPeriod("2026-11-01", toEnd)).toMatchObject({
      period: "2026-11",
      start: "2026-11-01",
      end: "2026-11-30"
    });
    const back = [
      { fromPeriod: null, closeDay: 31 },
      { fromPeriod: "2026-11", closeDay: 25 }
    ];
    expect(kpiPeriod("2026-10-31", back)).toMatchObject({
      period: "2026-10",
      start: "2026-10-01",
      end: "2026-10-31"
    });
    expect(kpiPeriod("2026-11-01", back)).toMatchObject({
      period: "2026-11",
      start: "2026-11-01",
      end: "2026-11-25"
    });
    expect(kpiPeriod("2026-11-26", back)).toMatchObject({
      period: "2026-12",
      start: "2026-11-26",
      end: "2026-12-25"
    });
  });

  it("normalizes a single close day to 1–28 or 31", () => {
    expect([0, 1, 28, 29, 30, 31, 45, 12.7].map(normalizeCloseDay)).toEqual([
      1, 1, 28, 31, 31, 31, 31, 12
    ]);
    expect(kpiPeriod("2026-03-01", 30)?.end).toBe("2026-03-31");
    expect(kpiPeriod("2026-03-01", 0)).toEqual({
      period: "2026-03",
      start: "2026-02-02",
      end: "2026-03-01",
      daysLeft: 1
    });
    expect(kpiPeriod("bad", 25)).toBeNull();
  });

  it("follows the close-day versions (a change applies from the next period)", () => {
    const versions = [
      { fromPeriod: null, closeDay: 25 },
      { fromPeriod: "2026-11", closeDay: 20 }
    ];
    expect(kpiPeriod("2026-10-11", versions)).toMatchObject({
      period: "2026-10",
      start: "2026-09-26",
      end: "2026-10-25"
    });
    expect(kpiPeriod("2026-10-30", versions)).toMatchObject({
      period: "2026-11",
      start: "2026-10-26",
      end: "2026-11-20"
    });
    expect(kpiPeriod("2026-11-25", versions)).toMatchObject({
      period: "2026-12",
      start: "2026-11-21",
      end: "2026-12-20"
    });
  });
});

describe("closeDayChange", () => {
  const base = [{ fromPeriod: null, closeDay: 25 }];

  it("applies a new close day from the next period only", () => {
    const plan = closeDayChange("2026-10-11", base, 20);
    expect(plan).toMatchObject({
      inForce: 25,
      next: "2026-11",
      scheduled: 25,
      changes: true,
      nextRange: { from: "2026-10-26", to: "2026-11-20" }
    });
    expect(plan?.current).toMatchObject({ start: "2026-09-26", end: "2026-10-25" });
    expect(closeDayChange("2026-10-11", base, 25)?.changes).toBe(false);
    expect(formatKpiPeriod("2026-11")).toBe("11/2026");
  });

  it("“Cuối tháng” (31) from the next period: it runs from the old close day + 1 to the month's end", () => {
    expect(closeDayChange("2026-10-11", base, 31)).toMatchObject({
      inForce: 25,
      next: "2026-11",
      changes: true,
      nextRange: { from: "2026-10-26", to: "2026-11-30" }
    });
    const endOfMonth = [{ fromPeriod: null, closeDay: 31 }];
    expect(closeDayChange("2026-10-11", endOfMonth, 25)).toMatchObject({
      inForce: 31,
      current: { start: "2026-10-01", end: "2026-10-31" },
      nextRange: { from: "2026-11-01", to: "2026-11-25" }
    });
    expect(closeDayChange("2026-10-11", endOfMonth, 31)?.changes).toBe(false);
  });

  it("labels the close day, “cuối tháng” for 31", () => {
    expect(closeDayLabel(25)).toBe("ngày 25");
    expect(closeDayLabel(31)).toBe("cuối tháng");
    expect(closeDaySchedule(1)).toBe("ngày 1 hằng tháng");
    expect(closeDaySchedule(31)).toBe("ngày cuối mỗi tháng");
  });

  it("knows a scheduled change and that saving the day in force cancels it", () => {
    const scheduled = [...base, { fromPeriod: "2026-11", closeDay: 20 }];
    expect(closeDayChange("2026-10-11", scheduled, 20)).toMatchObject({
      scheduled: 20,
      changes: false
    });
    expect(closeDayChange("2026-10-11", scheduled, 25)).toMatchObject({
      scheduled: 20,
      changes: true,
      nextRange: { from: "2026-10-26", to: "2026-11-25" }
    });
  });
});

describe("credit version ranges", () => {
  it("shows the exclusive end as the previous day", () => {
    expect(formatVersionRange("2026-10-01", "2026-10-15")).toBe("01/10/2026 – 14/10/2026");
    expect(formatVersionRange("2026-10-15", null)).toBe("Từ 15/10/2026");
  });

  it("checks [from, to) membership", () => {
    expect(dayInRange("2026-10-01", "2026-10-01", "2026-10-15")).toBe(true);
    expect(dayInRange("2026-10-15", "2026-10-01", "2026-10-15")).toBe(false);
    expect(dayInRange("2027-01-01", "2026-10-15", null)).toBe(true);
    expect(dayInRange("2026-09-30", "2026-10-01", null)).toBe(false);
  });
});

describe("Vietnamese numbers (BUG-PR-22)", () => {
  it("uses the comma decimal and dot grouping everywhere", () => {
    expect(formatNumber(1.5)).toBe("1,5");
    expect(formatNumber(2.5)).toBe("2,5");
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(formatNumber(13.75)).toBe("13,8");
    expect(formatNumber(13.756, 2)).toBe("13,76");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
  });

  it("shows KPI percents with one decimal", () => {
    expect(formatPercent(94.65)).toBe("94,7%");
    expect(formatPercent(100)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(null)).toBe("—");
  });

  it("reads typed decimals with either separator", () => {
    expect(parseDecimalInput("1,5")).toBe(1.5);
    expect(parseDecimalInput(" 1.5 ")).toBe(1.5);
    expect(parseDecimalInput("2")).toBe(2);
    expect(parseDecimalInput("1,2,3")).toBeNull();
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput("")).toBeNull();
  });
});
