import { describe, expect, it } from "vitest";

import {
  activePreset,
  comparisonLabel,
  comparisonTitle,
  formatOverviewRange,
  overviewQuery,
  overviewRangeOf,
  overviewTabOf,
  overviewTabToSearch,
  overviewTimeFromSearch,
  overviewTimeLabel,
  overviewTimeToSearch,
  percentOf,
  presetTime,
  projectJobsHref,
  trendOf
} from "./model";

// PD-076 / PD-078 — "Tổng quan" page state and figures. Obviously fake ids (public repository).
const me = "00000000-0000-4000-8000-000000000900";
const today = "2026-10-21";
const closeDays = [{ fromPeriod: null, closeDay: 25 }];
const search = (value: string) => new URLSearchParams(value);

describe("overview time filter (URL)", () => {
  it("nothing = Hôm nay; days in order; a KPI period wins; impossible days are dropped", () => {
    expect(overviewTimeFromSearch(search(""))).toEqual({ kind: "today" });
    expect(overviewTimeFromSearch(search("from=2026-10-25&to=2026-10-19"))).toEqual({
      kind: "range",
      from: "2026-10-19",
      to: "2026-10-25"
    });
    expect(overviewTimeFromSearch(search("from=2026-10-03"))).toEqual({
      kind: "range",
      from: "2026-10-03",
      to: "2026-10-03"
    });
    expect(overviewTimeFromSearch(search("period=2026-10&from=2026-10-01"))).toEqual({
      kind: "period",
      period: "2026-10"
    });
    expect(overviewTimeFromSearch(search("from=2026-02-31&period=2026-13"))).toEqual({ kind: "today" });
    // More than 400 days: the last 400.
    expect(overviewTimeFromSearch(search("from=2024-01-01&to=2026-10-21"))).toEqual({
      kind: "range",
      from: "2025-09-17",
      to: "2026-10-21"
    });
  });

  it("writes only its own parameters (the tab and an open task stay); Hôm nay is the bare URL", () => {
    const base = search(`leader=${me}&ptask=abc&from=2026-10-01&to=2026-10-31`);
    expect(overviewTimeToSearch({ kind: "today" }, base).toString()).toBe(`leader=${me}&ptask=abc`);
    expect(overviewTimeToSearch({ kind: "period", period: "2026-10" }, base).toString()).toBe(
      `leader=${me}&ptask=abc&period=2026-10`
    );
    expect(
      overviewTimeToSearch({ kind: "range", from: "2026-10-19", to: "2026-10-25" }, base).toString()
    ).toBe(`leader=${me}&ptask=abc&from=2026-10-19&to=2026-10-25`);
    expect(presetTime({ key: "today", from: today, to: today })).toEqual({ kind: "today" });
  });

  it("ranges: today, presets, KPI periods from the close days (26th → 25th, PD-074)", () => {
    expect(overviewRangeOf({ kind: "today" }, today, closeDays)).toEqual({ from: today, to: today });
    expect(overviewRangeOf({ kind: "period", period: "2026-10" }, today, closeDays)).toEqual({
      from: "2026-09-26",
      to: "2026-10-25"
    });
    expect(overviewRangeOf({ kind: "period", period: "2027-01" }, today, closeDays)).toEqual({
      from: "2026-12-26",
      to: "2027-01-25"
    });
    // Another close day in the settings is followed, never a hard-coded 25.
    expect(overviewRangeOf({ kind: "period", period: "2026-10" }, today, 20)).toEqual({
      from: "2026-09-21",
      to: "2026-10-20"
    });
    expect(activePreset({ kind: "range", from: "2026-10-19", to: "2026-10-25" }, today)).toBe("week");
    expect(activePreset({ kind: "range", from: "2026-10-01", to: "2026-10-31" }, today)).toBe("month");
    expect(activePreset({ kind: "range", from: "2026-09-01", to: "2026-09-30" }, today)).toBe("lastMonth");
    expect(activePreset({ kind: "range", from: "2026-10-02", to: "2026-10-09" }, today)).toBeNull();
  });

  it("labels", () => {
    expect(overviewTimeLabel({ kind: "today" }, today)).toBe("Hôm nay");
    expect(overviewTimeLabel({ kind: "range", from: "2026-10-19", to: "2026-10-25" }, today)).toBe("Tuần này");
    expect(overviewTimeLabel({ kind: "period", period: "2026-10" }, today)).toBe("Kỳ 10/2026");
    expect(overviewTimeLabel({ kind: "range", from: "2026-10-02", to: "2026-10-09" }, today)).toBe("02/10 – 09/10");
    expect(formatOverviewRange({ from: "2025-12-26", to: "2026-01-25" }, today)).toBe("26/12/2025 – 25/01/2026");
    expect(formatOverviewRange({ from: "2025-09-01", to: "2025-09-30" }, today)).toBe("01/09 – 30/09/2025");
    expect(comparisonLabel({ from: "2026-10-20", to: "2026-10-20" }, today)).toBe("so với hôm qua");
    expect(comparisonLabel({ from: "2026-09-10", to: "2026-09-30" }, today)).toBe("so với 21 ngày trước đó");
    expect(comparisonTitle({ from: "2026-09-10", to: "2026-09-30" }, today)).toBe("So với 10/09 – 30/09");
  });
});

