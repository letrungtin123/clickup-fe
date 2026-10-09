import { describe, expect, it } from "vitest";

import { ReportConfigSchema, type ReportConfigInput } from "@/contracts/production-reports";

import {
  activeFilterCount,
  configProblem,
  configSignature,
  decodeConfig,
  defaultReportConfig,
  encodeConfig,
  measuresForRole,
  monthRange,
  placeChip,
  rangeOfConfig,
  recentMonths,
  removeChip,
  sanitizeForRole,
  swapRowsAndColumns,
  viewOfConfig,
  withFilter,
  withRange,
  withSort,
  withView,
  withZones,
  zonesFromConfig,
  type Zones
} from "./model";

const config = (input: ReportConfigInput) => ReportConfigSchema.parse(input);

describe("zonesFromConfig", () => {
  it("puts every dimension in Hàng when the config has no view", () => {
    expect(zonesFromConfig(config({ dimensions: ["user", "week"], measures: ["points"] }))).toEqual(
      {
        rows: ["user", "week"],
        columns: [],
        values: ["points"]
      }
    );
  });

  it("keeps the saved Hàng / Cột split and appends dimensions missing from it", () => {
    const zones = zonesFromConfig(
      config({
        dimensions: ["user", "week", "shift"],
        measures: ["points", "qty_done"],
        view: { type: "PIVOT", rows: ["user"], columns: ["week"] }
      })
    );
    expect(zones).toEqual({
      rows: ["user", "shift"],
      columns: ["week"],
      values: ["points", "qty_done"]
    });
  });
});

describe("withZones", () => {
  it("writes dimensions as rows + columns and the view split", () => {
    const base = config({ dimensions: ["user"], measures: ["points"], view: { type: "TABLE" } });
    const next = withZones(base, {
      rows: ["user"],
      columns: ["month"],
      values: ["points", "fb_rate"]
    });
    expect(next.dimensions).toEqual(["user", "month"]);
    expect(next.measures).toEqual(["points", "fb_rate"]);
    expect(next.view).toEqual({ type: "PIVOT", rows: ["user"], columns: ["month"] });
    expect(ReportConfigSchema.safeParse(next).success).toBe(true);
  });

  it("drops a sort whose key left the report", () => {
    const base = config({
      dimensions: ["user"],
      measures: ["fb_rate", "task_count"],
      sort: { key: "fb_rate", direction: "desc" }
    });
    expect(
      withZones(base, { rows: ["user"], columns: [], values: ["task_count"] }).sort
    ).toBeUndefined();
    expect(withZones(base, { rows: ["user"], columns: [], values: ["fb_rate"] }).sort).toEqual({
      key: "fb_rate",
      direction: "desc"
    });
  });

  it("round-trips with zonesFromConfig", () => {
    const zones: Zones = {
      rows: ["team", "user"],
      columns: ["week"],
      values: ["points", "late_rate"]
    };
    expect(zonesFromConfig(withZones(defaultReportConfig(), zones))).toEqual(zones);
  });
});

describe("view", () => {
  it("maps PIVOT to the table view and back when columns exist", () => {
    const pivot = config({
      dimensions: ["user", "week"],
      measures: ["points"],
      view: { type: "PIVOT", rows: ["user"], columns: ["week"] }
    });
    expect(viewOfConfig(pivot)).toBe("TABLE");
    expect(withView(pivot, "LINE").view?.type).toBe("LINE");
    expect(withView(withView(pivot, "LINE"), "TABLE").view?.type).toBe("PIVOT");
    expect(viewOfConfig(config({ measures: ["points"] }))).toBe("TABLE");
  });
});

describe("placeChip", () => {
  const empty: Zones = { rows: [], columns: [], values: [] };

  it("routes measures to Giá trị and dimensions dropped on Giá trị to Hàng", () => {
    let zones = placeChip(empty, { kind: "measure", name: "points" }, "rows").zones;
    zones = placeChip(zones, { kind: "dimension", name: "user" }, "values").zones;
    expect(zones).toEqual({ rows: ["user"], columns: [], values: ["points"] });
  });

  it("moves a dimension between zones instead of duplicating it", () => {
    const start: Zones = { rows: ["user", "week"], columns: [], values: ["points"] };
    const { zones } = placeChip(start, { kind: "dimension", name: "week" }, "columns");
    expect(zones).toEqual({ rows: ["user"], columns: ["week"], values: ["points"] });
  });

  it("reorders inside a zone (index = position before which the chip lands)", () => {
    const start: Zones = {
      rows: ["user", "team", "shift"],
      columns: [],
      values: ["points", "qty_done", "fb_rate"]
    };
    expect(placeChip(start, { kind: "dimension", name: "user" }, "rows", 2).zones.rows).toEqual([
      "team",
      "user",
      "shift"
    ]);
    expect(placeChip(start, { kind: "dimension", name: "shift" }, "rows", 0).zones.rows).toEqual([
      "shift",
      "user",
      "team"
    ]);
    expect(
      placeChip(start, { kind: "measure", name: "fb_rate" }, "values", 0).zones.values
    ).toEqual(["fb_rate", "points", "qty_done"]);
  });

  it("refuses a fifth dimension but still allows moving one of the four", () => {
    const full: Zones = { rows: ["user", "team"], columns: ["week", "shift"], values: ["points"] };
    const refused = placeChip(full, { kind: "dimension", name: "project" }, "rows");
    expect(refused.error).toMatch(/Tối đa 4 chiều/);
    expect(refused.zones).toBe(full);
    const moved = placeChip(full, { kind: "dimension", name: "shift" }, "rows");
    expect(moved.error).toBeNull();
    expect(moved.zones.rows).toEqual(["user", "team", "shift"]);
  });

  it("removes and swaps", () => {
    const start: Zones = { rows: ["user"], columns: ["week"], values: ["points", "qty_done"] };
    expect(removeChip(start, { kind: "measure", name: "points" }).values).toEqual(["qty_done"]);
    expect(removeChip(start, { kind: "dimension", name: "week" }).columns).toEqual([]);
    expect(swapRowsAndColumns(start)).toEqual({
      rows: ["week"],
      columns: ["user"],
      values: ["points", "qty_done"]
    });
  });
});

