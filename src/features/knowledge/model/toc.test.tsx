// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RichTextView } from "@/components/shared/rich-text/rich-text-view";
import type { RichTextDoc } from "@/contracts/rich-text";

import { activeTocId, extractToc, headingAnchorId, tocDepths } from "./toc";

const heading = (level: number, text: string) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }]
});

const body: RichTextDoc = {
  type: "doc",
  content: [
    heading(1, "Giới thiệu"),
    { type: "paragraph", content: [{ type: "text", text: "Nội dung" }] },
    heading(2, "Bước 1"),
    heading(3, "  Chi   tiết "),
    heading(2, ""),
    { type: "blockquote", content: [heading(2, "Trong trích dẫn")] },
    heading(2, "Bước 1")
  ]
};

describe("extractToc", () => {
  it("lists non-empty headings in order with path-based ids", () => {
    expect(extractToc(body)).toEqual([
      { id: "kb-h-0", level: 1, text: "Giới thiệu" },
      { id: "kb-h-2", level: 2, text: "Bước 1" },
      { id: "kb-h-3", level: 3, text: "Chi tiết" },
      { id: "kb-h-5-0", level: 2, text: "Trong trích dẫn" },
      { id: "kb-h-6", level: 2, text: "Bước 1" }
    ]);
  });

  it("can drop deep levels and handles empty documents", () => {
    expect(extractToc(body, "x", 2).map((entry) => entry.id)).toEqual(["x-0", "x-2", "x-5-0", "x-6"]);
    expect(extractToc(null)).toEqual([]);
    expect(extractToc({ type: "doc" })).toEqual([]);
  });

  it("produces the ids RichTextView renders on headings", () => {
    const { container } = render(<RichTextView doc={body} headingIdPrefix="kb-h" />);
    const rendered = [...container.querySelectorAll("h1, h2, h3")].map((element) => element.id).filter(Boolean);
    for (const entry of extractToc(body)) expect(rendered).toContain(entry.id);
    expect(headingAnchorId("p", "n.4.1")).toBe("p-4-1");
  });
});

describe("tocDepths", () => {
  it("indents relative to the shallowest heading", () => {
    expect(tocDepths([
      { id: "a", level: 2, text: "A" },
      { id: "b", level: 3, text: "B" },
      { id: "c", level: 2, text: "C" }
    ])).toEqual([0, 1, 0]);
  });
});

describe("activeTocId", () => {
  const entries = [
    { id: "a", level: 2 as const, text: "A" },
    { id: "b", level: 2 as const, text: "B" },
    { id: "c", level: 2 as const, text: "C" }
  ];
  const offsets = new Map([
    ["a", 0],
    ["b", 500],
    ["c", 1200]
  ]);

  it("follows the last heading scrolled past", () => {
    expect(activeTocId(entries, offsets, 0)).toBe("a");
    expect(activeTocId(entries, offsets, 450)).toBe("b");
    expect(activeTocId(entries, offsets, 5000)).toBe("c");
    expect(activeTocId([], offsets, 0)).toBeNull();
  });
});