describe("overview scope tabs (PD-078: ?scope=, the Projects I own)", () => {
  it("LEADER / ADMIN get tabs: ?scope= wins; PD-076 ?leader= links read once; else the role's landing tab", () => {
    expect(overviewTabOf(search(""), ["LEADER"], me)).toBe("mine");
    expect(overviewTabOf(search(""), ["ADMIN"], me)).toBe("all");
    expect(overviewTabOf(search(""), ["LEADER", "ADMIN"], me)).toBe("mine");
    expect(overviewTabOf(search("scope=all"), ["LEADER"], me)).toBe("all");
    expect(overviewTabOf(search("scope=mine"), ["ADMIN"], me)).toBe("mine");
    expect(overviewTabOf(search(`leader=${me}`), ["LEADER"], me)).toBe("mine");
    expect(overviewTabOf(search("leader=all"), ["LEADER"], me)).toBe("all");
    expect(overviewTabOf(search("leader=00000000-0000-4000-8000-000000000001"), ["LEADER"], me)).toBe("all");
    for (const role of ["ACCOUNT", "STAFF", "QC", "DIRECTOR"] as const) {
      expect(overviewTabOf(search("scope=mine"), [role], me)).toBeNull();
    }
    expect(overviewTabToSearch("all", search("from=2026-10-01&to=2026-10-31")).toString()).toBe(
      "from=2026-10-01&to=2026-10-31&scope=all"
    );
    expect(overviewTabToSearch("mine", search(`leader=${me}`)).toString()).toBe("scope=mine");
  });

  it("API query and the Project's Job list link keep the tab", () => {
    expect(overviewQuery({ from: today, to: today }, "mine")).toEqual({ from: today, to: today, scope: "mine" });
    expect(overviewQuery({ from: today, to: today }, "all")).toEqual({ from: today, to: today });
    expect(overviewQuery({ from: today, to: today }, null)).toEqual({ from: today, to: today });
    expect(projectJobsHref("p1", "mine")).toBe("/production/jobs?project=p1&scope=mine");
    expect(projectJobsHref("p1", "all")).toBe("/production/jobs?project=p1&scope=all");
    expect(projectJobsHref("p1", null)).toBe("/production/jobs?project=p1");
  });
});

describe("overview figures", () => {
  it("percent and trend", () => {
    expect(percentOf(1240, 3000)).toBe(41);
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(120, 100)).toBe(100);
    expect(trendOf(12, 10)).toEqual({ direction: "up", percent: 20 });
    expect(trendOf(5, 10)).toEqual({ direction: "down", percent: 50 });
    expect(trendOf(3, 0)).toEqual({ direction: "up", percent: null });
    expect(trendOf(4, 4)).toEqual({ direction: "flat", percent: 0 });
  });
});
