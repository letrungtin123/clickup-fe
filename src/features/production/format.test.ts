import { describe, expect, it } from "vitest";

import {
  addDays,
  dateToDay,
  dayInRange,
  dayToDate,
  formatCredit,
  formatDay,
  formatMoney,
  formatVersionRange,
  isDay,
  kpiPeriod,
  parseCreditInput,
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
    expect(kpiPeriod("2026-10-09", 25)).toEqual({
      start: "2026-09-26",
      end: "2026-10-25",
      daysLeft: 16
    });
    expect(kpiPeriod("2026-10-25", 25)).toEqual({
      start: "2026-09-26",
      end: "2026-10-25",
      daysLeft: 0
    });
  });

  it("rolls into the next period after the close day, across years", () => {
    expect(kpiPeriod("2026-10-26", 25)).toEqual({
      start: "2026-10-26",
      end: "2026-11-25",
      daysLeft: 30
    });
    expect(kpiPeriod("2026-12-30", 20)).toEqual({
      start: "2026-12-21",
      end: "2027-01-20",
      daysLeft: 21
    });
  });

  it("clamps the close day to 1–28", () => {
    expect(kpiPeriod("2026-03-01", 31)?.end).toBe("2026-03-28");
    expect(kpiPeriod("2026-03-01", 0)).toEqual({
      start: "2026-02-02",
      end: "2026-03-01",
      daysLeft: 0
    });
    expect(kpiPeriod("bad", 25)).toBeNull();
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
