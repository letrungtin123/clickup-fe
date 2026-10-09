import { describe, expect, it } from "vitest";

import type { RichTextDoc } from "@/contracts/rich-text";

import {
  docMentions,
  docsEqual,
  docToPlainText,
  isEmptyDoc,
  normalizeHref,
  plainTextToDoc,
  prepareDoc
} from "./helpers";

const mentionId = "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b";

const sample: RichTextDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Mục tiêu" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Nhờ " },
        { type: "mention", attrs: { id: mentionId, label: "Linh Trần", mentionSuggestionChar: "@" } },
        { type: "text", text: " xem", marks: [{ type: "bold" }] },
        { type: "hardBreak" },
        { type: "text", text: "dòng 2" }
      ]
    },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "một" }] }] }]
    }
  ]
};

describe("docToPlainText", () => {
  it("derives text with mentions, hard breaks and block separators", () => {
    expect(docToPlainText(sample)).toBe("Mục tiêu\nNhờ @Linh Trần xem\ndòng 2\nmột");
  });

  it("handles empty and missing documents", () => {
    expect(docToPlainText(null)).toBe("");
    expect(docToPlainText({ type: "doc" })).toBe("");
  });
});

describe("isEmptyDoc", () => {
  it("treats whitespace-only paragraphs as empty", () => {
    expect(isEmptyDoc({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
    expect(
      isEmptyDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }] })
    ).toBe(true);
  });

  it("counts a lone mention as content", () => {
    expect(
      isEmptyDoc({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: mentionId, label: "A" } }] }]
      })
    ).toBe(false);
  });
});

describe("plainTextToDoc", () => {
  it("splits paragraphs on blank lines and keeps single newlines as hard breaks", () => {
    const doc = plainTextToDoc("Xin chào\nbạn\n\nĐoạn hai");
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]?.content?.map((node) => node.type)).toEqual(["text", "hardBreak", "text"]);
    expect(docToPlainText(doc)).toBe("Xin chào\nbạn\nĐoạn hai");
  });

  it("returns an empty document for blank input", () => {
    expect(plainTextToDoc("   ").content).toEqual([]);
  });
});

describe("prepareDoc", () => {
  it("drops attributes the server does not keep and lists mentions", () => {
    const prepared = prepareDoc(sample, "comment");
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const mention = prepared.doc.content?.[1]?.content?.[1];
    expect(mention).toEqual({ type: "mention", attrs: { id: mentionId, label: "Linh Trần" } });
    expect(prepared.mentions).toEqual([mentionId]);
  });

  it("rejects empty documents unless allowed", () => {
    expect(prepareDoc({ type: "doc", content: [] }, "comment")).toMatchObject({ ok: false, reason: "empty" });
    expect(prepareDoc({ type: "doc", content: [] }, "description", { allowEmpty: true }).ok).toBe(true);
  });

  it("strips unsafe links", () => {
    const prepared = prepareDoc(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }]
          }
        ]
      },
      "message"
    );
    expect(prepared.ok && prepared.doc.content?.[0]?.content?.[0]?.marks).toBeUndefined();
  });

  it("reports oversized documents", () => {
    const long = plainTextToDoc("a".repeat(10_001));
    expect(prepareDoc(long, "message")).toMatchObject({ ok: false, reason: "too-large" });
  });
});

describe("misc helpers", () => {
  it("collects mention ids once", () => {
    expect(docMentions(sample)).toEqual([mentionId]);
  });

  it("compares documents structurally and treats empty variants alike", () => {
    expect(docsEqual(sample, JSON.parse(JSON.stringify(sample)) as RichTextDoc)).toBe(true);
    expect(docsEqual(null, { type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
  });

  it("normalizes typed links", () => {
    expect(normalizeHref("nesso.vn/docs")).toBe("https://nesso.vn/docs");
    expect(normalizeHref("an@nesso.vn")).toBe("mailto:an@nesso.vn");
    expect(normalizeHref("https://x.io")).toBe("https://x.io");
    expect(normalizeHref("javascript:alert(1)")).toBeNull();
  });
});
