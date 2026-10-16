import { describe, expect, it } from "vitest";

import { MENTION_ALL_ID, messageLimits, sanitizeRichText, type RichTextDoc } from "@/contracts/rich-text";

import {
  docMentions,
  docMentionsAll,
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

describe("@all mentions (PD-061, mirror of the server sanitizer)", () => {
  const withAll = (attrs: Record<string, string>): RichTextDoc => ({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "mention", attrs },
          { type: "text", text: " họp lúc 3 giờ " },
          { type: "mention", attrs: { id: mentionId, label: "Linh Trần" } }
        ]
      }
    ]
  });

  it("keeps the @all node (label always \"all\") where allowed; mentions stay user ids only", () => {
    const result = sanitizeRichText(withAll({ id: "all", label: "Everyone!" }), messageLimits, { allowMentionAll: true });
    expect(MENTION_ALL_ID).toBe("all");
    expect(result.doc.content?.[0]?.content?.[0]).toEqual({ type: "mention", attrs: { id: "all", label: "all" } });
    expect(result.mentionsAll).toBe(true);
    expect(result.mentions).toEqual([mentionId]);
    expect(result.text).toBe("@all họp lúc 3 giờ @Linh Trần");
  });

  it("turns @all into the plain text \"@all\" where it is not allowed (1:1 DMs, tasks, knowledge)", () => {
    const result = sanitizeRichText(withAll({ id: "all", label: "all" }), messageLimits);
    expect(result.doc.content?.[0]?.content?.[0]).toEqual({ type: "text", text: "@all" });
    expect(result.mentionsAll).toBe(false);
    expect(result.mentions).toEqual([mentionId]);
    expect(result.text).toBe("@all họp lúc 3 giờ @Linh Trần");
  });

  it("is not a person: server labels never apply and it does not count as a mention", () => {
    const labels = new Map([[mentionId, "Linh T."]]);
    const result = sanitizeRichText(withAll({ id: "all", label: "x" }), { ...messageLimits, maxMentions: 1 }, {
      allowMentionAll: true,
      mentionLabels: labels
    });
    expect(result.text).toBe("@all họp lúc 3 giờ @Linh T.");
    expect(result.mentions).toEqual([mentionId]);
    // Any other id ("ALL", "everyone") is not @all: dropped like any invalid mention.
    expect(sanitizeRichText(withAll({ id: "ALL", label: "all" }), messageLimits, { allowMentionAll: true }).mentionsAll).toBe(false);
  });

  it("prepareDoc keeps @all only with allowMentionAll; docMentionsAll / docMentions read documents", () => {
    const doc = withAll({ id: "all", label: "all" });
    const kept = prepareDoc(doc, "message", { allowMentionAll: true });
    expect(kept.ok && kept.mentionsAll).toBe(true);
    expect(kept.ok && docMentionsAll(kept.doc)).toBe(true);
    const dropped = prepareDoc(doc, "message");
    expect(dropped.ok && dropped.mentionsAll).toBe(false);
    expect(dropped.ok && docMentionsAll(dropped.doc)).toBe(false);
    expect(docMentions(doc)).toEqual([mentionId]);
    expect(docMentionsAll(sample)).toBe(false);
    expect(docMentionsAll(null)).toBe(false);
    expect(docToPlainText(doc)).toBe("@all họp lúc 3 giờ @Linh Trần");
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

describe("editor output vs. the structural sanitizer", () => {
  it("keeps Tiptap-shaped lists, task items, quotes and code blocks unchanged", () => {
    const editorDoc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Một" }] },
                {
                  type: "orderedList",
                  attrs: { start: 1 },
                  content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Lồng" }] }] }]
                }
              ]
            }
          ]
        },
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Xong" }] }] },
            { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph" }] }
          ]
        },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Trích" }] }] },
        { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "const a = 1;" }] },
        { type: "paragraph" }
      ]
    };
    const prepared = prepareDoc(editorDoc, "description");
    expect(prepared.ok && prepared.doc).toEqual(editorDoc);
  });
});
