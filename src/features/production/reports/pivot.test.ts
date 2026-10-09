import { describe, expect, it } from "vitest";

import type { ReportRow } from "@/contracts/production-reports";

import { buildChartModel, buildPivot, cellKey, maxSeries } from "./pivot";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";

const rows: ReportRow[] = [
  {
    user: U1,
    user_label: "An",
    week: "2026-05-11",
    week_label: "Tuần 11/05/2026",
    points: 10,
    task_count: 4,
    fb_wrong_count: 1,
    fb_rate: 0.25
  },
  {
    user: U1,
    user_label: "An",
    week: "2026-05-04",
    week_label: "Tuần 04/05/2026",
    points: 5,
    task_count: 2,
    fb_wrong_count: 0,
    fb_rate: 0
  },
  {
    user: U2,
    user_label: "Bình",
    week: "2026-05-04",
    week_label: "Tuần 04/05/2026",
    points: 7.5,
    task_count: 5,
    fb_wrong_count: 2,
    fb_rate: 0.4
  }
];
const totals = { points: 22.5, task_count: 11, fb_wrong_count: 3, fb_rate: 3 / 11 };

describe("buildPivot", () => {
  it("without Cột: one group, server totals in the totals row", () => {
    const pivot = buildPivot({ rows, totals }, ["user", "week"], [], ["points"]);
    expect(pivot.groups).toEqual([{ key: "", labels: [] }]);
    expect(pivot.rows.map((row) => row.labels)).toEqual([
      ["An", "Tuần 11/05/2026"],
      ["An", "Tuần 04/05/2026"],
      ["Bình", "Tuần 04/05/2026"]
    ]);
    expect(pivot.rows[0]?.cells.get(cellKey("", "points"))).toBe(10);
    expect(pivot.groupTotals.get(cellKey("", "points"))).toBe(22.5);
  });

  it("with Cột: groups sorted chronologically, missing cells empty, sub-totals per group and row", () => {
    const pivot = buildPivot(
      { rows, totals },
      ["user"],
      ["week"],
      ["points", "fb_wrong_count", "task_count", "fb_rate"]
    );
    expect(pivot.groups.map((group) => group.key)).toEqual(["2026-05-04", "2026-05-11"]);
    expect(pivot.rows.map((row) => row.key)).toEqual([U1, U2]);
    const bình = pivot.rows[1]!;
    expect(bình.cells.get(cellKey("2026-05-11", "points"))).toBeUndefined();
    expect(bình.cells.get(cellKey("2026-05-04", "points"))).toBe(7.5);
    // Additive measures are summed, fb_rate is recomputed from its parts (never summed).
    expect(pivot.groupTotals.get(cellKey("2026-05-04", "points"))).toBe(12.5);
    expect(pivot.groupTotals.get(cellKey("2026-05-04", "fb_rate"))).toBeCloseTo(2 / 7);
    const an = pivot.rows[0]!;
    expect(an.total.get("points")).toBe(15);
    expect(an.total.get("fb_rate")).toBeCloseTo(1 / 6);
    expect(pivot.grandTotals.get("fb_rate")).toBeCloseTo(3 / 11);
  });

  it("leaves non-additive sub-totals empty when their parts are not in the report", () => {
    const pivot = buildPivot({ rows, totals }, ["user"], ["week"], ["fb_rate"]);
    expect(pivot.rows[0]?.total.get("fb_rate")).toBeNull();
    expect(pivot.groupTotals.get(cellKey("2026-05-04", "fb_rate"))).toBeNull();
  });

  it("labels empty keys as unknown and sorts them last", () => {
    const withNull: ReportRow[] = [
      { team: null, team_label: "Chưa có team", points: 1 },
      { team: U1, team_label: "Alpha", points: 2 }
    ];
    const pivot = buildPivot({ rows: withNull, totals: { points: 3 } }, [], ["team"], ["points"]);
    expect(pivot.groups.map((group) => group.labels[0])).toEqual(["Alpha", "Chưa có team"]);
    expect(pivot.rows).toHaveLength(1);
    expect(pivot.rows[0]?.labels).toEqual([]);
  });
});

