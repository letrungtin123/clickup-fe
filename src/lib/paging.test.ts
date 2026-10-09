import { describe, expect, it } from "vitest";

import { canAutoLoadNextPage, pagedErrorKind } from "./paging";

describe("pagedErrorKind", () => {
  it("only reports a full-screen error when nothing was loaded", () => {
    expect(pagedErrorKind({ isError: false, data: undefined, isFetchNextPageError: false })).toBe("none");
    expect(pagedErrorKind({ isError: true, data: undefined, isFetchNextPageError: false })).toBe("initial");
    expect(pagedErrorKind({ isError: true, data: { pages: [] }, isFetchNextPageError: true })).toBe("next");
    expect(pagedErrorKind({ isError: true, data: { pages: [] }, isFetchNextPageError: false })).toBe("refresh");
  });
});

describe("canAutoLoadNextPage", () => {
  it("stops auto-loading after a failed page until the user retries", () => {
    expect(canAutoLoadNextPage({ hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: false })).toBe(true);
    expect(canAutoLoadNextPage({ hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: true })).toBe(false);
    expect(canAutoLoadNextPage({ hasNextPage: true, isFetchingNextPage: true, isFetchNextPageError: false })).toBe(false);
    expect(canAutoLoadNextPage({ hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false })).toBe(false);
  });
});
