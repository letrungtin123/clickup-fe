// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { notifySessionEnd } from "@/lib/session-cleanup";

import { commentDraftKey, commentDraftStore } from "./local-state";
import { draftKey, readDraft, writeDraft, type EditorFields } from "./model/drafts";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const doc = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Góp ý" }] }] };
const fields: EditorFields = {
  title: "Mục",
  summary: "",
  body: { type: "doc", content: [] },
  categoryId: null,
  importance: "normal",
  statusId: null,
  ownerId: null,
  effectiveFrom: null,
  reviewBy: null,
  tags: []
};

describe("knowledge local state", () => {
  it("keys unsent comments by user, so another account never sees them", () => {
    commentDraftStore.set(commentDraftKey(id(1), id(9)), doc);
    expect(commentDraftStore.get(commentDraftKey(id(1), id(9)))).toEqual(doc);
    expect(commentDraftStore.get(commentDraftKey(id(2), id(9)))).toBeNull();
    expect(commentDraftKey(id(1), id(9), id(7))).not.toBe(commentDraftKey(id(1), id(9)));
  });

  it("drops comments when the session ends and local item drafts only at an explicit sign-out", () => {
    const itemDraft = draftKey(id(1), { itemId: id(9) });
    writeDraft(itemDraft, { baseVersion: 1, fields, versionNote: "" });
    commentDraftStore.set(commentDraftKey(id(1), id(9)), doc);

    notifySessionEnd("ended");
    expect(commentDraftStore.get(commentDraftKey(id(1), id(9)))).toBeNull();
    expect(readDraft(itemDraft)).not.toBeNull();

    notifySessionEnd("signed-out");
    expect(readDraft(itemDraft)).toBeNull();
  });
});
