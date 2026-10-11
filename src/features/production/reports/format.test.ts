import { describe, expect, it } from "vitest";

import {
  dimensionKeyLabel,
  formatAxisValue,
  formatMeasure,
  formatMinutes,
  formatReportValue,
  isAdditive
} from "./format";

// Intl may use narrow no-break spaces in currency output; compare on normalized spaces.
const spaces = (value: string) => value.replace(/[^\S\n]/g, " ");

describe("formatReportValue", () => {
  it("formats rates given as fractions", () => {
    expect(formatReportValue(0.125, "percent")).toBe("12,5%");
    expect(formatReportValue(0.1, "percent")).toBe("10%");
    expect(formatReportValue(1, "percent")).toBe("100%");
    expect(formatMeasure("fb_rate", 0.0333)).toBe("3,3%");
  });

  it("formats money as integer VND and points with two decimals", () => {
    expect(spaces(formatReportValue(1234567, "money"))).toBe("1.234.567 ₫");
    expect(formatMeasure("points", 12.5)).toBe("12,50");
    expect(formatMeasure("qty_done", 1200)).toBe("1.200");
    expect(formatMeasure("avg_hours_done", 3.25)).toBe("3,3 giờ");
    expect(formatMeasure("qty_per_worker_day", 41.667)).toBe("41,67");
  });

  it("renders a dash for null, NaN and non-numbers", () => {
    expect(formatReportValue(null, "percent")).toBe("—");
    expect(formatReportValue(Number.NaN, "points")).toBe("—");
    expect(formatReportValue("12", "count")).toBe("—");
  });
});

describe("axis and labels", () => {
  it("compacts large axis values", () => {
    expect(spaces(formatAxisValue(12345, "money"))).toBe("12,3 N");
    expect(formatAxisValue(0.5, "percent")).toBe("50%");
    expect(formatAxisValue(7.25, "points")).toBe("7,25");
    // one notation per axis: compact when the axis maximum is ≥ 10.000
    expect(spaces(formatAxisValue(3500, "points", true))).toBe("3,5 N");
    expect(formatAxisValue(3500, "points", false)).toBe("3.500");
  });

  it("labels dimension keys when the server label is missing", () => {
    expect(dimensionKeyLabel("day", "2026-05-09")).toBe("09/05/2026");
    expect(dimensionKeyLabel("week", "2026-05-04")).toBe("Tuần 04/05/2026");
    expect(dimensionKeyLabel("month", "2026-05")).toBe("05/2026");
    expect(dimensionKeyLabel("period", "2026-05")).toBe("Kỳ 05/2026");
    expect(dimensionKeyLabel("user", null)).toBe("Không rõ");
  });

  it("knows which measures can be summed", () => {
    expect(isAdditive("points")).toBe(true);
    expect(isAdditive("money_khoan")).toBe(true);
    expect(isAdditive("fb_rate")).toBe(false);
    expect(isAdditive("avg_hours_done")).toBe(false);
  });

  it("formats durations in minutes", () => {
    expect(formatMinutes(45)).toBe("45 phút");
    expect(formatMinutes(125)).toBe("2 giờ 05 phút");
    expect(formatMinutes(120)).toBe("2 giờ");
    expect(formatMinutes(1440 * 3 + 240)).toBe("3 ngày 4 giờ");
  });
});
