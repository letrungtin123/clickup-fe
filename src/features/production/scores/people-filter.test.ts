import { describe, expect, it } from "vitest";

import { withCustomFieldFilters } from "@/contracts/production-catalog";
import { KpiReportQuerySchema } from "@/contracts/production-scores";

import {
  describePeopleFilter,
  emptyPeopleFilter,
  peopleFilterCount,
  peopleFilterFromParams,
  peopleFilterKey,
  peopleFilterPairs,
  searchWithPeopleFilter,
  toggleFieldValue,
  toggleTag,
  withPeopleFilterParams
} from "./people-filter";

const TAG_A = "00000000-0000-4000-8000-00000000000a";
const TAG_B = "00000000-0000-4000-8000-00000000000b";

describe("people filter", () => {
  it("toggles field values and tags", () => {
    let filter = toggleFieldValue(emptyPeopleFilter, "nang_luc", "a");
    filter = toggleFieldValue(filter, "nang_luc", "a_plus_plus");
    filter = toggleTag(filter, TAG_A);
    expect(filter).toEqual({
      tagIds: [TAG_A],
      fields: [{ key: "nang_luc", values: ["a", "a_plus_plus"] }]
    });
    expect(peopleFilterCount(filter)).toBe(3);
    filter = toggleFieldValue(toggleFieldValue(filter, "nang_luc", "a"), "nang_luc", "a_plus_plus");
    expect(filter.fields).toEqual([]);
  });

  it("sends repeated parameters the API parses (tagId list, cf.<key>)", () => {
    const filter = { tagIds: [TAG_B, TAG_A], fields: [{ key: "nang_luc", values: ["b", "a"] }] };
    expect(peopleFilterPairs(filter)).toEqual([
      ["tagId", TAG_A],
      ["tagId", TAG_B],
      ["cf.nang_luc", "a"],
      ["cf.nang_luc", "b"]
    ]);
    const search = searchWithPeopleFilter(
      { from: "2026-08", to: "2026-10", teamId: undefined },
      filter
    );
    expect(search).toBe(
      `?from=2026-08&to=2026-10&tagId=${TAG_A}&tagId=${TAG_B}&cf.nang_luc=a&cf.nang_luc=b`
    );
    // What the server does with it (express gives repeated parameters as arrays).
    const params = new URLSearchParams(search);
    const query: Record<string, unknown> = {};
    for (const name of new Set(params.keys())) {
      const values = params.getAll(name);
      query[name] = values.length > 1 ? values : values[0];
    }
    expect(KpiReportQuerySchema.parse(withCustomFieldFilters(query))).toMatchObject({
      tagId: [TAG_A, TAG_B],
      cf: [{ key: "nang_luc", values: ["a", "b"] }]
    });
    expect(searchWithPeopleFilter({ period: null }, emptyPeopleFilter)).toBe("");
    expect(peopleFilterKey(filter)).toBe(peopleFilterKey({ ...filter, tagIds: [TAG_A, TAG_B] }));
  });

  it("round-trips through page search params", () => {
    const filter = { tagIds: [TAG_A], fields: [{ key: "nang_luc", values: ["a", "__empty__"] }] };
    const params = withPeopleFilterParams(new URLSearchParams("period=2026-09&tag=old"), filter);
    expect(params.get("period")).toBe("2026-09");
    expect(peopleFilterFromParams(params)).toEqual(filter);
    expect(peopleFilterFromParams(withPeopleFilterParams(params, emptyPeopleFilter))).toEqual(
      emptyPeopleFilter
    );
    expect(peopleFilterFromParams(new URLSearchParams("cf.Bad-Key=x&tag=nope"))).toEqual(
      emptyPeopleFilter
    );
  });

  it("describes the filter in words", () => {
    const text = describePeopleFilter(
      { tagIds: [TAG_A], fields: [{ key: "nang_luc", values: ["a_plus_plus", "__empty__"] }] },
      {
        fields: [
          {
            id: TAG_B,
            entity: "USER",
            key: "nang_luc",
            label: "Năng lực",
            type: "SELECT",
            options: [{ value: "a_plus_plus", label: "A++" }],
            required: false,
            showInTable: true,
            sortOrder: 0,
            active: true
          }
        ],
        tagName: (id) => (id === TAG_A ? "Kiêm QC" : undefined)
      }
    );
    expect(text).toBe("Năng lực: A++, Chưa có · Tag: Kiêm QC");
  });
});
