import { describe, expect, it } from "vitest";

import type { CustomField } from "@/contracts/production-catalog";

import {
  activeListFilterCount,
  describeFieldFilter,
  emptyListFilters,
  listFiltersFromSearch,
  listFiltersToQuery,
  listFiltersToSearch,
  queryPath,
  sanitizeListFilters,
  withFieldFilter
} from "./list-filters";

let seq = 0;
const field = (overrides: Partial<CustomField>): CustomField => ({
  id: `00000000-0000-4000-8000-${String((seq += 1)).padStart(12, "0")}`,
  entity: "JOB",
  key: "ma_don_hang",
  label: "Mã đơn hàng",
  type: "TEXT",
  options: [],
  required: false,
  showInTable: true,
  sortOrder: 0,
  active: true,
  ...overrides
});

const order = field({});
const priority = field({
  key: "uu_tien",
  label: "Ưu tiên",
  type: "SELECT",
  options: [
    { value: "gap", label: "Gấp" },
    { value: "rat_gap", label: "Rất gấp" }
  ]
});
const shotOn = field({ key: "ngay_chup", label: "Ngày chụp", type: "DATE" });
const sla = field({ key: "sla", label: "SLA", type: "NUMBER" });
const archived = field({ key: "cu", label: "Cũ", active: false });
const fields = [order, priority, shotOn, sla, archived];

const tagA = "11111111-1111-4111-8111-111111111111";
const tagB = "22222222-2222-4222-8222-222222222222";

describe("listFiltersFromSearch / listFiltersToSearch", () => {
  it("reads repeated tags and cf parameters, ignoring malformed ones", () => {
    const params = new URLSearchParams(
      `q=abc&tag=${tagA}&tag=${tagB}&tag=nope&cf.uu_tien=gap&cf.uu_tien=rat_gap&cf.uu_tien=gap` +
        "&cf.ngay_chup.from=2026-10-01&cf.ngay_chup.to=2026-10-31&cf.Bad=1&cf.ma_don_hang=%20&cf.a.b.c=1"
    );
    expect(listFiltersFromSearch(params)).toEqual({
      tagIds: [tagA, tagB],
      fields: {
        uu_tien: { values: ["gap", "rat_gap"], from: null, to: null },
        ngay_chup: { values: [], from: "2026-10-01", to: "2026-10-31" }
      }
    });
  });

  it("round-trips and keeps unrelated parameters", () => {
    const filters = {
      tagIds: [tagA],
      fields: {
        ma_don_hang: { values: ["ĐH26"], from: null, to: null },
        sla: { values: ["__empty__"], from: "2", to: null },
        uu_tien: { values: [], from: null, to: null }
      }
    };
    const params = listFiltersToSearch(
      filters,
      new URLSearchParams(`status=x&tag=${tagB}&cf.old=1`)
    );
    expect(params.getAll("tag")).toEqual([tagA]);
    expect(params.get("status")).toBe("x");
    expect(params.has("cf.old")).toBe(false);
    expect(params.has("cf.uu_tien")).toBe(false);
    expect(listFiltersFromSearch(params)).toEqual({
      tagIds: [tagA],
      fields: {
        ma_don_hang: { values: ["ĐH26"], from: null, to: null },
        sla: { values: ["__empty__"], from: "2", to: null }
      }
    });
  });

  it("uses another tag parameter name when asked", () => {
    const params = listFiltersToSearch({ tagIds: [tagA], fields: {} }, undefined, "tags");
    expect(params.toString()).toBe(`tags=${tagA}`);
    expect(listFiltersFromSearch(params, "tags").tagIds).toEqual([tagA]);
  });
});

describe("sanitizeListFilters", () => {
  it("keeps only what the API accepts for active fields", () => {
    const result = sanitizeListFilters(
      {
        tagIds: [tagA, tagB],
        fields: {
          uu_tien: { values: ["gap", "gone", "__empty__"], from: "1", to: null },
          ngay_chup: { values: ["2026-02-31", "2026-10-02"], from: "2026-10-01", to: "bad" },
          sla: { values: ["1,5", "x"], from: "abc", to: "10" },
          ma_don_hang: { values: ["__empty__"], from: null, to: null },
          cu: { values: ["x"], from: null, to: null },
          unknown: { values: ["x"], from: null, to: null }
        }
      },
      fields,
      new Set([tagB])
    );
    expect(result).toEqual({
      tagIds: [tagB],
      fields: {
        uu_tien: { values: ["gap", "__empty__"], from: null, to: null },
        ngay_chup: { values: ["2026-10-02"], from: "2026-10-01", to: null },
        sla: { values: ["1.5"], from: null, to: "10" },
        ma_don_hang: { values: ["__empty__"], from: null, to: null }
      }
    });
  });
});

describe("listFiltersToQuery / queryPath", () => {
  it("builds repeated API parameters", () => {
    const query = listFiltersToQuery({
      tagIds: [tagA, tagB],
      fields: {
        uu_tien: { values: ["gap", "rat_gap"], from: null, to: null },
        sla: { values: [], from: "2", to: "8" }
      }
    });
    expect(query).toEqual({
      tagId: [tagA, tagB],
      "cf.uu_tien": ["gap", "rat_gap"],
      "cf.sla.from": "2",
      "cf.sla.to": "8"
    });
    expect(queryPath("/production/jobs", { ...query, q: "a b", empty: "", none: undefined })).toBe(
      `/production/jobs?tagId=${tagA}&tagId=${tagB}&cf.uu_tien=gap&cf.uu_tien=rat_gap&cf.sla.from=2&cf.sla.to=8&q=a+b`
    );
    expect(queryPath("/production/clients", {})).toBe("/production/clients");
  });
});

describe("counts and summaries", () => {
  it("counts tags once and every active field", () => {
    expect(activeListFilterCount(emptyListFilters)).toBe(0);
    const next = withFieldFilter(
      withFieldFilter({ tagIds: [tagA, tagB], fields: {} }, "uu_tien", {
        values: ["gap"],
        from: null,
        to: null
      }),
      "sla",
      { values: [], from: null, to: null }
    );
    expect(activeListFilterCount(next)).toBe(2);
    expect(Object.keys(withFieldFilter(next, "uu_tien", null).fields)).toEqual([]);
  });

  it("describes a filter in Vietnamese", () => {
    expect(
      describeFieldFilter(priority, {
        values: ["gap", "rat_gap", "__empty__"],
        from: null,
        to: null
      })
    ).toBe("Gấp, Rất gấp, Chưa có");
    expect(describeFieldFilter(order, { values: ["ĐH26"], from: null, to: null })).toBe(
      "chứa “ĐH26”"
    );
    expect(describeFieldFilter(shotOn, { values: [], from: "2026-10-01", to: "2026-10-31" })).toBe(
      "01/10/2026 – 31/10/2026"
    );
    expect(describeFieldFilter(sla, { values: [], from: "1500", to: null })).toBe("từ 1.500");
  });
});