describe("roles", () => {
  it("hides money from non-admins", () => {
    expect(measuresForRole(false)).not.toContain("money_khoan");
    expect(measuresForRole(true)).toContain("money_khoan");
  });

  it("strips money from a config opened by a Leader", () => {
    const admin = config({
      dimensions: ["user"],
      measures: ["money_khoan", "points"],
      sort: { key: "money_khoan" }
    });
    const result = sanitizeForRole(admin, false);
    expect(result.removed).toEqual(["money_khoan"]);
    expect(result.config.measures).toEqual(["points"]);
    expect(result.config.sort).toBeUndefined();
    expect(sanitizeForRole(admin, true).config).toBe(admin);
  });

  it("falls back to points when only money was selected", () => {
    const onlyMoney = config({ measures: ["money_khoan"] });
    expect(sanitizeForRole(onlyMoney, false).config.measures).toEqual(["points"]);
  });
});

describe("range", () => {
  it("defaults to the current KPI period", () => {
    expect(rangeOfConfig(config({ measures: ["points"] }))).toEqual({
      kind: "preset",
      preset: "THIS_PERIOD"
    });
  });

  it("switches between a preset and a fixed range (never both)", () => {
    const fixed = withRange(config({ measures: ["points"], preset: "TODAY" }), {
      kind: "fixed",
      from: "2026-05-31",
      to: "2026-05-01"
    });
    expect(fixed.preset).toBeUndefined();
    expect([fixed.from, fixed.to]).toEqual(["2026-05-01", "2026-05-31"]);
    const preset = withRange(fixed, { kind: "preset", preset: "LAST_MONTH" });
    expect(preset.from).toBeUndefined();
    expect(preset.preset).toBe("LAST_MONTH");
    expect(ReportConfigSchema.safeParse(fixed).success).toBe(true);
  });

  it("computes month bounds and recent months", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(recentMonths("2026-01-15", 3)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});

describe("filters, sort and validity", () => {
  it("removes empty filters (the contract refuses empty lists)", () => {
    const base = config({ measures: ["points"] });
    const id = "6c1f5b5e-1f7a-4a35-9d2a-4c6fd1c7a001";
    const withUser = withFilter(base, "user", [id]);
    expect(withUser.filters).toEqual({ user: [id] });
    expect(activeFilterCount(withUser.filters)).toBe(1);
    expect(withFilter(withUser, "user", []).filters).toEqual({});
    expect(withFilter(base, "taskState", "OPEN").filters).toEqual({ taskState: "OPEN" });
  });

  it("explains why a config cannot run", () => {
    expect(configProblem({ ...defaultReportConfig(), measures: [] })).toMatch(/Giá trị/);
    expect(configProblem(defaultReportConfig())).toBeNull();
  });

  it("sets and clears the sort", () => {
    const base = defaultReportConfig();
    expect(withSort(base, { key: "points", direction: "asc" }).sort).toEqual({
      key: "points",
      direction: "asc"
    });
    expect(
      withSort(withSort(base, { key: "points", direction: "asc" }), null).sort
    ).toBeUndefined();
  });
});

describe("URL encoding", () => {
  it("round-trips a config with Vietnamese-free base64url", () => {
    const original = config({
      dimensions: ["user", "week"],
      measures: ["fb_rate", "task_count"],
      filters: { taskKind: ["FB_WRONG"] },
      from: "2026-05-01",
      to: "2026-05-31",
      view: { type: "PIVOT", rows: ["user"], columns: ["week"] }
    });
    const encoded = encodeConfig(original);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeConfig(encoded)).toEqual(original);
  });

  it("rejects garbage and invalid configs", () => {
    expect(decodeConfig(null)).toBeNull();
    expect(decodeConfig("%%%")).toBeNull();
    expect(decodeConfig(encodeConfig({ measures: [] }))).toBeNull();
  });

  it("compares configs regardless of key order", () => {
    const a = config({ measures: ["points"], dimensions: ["user"] });
    const b = config({ dimensions: ["user"], measures: ["points"] });
    expect(configSignature(a)).toBe(configSignature(b));
    expect(configSignature(a)).not.toBe(
      configSignature(withSort(a, { key: "points", direction: "desc" }))
    );
  });
});
