import { describe, expect, it } from "vitest";

import {
  activeMyTaskFilterCount,
  emptyMyTaskFilters,
  matchingPreset,
  myTaskFiltersFromSearch,
  myTaskFiltersToQuery,
  myTaskFiltersToSearch,
  rangeLabel,
  rangePresets
} from "./my-task-filters";

// PD-068 — "Việc của tôi" search and date range in the URL.
const params = (search: string) => new URLSearchParams(search);

describe("URL state", () => {
  it("reads search, basis and days; a reversed range is put in order, impossible days are dropped", () => {
    expect(
      myTaskFiltersFromSearch(params("q=1286&dateBy=deadline&from=2026-10-01&to=2026-10-31"))
    ).toEqual({
      q: "1286",
      range: { by: "deadline", from: "2026-10-01", to: "2026-10-31" }
    });
    expect(myTaskFiltersFromSearch(params("from=2026-10-31&to=2026-10-01")).range).toEqual({
      by: "received",
      from: "2026-10-01",
      to: "2026-10-31"
    });
    expect(myTaskFiltersFromSearch(params("from=2026-02-31&to=31/10/2026&dateBy=x")).range).toEqual(
      {
        by: "received",
        from: null,
        to: null
      }
    );
    expect(myTaskFiltersFromSearch(params("")).q).toBe("");
  });

  it("writes only what is set and keeps the other parameters (tags, fields, the open task)", () => {
    const next = myTaskFiltersToSearch(
      { q: "  ghép nền ", range: { by: "deadline", from: "2026-10-01", to: null } },
      params("tag=a&cf.size=L&ptask=t1&q=old&to=2026-12-01")
    );
    expect(next.toString()).toBe(
      "tag=a&cf.size=L&ptask=t1&q=gh%C3%A9p+n%E1%BB%81n&dateBy=deadline&from=2026-10-01"
    );
    expect(myTaskFiltersToSearch(emptyMyTaskFilters, next).toString()).toBe(
      "tag=a&cf.size=L&ptask=t1"
    );
  });

  it("API query: only the set values; the basis only with a day", () => {
    expect(myTaskFiltersToQuery(emptyMyTaskFilters)).toEqual({});
    expect(
      myTaskFiltersToQuery({ q: "", range: { by: "deadline", from: null, to: null } })
    ).toEqual({});
    expect(
      myTaskFiltersToQuery({
        q: " #1286 ",
        range: { by: "received", from: "2026-10-01", to: "2026-10-01" }
      })
    ).toEqual({
      q: "#1286",
      dateBy: "received",
      from: "2026-10-01",
      to: "2026-10-01"
    });
  });

  it("search and dates count one each", () => {
    expect(activeMyTaskFilterCount(emptyMyTaskFilters)).toBe(0);
    expect(
      activeMyTaskFilterCount({ q: "x", range: { by: "received", from: null, to: "2026-10-01" } })
    ).toBe(2);
  });
});

describe("presets and labels", () => {
  it("Hôm nay · Tuần này (Monday – Sunday) · Tháng này · Tháng trước", () => {
    // Monday 19 October 2026.
    expect(
      rangePresets("2026-10-19").map((preset) => [preset.key, preset.from, preset.to])
    ).toEqual([
      ["today", "2026-10-19", "2026-10-19"],
      ["week", "2026-10-19", "2026-10-25"],
      ["month", "2026-10-01", "2026-10-31"],
      ["lastMonth", "2026-09-01", "2026-09-30"]
    ]);
    // A Sunday belongs to the week that started on Monday; January's previous month is last year's December.
    const sunday = rangePresets("2027-01-03");
    expect(sunday[1]).toMatchObject({ from: "2026-12-28", to: "2027-01-03" });
    expect(sunday[3]).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
    expect(rangePresets("2028-03-10")[3]).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("labels the trigger by basis: preset name, a range, one day, one bound; the year only when it is not this one", () => {
    const today = "2026-10-19";
    expect(rangeLabel({ by: "received", from: null, to: null }, today)).toBeNull();
    expect(rangeLabel({ by: "received", from: "2026-10-01", to: "2026-10-31" }, today)).toBe(
      "Nhận · tháng này"
    );
    expect(rangeLabel({ by: "deadline", from: "2026-10-02", to: "2026-10-05" }, today)).toBe(
      "Giao 02/10 – 05/10"
    );
    expect(rangeLabel({ by: "deadline", from: "2026-10-05", to: "2026-10-05" }, today)).toBe(
      "Giao 05/10"
    );
    expect(rangeLabel({ by: "received", from: "2025-12-30", to: null }, today)).toBe(
      "Nhận từ 30/12/2025"
    );
    expect(rangeLabel({ by: "received", from: null, to: "2026-10-09" }, today)).toBe(
      "Nhận đến 09/10"
    );
    expect(
      matchingPreset({ by: "deadline", from: "2026-10-19", to: "2026-10-19" }, today)?.key
    ).toBe("today");
  });
});
