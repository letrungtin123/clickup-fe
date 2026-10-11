import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  emptyFilters,
  knowledgeQueryString,
  parseAuditFilters,
  parseSpaceFilters,
  toAuditQuery,
  toItemQuery,
  writeAuditFilters,
  writeSpaceFilters
} from "./filters";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

describe("space filters ⇄ URL", () => {
  it("parses and sanitizes every filter", () => {
    const filters = parseSpaceFilters(
      new URLSearchParams(
        `cat=${id(1)}&status=${id(2)},bad,${id(2)}&group=active,nope&imp=critical,important&tag=a,b&owner=me&review=1&pinned=1&sort=title&q=quy trình`
      )
    );
    expect(filters).toEqual({
      category: id(1),
      statusIds: [id(2)],
      groups: ["active"],
      importance: ["critical", "important"],
      tags: ["a", "b"],
      owner: "me",
      reviewDue: true,
      pinned: true,
      sort: "title",
      q: "quy trình"
    });
    expect(parseSpaceFilters(new URLSearchParams("cat=xyz&owner=someone&sort=random"))).toEqual(emptyFilters());
    expect(parseSpaceFilters(new URLSearchParams("cat=none")).category).toBe("none");
  });

  it("writes only non-default values and keeps unrelated params", () => {
    const next = writeSpaceFilters(new URLSearchParams("dialog=new&q=old"), {
      ...emptyFilters(),
      importance: ["critical"],
      reviewDue: true
    });
    expect(next.toString()).toBe("dialog=new&imp=critical&review=1");
    expect(parseSpaceFilters(writeSpaceFilters(new URLSearchParams(), { ...emptyFilters(), tags: ["x"], sort: "importance" }))).toMatchObject({ tags: ["x"], sort: "importance" });
  });

  it("counts narrowing filters for the badge", () => {
    expect(activeFilterCount({ ...emptyFilters(), importance: ["critical", "important"], owner: "me", pinned: true })).toBe(4);
    expect(activeFilterCount({ ...emptyFilters(), q: "abc", category: id(1) })).toBe(0);
  });
});

describe("toItemQuery / knowledgeQueryString", () => {
  it("builds the canonical API query (sorted values, me → own id, defaults dropped)", () => {
    const query = toItemQuery(
      { ...emptyFilters(), statusIds: [id(3), id(2)], importance: ["important", "critical"], owner: "me", q: "  retouch ", category: "none" },
      { selfId: id(9) }
    );
    expect(query).toEqual({
      uncategorized: "true",
      statusId: [id(2), id(3)],
      importance: ["critical", "important"],
      ownerId: id(9),
      q: "retouch"
    });
    expect(toItemQuery(emptyFilters(), { selfId: id(9) })).toEqual({});
    expect(toItemQuery({ ...emptyFilters(), sort: "reviewBy" }, { selfId: id(9), limit: 20 })).toEqual({ sort: "reviewBy", limit: 20 });
  });

  it("serializes arrays as repeated parameters in a stable order", () => {
    expect(knowledgeQueryString({ tag: ["b", "a"], q: "quy trình", limit: 30, empty: "", missing: undefined })).toBe(
      "?limit=30&q=quy+tr%C3%ACnh&tag=b&tag=a"
    );
    expect(knowledgeQueryString({})).toBe("");
    expect(knowledgeQueryString(undefined)).toBe("");
  });
});

describe("audit filters", () => {
  it("round-trips through the URL and builds the API query with local day bounds", () => {
    const filters = parseAuditFilters(new URLSearchParams(`actor=${id(1)}&action=ITEM_CREATED,BOGUS&from=2026-10-01&to=2026-10-11&item=nope`));
    expect(filters).toEqual({ actorId: id(1), actions: ["ITEM_CREATED"], itemId: null, from: "2026-10-01", to: "2026-10-11" });
    expect(writeAuditFilters(new URLSearchParams(), filters).toString()).toBe(`actor=${id(1)}&action=ITEM_CREATED&from=2026-10-01&to=2026-10-11`);
    const query = toAuditQuery(filters);
    expect(query.actorId).toBe(id(1));
    expect(query.action).toEqual(["ITEM_CREATED"]);
    expect(new Date(String(query.from)).getDate()).toBe(1);
    // "to" is inclusive: the bound is the next local midnight.
    expect(new Date(String(query.to)).getDate()).toBe(12);
  });
});
