import { describe, expect, it } from "vitest";

import type { ForecastTone } from "@/contracts/production-scores";

import {
  forecastLabel,
  forecastSentence,
  forecastToneInfo,
  formatPercent,
  formatSignedCredit,
  kpiMissing,
  progressWidth,
  toneFamily
} from "./forecast";

const base = {
  tone: "ON_TRACK" as ForecastTone,
  remaining: 128.28,
  daysLeft: 12,
  avgPerDayNeeded: 10.69,
  percent: 94.65,
  target: 2400
};

describe("forecast tone mapping", () => {
  it("maps the API tone to green / yellow / red / muted", () => {
    expect(toneFamily("MET")).toBe("success");
    expect(toneFamily("ON_TRACK")).toBe("success");
    expect(toneFamily("AT_RISK")).toBe("warning");
    expect(toneFamily("BEHIND")).toBe("danger");
    expect(toneFamily("NO_TARGET")).toBe("muted");
  });

  it("has a label for every tone", () => {
    for (const tone of ["MET", "ON_TRACK", "AT_RISK", "BEHIND", "NO_TARGET"] as const) {
      expect(forecastToneInfo[tone].label.length).toBeGreaterThan(0);
    }
  });
});

describe("forecastLabel", () => {
  it("uses the pace label while the period runs and a verdict once closed", () => {
    expect(forecastLabel({ tone: "BEHIND", daysLeft: 5 })).toBe("Chậm tiến độ");
    expect(forecastLabel({ tone: "AT_RISK", daysLeft: 3 })).toBe("Có nguy cơ thiếu");
    expect(forecastLabel({ tone: "BEHIND", daysLeft: 0 })).toBe("Không đạt KPI");
    expect(forecastLabel({ tone: "MET", daysLeft: 0 })).toBe("Đã đạt KPI");
    expect(forecastLabel({ tone: "NO_TARGET", daysLeft: 0 })).toBe("Chưa có KPI");
  });
});

describe("forecastSentence", () => {
  it("states remaining points, days and the daily pace", () => {
    expect(forecastSentence(base)).toBe("Còn thiếu 128,28 điểm, còn 12 ngày, cần 10,69 điểm/ngày.");
  });

  it("omits the pace when the API has none", () => {
    expect(forecastSentence({ ...base, avgPerDayNeeded: null })).toBe("Còn thiếu 128,28 điểm, còn 12 ngày.");
  });

  it("congratulates when the KPI is met", () => {
    expect(forecastSentence({ ...base, tone: "MET", remaining: 0, percent: 105 })).toBe(
      "Đã đạt KPI kỳ này (105%)."
    );
  });

  it("explains a closed period that fell short", () => {
    expect(forecastSentence({ ...base, tone: "BEHIND", daysLeft: 0, avgPerDayNeeded: null })).toBe(
      "Kỳ đã chốt, còn thiếu 128,28 điểm (đạt 94,7%)."
    );
  });

  it("handles periods without a target", () => {
    expect(forecastSentence({ ...base, tone: "NO_TARGET", target: null, remaining: null })).toMatch(
      /chưa có chỉ tiêu/
    );
  });

  it("PD-066: someone who must have a KPI and has none is told to ask Quản trị", () => {
    const missing = { ...base, tone: "NO_TARGET" as const, target: null, remaining: null, kpiRequired: true };
    expect(forecastSentence(missing)).toBe("Chưa có KPI kỳ này — liên hệ Quản trị.");
    expect(kpiMissing({ kpiRequired: true, targetBase: null })).toBe(true);
    expect(kpiMissing({ kpiRequired: true, targetBase: 2600 })).toBe(false);
    expect(kpiMissing({ kpiRequired: false, targetBase: null })).toBe(false);
  });
});

describe("number helpers", () => {
  it("formats percents and signed differences", () => {
    expect(formatPercent(94.65)).toBe("94,7%");
    expect(formatPercent(null)).toBe("—");
    expect(formatSignedCredit(12.5)).toBe("+12,50");
    expect(formatSignedCredit(-3)).toBe("−3,00");
    expect(formatSignedCredit(0)).toBe("0,00");
    expect(formatSignedCredit(null)).toBe("—");
  });

  it("keeps progress bars inside 0–100", () => {
    expect(progressWidth(150)).toBe(100);
    expect(progressWidth(-5)).toBe(0);
    expect(progressWidth(null)).toBe(0);
    expect(progressWidth(42.5)).toBe(42.5);
  });
});
