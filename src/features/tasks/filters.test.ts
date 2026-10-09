import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  clearTaskFilters,
  defaultTaskFilters,
  dueWindow,
  filtersToQuery,
  hasNarrowingFilters,
  parseTaskFilters,
  writeTaskFilters
} from "./filters";

const statusA = "6e1fd206-f55c-411f-9756-6a616fb0af7e";
const userA = "abd2e594-6195-41d0-8be0-c8284c8de186";

describe("parseTaskFilters", () => {
  it("returns defaults for an empty URL", () => {
    expect(parseTaskFilters(new URLSearchParams())).toEqual(defaultTaskFilters);
  });

  it("parses every filter and ignores malformed values", () => {
    const filters = parseTaskFilters(
      new URLSearchParams(
        `q=thiết kế&status=${statusA},nope&assignee=me,none,${userA},bad&priority=urgent,x,high&due=week&done=0&sort=dueAt&order=desc&view=board`
      )
    );
    expect(filters).toEqual({
      q: "thiết kế",
      statusIds: [statusA],
      assigneeIds: ["me", "none", userA],
      priorities: ["urgent", "high"],
      due: "week",
      includeDone: false,
      sort: "dueAt",
      order: "desc"
    });
  });

  it("falls back on unknown enums", () => {
    const filters = parseTaskFilters(new URLSearchParams("due=yesterday&sort=random&order=sideways"));
    expect(filters.due).toBeNull();
    expect(filters.sort).toBe("rank");
    expect(filters.order).toBe("asc");
  });
});

describe("writeTaskFilters", () => {
  it("round-trips through the URL and keeps unrelated params", () => {
    const current = new URLSearchParams("view=table&task=123");
    const filters = {
      ...defaultTaskFilters,
      q: " báo cáo ",
      assigneeIds: ["me"],
      priorities: ["low" as const],
      due: "overdue" as const,
      includeDone: false,
      sort: "priority" as const,
      order: "desc" as const
    };
    const written = writeTaskFilters(current, filters);
    expect(written.get("view")).toBe("table");
    expect(written.get("task")).toBe("123");
    expect(written.get("q")).toBe("báo cáo");
    expect(written.get("done")).toBe("0");
    expect(parseTaskFilters(written)).toEqual({ ...filters, q: "báo cáo" });
  });

  it("omits defaults so clean views have clean URLs", () => {
    const written = writeTaskFilters(new URLSearchParams("q=x&order=desc"), { ...defaultTaskFilters, order: "desc" });
    expect(written.toString()).toBe("");
  });

  it("clears only filter params", () => {
    expect(clearTaskFilters(new URLSearchParams("q=a&due=today&view=board")).toString()).toBe("view=board");
  });
});

describe("due windows", () => {
  // Friday 9 Oct 2026, 15:30 local time.
  const now = new Date(2026, 9, 9, 15, 30);

  it("computes today in the browser timezone", () => {
    const window = dueWindow("today", now);
    expect(new Date(window.dueFrom ?? "")).toEqual(new Date(2026, 9, 9));
    expect(new Date(window.dueTo ?? "")).toEqual(new Date(2026, 9, 10));
  });

  it("computes this week from Monday", () => {
    const window = dueWindow("week", now);
    expect(new Date(window.dueFrom ?? "")).toEqual(new Date(2026, 9, 5));
    expect(new Date(window.dueTo ?? "")).toEqual(new Date(2026, 9, 12));
  });

  it("passes timezone-independent buckets through", () => {
    expect(dueWindow("overdue", now)).toEqual({ due: "overdue" });
    expect(dueWindow("none", now)).toEqual({ due: "none" });
    expect(dueWindow(null, now)).toEqual({});
  });
});

describe("filtersToQuery", () => {
  it("lists top-level tasks per group when only status filters are set", () => {
    const query = filtersToQuery({ ...defaultTaskFilters, statusIds: [statusA] }, { listId: "l1", view: "list" });
    expect(query).toMatchObject({ listId: "l1", parent: "root", includeDone: true });
    expect(query.statusIds).toBeUndefined();
  });

  it("switches to every level when narrowing filters are active", () => {
    const filters = { ...defaultTaskFilters, assigneeIds: ["me"] };
    expect(hasNarrowingFilters(filters)).toBe(true);
    expect(filtersToQuery(filters, { listId: "l1", view: "board" }).parent).toBeUndefined();
  });

  it("adds server sort and status filter for the table", () => {
    const query = filtersToQuery(
      { ...defaultTaskFilters, statusIds: [statusA], sort: "dueAt", order: "desc" },
      { listId: "l1", view: "table" }
    );
    expect(query).toMatchObject({ statusIds: [statusA], sort: "dueAt", order: "desc" });
  });

  it("counts active filters", () => {
    expect(activeFilterCount(defaultTaskFilters)).toBe(0);
    expect(activeFilterCount({ ...defaultTaskFilters, q: "a", due: "today", includeDone: false })).toBe(3);
  });
});
