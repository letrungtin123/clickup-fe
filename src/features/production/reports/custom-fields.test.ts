import { describe, expect, it } from "vitest";

import type { CustomField } from "@/contracts/production-catalog";
import { ReportConfigSchema, type ReportConfigInput } from "@/contracts/production-reports";

import {
  columnLabel,
  customFieldDimensionId,
  customFieldsUsed,
  dimensionLabel,
  dimensionMeta,
  fieldCatalog,
  multiValueDimensions,
  reportFields
} from "./dimensions";
import { customFieldFilterOptions } from "./filter-options";
import { dimensionKeyLabel } from "./format";
import {
  activeFilterCount,
  customFieldFilterValues,
  placeChip,
  privacyProblem,
  sanitizeForRole,
  withCustomFieldFilter,
  withZones,
  zonesFromConfig
} from "./model";
import { buildPivot, cellKey } from "./pivot";
import { availableTemplates, monthStart, reportTemplates, weekStart } from "./templates";

const config = (input: ReportConfigInput) => ReportConfigSchema.parse(input);

const field = (
  input: Partial<CustomField> & Pick<CustomField, "entity" | "key" | "type">
): CustomField => ({
  id: `00000000-0000-4000-8000-${String(input.key.length).padStart(12, "0")}`,
  label: input.key,
  options: [],
  required: false,
  showInTable: false,
  sortOrder: 0,
  active: true,
  ...input
});

const skill = field({
  entity: "USER",
  key: "nang_luc",
  label: "Năng lực",
  type: "SELECT",
  options: [
    { value: "a_plus_plus", label: "A++" },
    { value: "a", label: "A" },
    { value: "b", label: "B" }
  ]
});
const specialty = field({
  entity: "USER",
  key: "chuyen_mon",
  label: "Chuyên môn",
  type: "MULTISELECT",
  options: [
    { value: "retouch", label: "Retouch" },
    { value: "color", label: "Chỉnh màu" }
  ]
});
const priority = field({
  entity: "JOB",
  key: "uu_tien",
  label: "Ưu tiên",
  type: "SELECT",
  sortOrder: 2
});
const orderNo = field({
  entity: "JOB",
  key: "ma_don_hang",
  label: "Mã đơn hàng",
  type: "TEXT",
  sortOrder: 1
});
const shootDay = field({ entity: "JOB", key: "ngay_chup", label: "Ngày chụp", type: "DATE" });
const difficulty = field({ entity: "TASK", key: "do_kho", label: "Độ khó", type: "SELECT" });
const channel = field({ entity: "CLIENT", key: "kenh", label: "Kênh nhận ảnh", type: "SELECT" });
const retired = field({
  entity: "JOB",
  key: "cu",
  label: "Trường cũ",
  type: "SELECT",
  active: false
});
const all = [channel, difficulty, priority, orderNo, shootDay, skill, specialty, retired];

describe("custom-field dimensions", () => {
  it("builds the contract ids and keeps reportable fields in palette order", () => {
    expect(customFieldDimensionId(skill)).toBe("cf_user:nang_luc");
    expect(customFieldDimensionId(channel)).toBe("cf_client:kenh");
    // Same sort order → by label ("Chuyên môn" before "Năng lực").
    expect(reportFields(all, true).map(customFieldDimensionId)).toEqual([
      "cf_user:chuyen_mon",
      "cf_user:nang_luc",
      "cf_job:ma_don_hang",
      "cf_job:uu_tien",
      "cf_task:do_kho",
      "cf_client:kenh"
    ]);
  });

  it("hides members' fields from non-admins (Admin data, 403 CUSTOM_FIELDS_FORBIDDEN)", () => {
    expect(reportFields(all, false).map((item) => item.entity)).not.toContain("USER");
    expect(reportFields(all, false)).toHaveLength(4);
  });

  it("labels any dimension, custom ones from the field definition", () => {
    const catalog = fieldCatalog(all);
    expect(dimensionLabel("user")).toBe("Nhân viên");
    expect(dimensionLabel("cf_user:nang_luc", catalog)).toBe("Năng lực");
    expect(dimensionLabel("cf_job:gone", catalog)).toBe('Trường "gone"');
    expect(dimensionMeta("cf_job:uu_tien", catalog)).toMatchObject({
      kind: "entity",
      format: "text",
      custom: { entity: "job", key: "uu_tien" }
    });
    expect(dimensionMeta("month").kind).toBe("time");
    expect(
      columnLabel("cf_user:nang_luc", [{ key: "cf_user:nang_luc", label: "Năng lực (server)" }])
    ).toBe("Năng lực (server)");
    expect(dimensionKeyLabel("cf_user:nang_luc", null)).toBe("Chưa có");
    expect(dimensionKeyLabel("user", null)).toBe("Không rõ");
  });

  it("knows multi-value dimensions and the fields a config uses", () => {
    const catalog = fieldCatalog(all);
    expect([
      ...multiValueDimensions(["cf_user:chuyen_mon", "cf_user:nang_luc", "week"], catalog)
    ]).toEqual(["cf_user:chuyen_mon"]);
    expect(
      customFieldsUsed({
        dimensions: ["cf_user:nang_luc", "week"],
        filters: { customFields: [{ field: "cf_job:uu_tien" }, { field: "cf_user:nang_luc" }] }
      })
    ).toEqual(["cf_user:nang_luc", "cf_job:uu_tien"]);
  });
});

