// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  clearAllDrafts,
  clearDraft,
  draftKey,
  parseDraft,
  readDraft,
  sameFields,
  sweepDrafts,
  writeDraft,
  type EditorFields
} from "./drafts";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

describe("local drafts", () => {
  const fields: EditorFields = {
    title: "Tiêu đề",
    summary: "",
    body: { type: "doc", content: [] },
    categoryId: null,
    importance: "critical",
    statusId: null,
    ownerId: null,
    effectiveFrom: null,
    reviewBy: "2026-12-01",
    tags: ["b", "a"]
  };

  it("round-trips through storage and expires old drafts", () => {
    const key = draftKey(id(1), { itemId: id(2) });
    expect(key).toContain(id(2));
    expect(writeDraft(key, { baseVersion: 3, fields, versionNote: "Sửa bước 3" })).toBe(true);
    expect(readDraft(key)).toMatchObject({ baseVersion: 3, versionNote: "Sửa bước 3", fields: { importance: "critical", tags: ["b", "a"] } });
    clearDraft(key);
    expect(readDraft(key)).toBeNull();
    expect(parseDraft(JSON.stringify({ fields, savedAt: 0 }), 40 * 24 * 60 * 60_000)).toBeNull();
    expect(parseDraft("not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ fields: { ...fields, body: "x" }, savedAt: Date.now() }))).toBeNull();
  });

  it("sweeps expired drafts and old conflict copies, and clears everything at sign-out", () => {
    const day = 24 * 60 * 60_000;
    const now = Date.now();
    const fresh = draftKey(id(1), { itemId: id(3) });
    const old = draftKey(id(1), { itemId: id(4) });
    writeDraft(fresh, { baseVersion: 1, fields, versionNote: "" }, now);
    writeDraft(`${fresh}:copy`, { baseVersion: 1, fields, versionNote: "" }, now - 2 * day);
    writeDraft(old, { baseVersion: 1, fields, versionNote: "" }, now - 31 * day);
    window.localStorage.setItem("other-feature", "kept");
    expect(sweepDrafts(now)).toBe(2);
    expect(readDraft(fresh)).not.toBeNull();
    expect(window.localStorage.getItem(`${fresh}:copy`)).toBeNull();
    expect(window.localStorage.getItem(old)).toBeNull();
    clearAllDrafts();
    expect(window.localStorage.getItem(fresh)).toBeNull();
    expect(window.localStorage.getItem("other-feature")).toBe("kept");
  });

  it("compares fields ignoring surrounding whitespace and tag order", () => {
    expect(sameFields(fields, { ...fields, title: " Tiêu đề ", tags: ["a", "b"] })).toBe(true);
    expect(sameFields(fields, { ...fields, importance: "normal" })).toBe(false);
  });
});
