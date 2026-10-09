import { describe, expect, it } from "vitest";

import type { KpiReport } from "@/contracts/production-scores";

import { attainment, reportKeys, reportRowsFor } from "./report";

const user = (id: string, name: string) => ({
  user: { id, displayName: name, email: null, avatarUrl: null },
  teamId: null,
  teamName: null
});

const figures = (target: number | null, total: number) => ({
  target,
  pointsOfficial: total,
  khoanPointsConverted: 0,
  totalPoints: total,
  percent: target ? Math.round((total / target) * 10000) / 100 : null,
  difference: target === null ? null : total - target,
  khoanMoney: null
});

const report: KpiReport = {
  from: "2026-05",
  to: "2026-07",
  periods: ["2026-05", "2026-06", "2026-07"],
  users: [user("a", "NV01"), user("b", "NV02")],
  rows: [
    { userId: "a", period: "2026-05", settled: true, targetBase: 2400, khoanCredits: 0, met: false, leaveDays: 0, ...figures(2400, 2271.72) },
    { userId: "a", period: "2026-06", settled: false, targetBase: 2400, khoanCredits: 0, met: true, leaveDays: 0, ...figures(2400, 2500) }
  ],
  rollups: [
    {
      userId: "a",
      periodType: "QUARTER",
      key: "2026-Q2",
      periods: ["2026-05", "2026-06"],
      explicitTarget: false,
      ...figures(4800, 4771.72)
    }
  ]
};

describe("reportKeys", () => {
  const periods = ["2026-05", "2026-06", "2026-07"];
  it("lists months, quarters or years newest first", () => {
    expect(reportKeys("MONTH", periods)).toEqual(["2026-07", "2026-06", "2026-05"]);
    expect(reportKeys("QUARTER", periods)).toEqual(["2026-Q3", "2026-Q2"]);
    expect(reportKeys("YEAR", ["2025-12", "2026-01"])).toEqual(["2026", "2025"]);
  });
});

describe("reportRowsFor", () => {
  it("gives one row per person for a month, empty figures when missing", () => {
    const rows = reportRowsFor(report, "MONTH", "2026-05");
    expect(rows.map((row) => [row.user.displayName, row.settled, row.figures.totalPoints])).toEqual([
      ["NV01", true, 2271.72],
      ["NV02", null, 0]
    ]);
    expect(rows[1]?.figures.target).toBeNull();
  });

  it("reads quarter rollups", () => {
    const rows = reportRowsFor(report, "QUARTER", "2026-Q2");
    expect(rows[0]?.figures.target).toBe(4800);
    expect(rows[0]?.settled).toBeNull();
    expect(rows[1]?.figures.percent).toBeNull();
  });
});

describe("attainment", () => {
  it("counts people with a target and those at 100 % or more", () => {
    expect(attainment([{ percent: 94.65 }, { percent: 104.17 }, { percent: null }])).toEqual({
      withTarget: 2,
      met: 1,
      average: 99.41
    });
    expect(attainment([])).toEqual({ withTarget: 0, met: 0, average: null });
  });
});