describe("custom fields in the builder model", () => {
  it("places custom-field chips in Hàng / Cột like fixed dimensions", () => {
    const base = config({ dimensions: ["month"], measures: ["points"] });
    const placed = placeChip(
      zonesFromConfig(base),
      { kind: "dimension", name: "cf_user:nang_luc" },
      "columns"
    );
    expect(placed.error).toBeNull();
    const next = withZones(base, placed.zones);
    expect(next.dimensions).toEqual(["month", "cf_user:nang_luc"]);
    expect(next.view).toEqual({ type: "PIVOT", rows: ["month"], columns: ["cf_user:nang_luc"] });
    expect(ReportConfigSchema.safeParse(next).success).toBe(true);
  });

  it("sets, merges and clears custom-field filters", () => {
    let next = withCustomFieldFilter(config({ measures: ["points"] }), "cf_user:nang_luc", [
      "a",
      "a",
      "b"
    ]);
    expect(next.filters.customFields).toEqual([{ field: "cf_user:nang_luc", values: ["a", "b"] }]);
    next = withCustomFieldFilter(next, "cf_job:ma_don_hang", ["ĐH2610-0001"]);
    next = withCustomFieldFilter(next, "cf_user:nang_luc", ["__empty__"]);
    expect(next.filters.customFields).toEqual([
      { field: "cf_user:nang_luc", values: ["__empty__"] },
      { field: "cf_job:ma_don_hang", values: ["ĐH2610-0001"] }
    ]);
    expect(customFieldFilterValues(next.filters, "cf_job:ma_don_hang")).toEqual(["ĐH2610-0001"]);
    expect(activeFilterCount(next.filters)).toBe(2);
    expect(ReportConfigSchema.safeParse(next).success).toBe(true);
    next = withCustomFieldFilter(next, "cf_user:nang_luc", []);
    next = withCustomFieldFilter(next, "cf_job:ma_don_hang", []);
    expect(next.filters.customFields).toBeUndefined();
  });

  it("offers the field's options plus 'Chưa có'; text fields only 'Chưa có'", () => {
    expect(customFieldFilterOptions(skill).map((option) => [option.id, option.label])).toEqual([
      ["a_plus_plus", "A++"],
      ["a", "A"],
      ["b", "B"],
      ["__empty__", "Chưa có"]
    ]);
    expect(customFieldFilterOptions(orderNo).map((option) => option.id)).toEqual(["__empty__"]);
  });

  it("strips members' fields (dimensions and filters) from a config opened by a Leader", () => {
    const admin = config({
      dimensions: ["cf_user:nang_luc", "month"],
      measures: ["points"],
      filters: {
        customFields: [
          { field: "cf_user:nang_luc", values: ["a"] },
          { field: "cf_job:uu_tien", values: ["gap"] }
        ]
      },
      view: { type: "PIVOT", rows: ["cf_user:nang_luc"], columns: ["month"] }
    });
    const result = sanitizeForRole(admin, false);
    expect(result.removedFields).toEqual(["cf_user:nang_luc"]);
    expect(result.config.dimensions).toEqual(["month"]);
    expect(result.config.filters.customFields).toEqual([
      { field: "cf_job:uu_tien", values: ["gap"] }
    ]);
    expect(ReportConfigSchema.safeParse(result.config).success).toBe(true);
    expect(sanitizeForRole(admin, true)).toEqual({ config: admin, removed: [], removedFields: [] });
  });

  it("explains the private-scores rule inline (PR-11) instead of a 403", () => {
    const leader = { isAdmin: false, scoresPublic: false };
    const byPriority = config({ dimensions: ["cf_job:uu_tien"], measures: ["points"] });
    expect(privacyProblem(byPriority, leader)).toContain("trường tùy chỉnh của job/task");
    expect(privacyProblem(byPriority, { isAdmin: false, scoresPublic: true })).toBeNull();
    expect(privacyProblem(byPriority, { isAdmin: true, scoresPublic: false })).toBeNull();
    // Images or task counts are not personal points; client fields are always allowed.
    expect(
      privacyProblem(config({ dimensions: ["cf_job:uu_tien"], measures: ["qty_done"] }), leader)
    ).toBeNull();
    expect(
      privacyProblem(config({ dimensions: ["cf_client:kenh"], measures: ["points"] }), leader)
    ).toBeNull();
    expect(
      privacyProblem(
        config({
          dimensions: ["team"],
          measures: ["points_khoan"],
          filters: { customFields: [{ field: "cf_task:do_kho", values: ["kho"] }] }
        }),
        leader
      )
    ).not.toBeNull();
    expect(
      privacyProblem(config({ dimensions: ["user"], measures: ["points"] }), leader)
    ).toContain("chiều Nhân viên");
  });
});