describe("buildChartModel", () => {
  it("one series per Cột value, categories from Hàng", () => {
    const model = buildChartModel({ rows }, ["user"], ["week"], "points", "BAR");
    expect(model.series.map((series) => series.label)).toEqual([
      "Tuần 04/05/2026",
      "Tuần 11/05/2026"
    ]);
    expect(model.data).toEqual([
      { category: U1, label: "An", s0: 5, s1: 10 },
      { category: U2, label: "Bình", s0: 7.5, s1: null }
    ]);
    expect(model.timeAxis).toBe(false);
  });

  it("lines put a time dimension from Cột on the x axis", () => {
    const model = buildChartModel({ rows }, ["user"], ["week"], "points", "LINE");
    expect(model.timeAxis).toBe(true);
    expect(model.data.map((row) => row.category)).toEqual(["2026-05-04", "2026-05-11"]);
    expect(model.series.map((series) => series.label)).toEqual(["An", "Bình"]);
    expect(model.data[1]).toEqual({
      category: "2026-05-11",
      label: "Tuần 11/05/2026",
      s0: 10,
      s1: null
    });
  });

  it("time axes are chronological", () => {
    const model = buildChartModel({ rows }, ["week"], [], "task_count", "LINE");
    expect(model.timeAxis).toBe(true);
    expect(model.data.map((row) => row.category)).toEqual(["2026-05-04", "2026-05-11"]);
    // Two rows of the same week (different users) are summed into one point.
    expect(model.data[0]?.s0).toBe(7);
    expect(model.series).toEqual([{ key: "s0", label: "" }]);
  });

  it("folds series past the 8 slots into Khác for additive measures", () => {
    const many: ReportRow[] = Array.from({ length: 10 }, (_, index) => ({
      day: "2026-05-01",
      day_label: "01/05/2026",
      user: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`,
      user_label: `NV${String(index).padStart(2, "0")}`,
      points: index + 1
    }));
    const model = buildChartModel({ rows: many }, ["day"], ["user"], "points", "BAR");
    expect(model.series).toHaveLength(maxSeries);
    expect(model.series.at(-1)).toEqual({ key: "other", label: "Khác", other: true });
    expect(model.hiddenSeries).toBe(3);
    // The three smallest (1 + 2 + 3) are folded.
    expect(model.data[0]?.other).toBe(6);

    const rates = buildChartModel(
      { rows: many.map((row) => ({ ...row, fb_rate: 0.1 })) },
      ["day"],
      ["user"],
      "fb_rate",
      "BAR"
    );
    expect(rates.series).toHaveLength(maxSeries);
    expect(rates.series.some((series) => series.other)).toBe(false);
    expect(rates.hiddenSeries).toBe(2);

    // Lines never draw a summed "Khác" (it would dwarf every other line).
    const lines = buildChartModel({ rows: many }, ["day"], ["user"], "points", "LINE");
    expect(lines.series).toHaveLength(maxSeries);
    expect(lines.series.some((series) => series.other)).toBe(false);
    expect(lines.hiddenSeries).toBe(2);
  });

  it("pie: sums across columns, positive slices, largest first, 7 + Khác", () => {
    const model = buildChartModel({ rows }, ["user"], ["week"], "points", "PIE");
    expect(model.data).toEqual([
      { category: U1, label: "An", s0: 15 },
      { category: U2, label: "Bình", s0: 7.5 }
    ]);
    const many: ReportRow[] = Array.from({ length: 10 }, (_, index) => ({
      shift: `k${index}`,
      shift_label: `Ca ${index}`,
      qty_done: 10 - index
    }));
    const pie = buildChartModel({ rows: many }, ["shift"], [], "qty_done", "PIE");
    expect(pie.data).toHaveLength(8);
    expect(pie.data.at(-1)).toEqual({ category: "__other", label: "Khác", s0: 3 + 2 + 1 });
    expect(pie.hiddenCategories).toBe(3);
  });
});