describe("multi-value pivots", () => {
  // Retouch + Chỉnh màu: NV A has both, so A's 10 points appear under both options (server totals: 15).
  const result = {
    rows: [
      {
        "cf_user:chuyen_mon": "retouch",
        "cf_user:chuyen_mon_label": "Retouch",
        month: "2026-09",
        points: 10
      },
      {
        "cf_user:chuyen_mon": "color",
        "cf_user:chuyen_mon_label": "Chỉnh màu",
        month: "2026-09",
        points: 10
      },
      {
        "cf_user:chuyen_mon": "color",
        "cf_user:chuyen_mon_label": "Chỉnh màu",
        month: "2026-10",
        points: 5
      },
      {
        "cf_user:chuyen_mon": null,
        "cf_user:chuyen_mon_label": "Chưa có",
        month: "2026-10",
        points: 2
      }
    ],
    totals: { points: 17 }
  };
  const multi = new Set(["cf_user:chuyen_mon"]);

  it("leaves the totals across options empty and keeps the server grand total", () => {
    const byRows = buildPivot(result, ["cf_user:chuyen_mon"], ["month"], ["points"], multi);
    expect(byRows.unsummed).toEqual({ rowTotals: false, groupTotals: true });
    expect(byRows.groupTotals.get(cellKey("2026-09", "points"))).toBeNull();
    expect(byRows.rows.find((row) => row.key === "color")?.total.get("points")).toBe(15);
    expect(byRows.grandTotals.get("points")).toBe(17);
    expect(byRows.rows.map((row) => row.labels[0])).toContain("Chưa có");

    const byColumns = buildPivot(result, ["month"], ["cf_user:chuyen_mon"], ["points"], multi);
    expect(byColumns.unsummed).toEqual({ rowTotals: true, groupTotals: false });
    expect(byColumns.rows[0]?.total.get("points")).toBeNull();
    expect(byColumns.groupTotals.get(cellKey("color", "points"))).toBe(15);
  });

  it("sums normally without multi-value dimensions", () => {
    const plain = buildPivot(result, ["cf_user:chuyen_mon"], ["month"], ["points"]);
    expect(plain.unsummed).toEqual({ rowTotals: false, groupTotals: false });
    expect(plain.groupTotals.get(cellKey("2026-09", "points"))).toBe(20);
  });
});

describe("report templates", () => {
  const today = "2026-10-11";

  it("computes recent ranges from today", () => {
    expect(monthStart(today, 5)).toBe("2026-05-01");
    expect(monthStart("2026-02-15", 3)).toBe("2025-11-01");
    expect(weekStart(today)).toBe("2026-10-05");
    expect(weekStart(today, 7)).toBe("2026-08-17");
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
  });

  it("builds valid configs, OT hours per person per month first", () => {
    const catalog = fieldCatalog(all);
    for (const template of reportTemplates) {
      const built = template.build({ today, catalog });
      expect(built, template.id).not.toBeNull();
      expect(ReportConfigSchema.safeParse(built).success, template.id).toBe(true);
    }
    const ot = reportTemplates[0]!.build({ today, catalog })!;
    expect(ot.measures).toEqual(["ot_hours"]);
    expect(ot.dimensions).toEqual(["user", "month"]);
    expect(zonesFromConfig(ot)).toEqual({
      rows: ["user"],
      columns: ["month"],
      values: ["ot_hours"]
    });
    expect([ot.from, ot.to]).toEqual(["2026-05-01", today]);
  });

  it("offers the Năng lực template to Admins only and only when the field exists", () => {
    const ids = (isAdmin: boolean, fields: CustomField[]) =>
      availableTemplates({ today, isAdmin, catalog: fieldCatalog(fields) }).map(
        ({ template }) => template.id
      );
    expect(ids(true, all)).toContain("points-by-skill");
    expect(ids(false, all)).not.toContain("points-by-skill");
    expect(ids(true, [priority])).not.toContain("points-by-skill");
    expect(ids(false, [])).toEqual([
      "ot-hours-by-user-month",
      "team-points-weekly",
      "fb-rate-by-client"
    ]);
  });
});
