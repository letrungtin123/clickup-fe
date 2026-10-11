import { describe, expect, it } from "vitest";

import type { RichTextDoc } from "@/contracts/rich-text";

import { bodyImageIds, knowledgeBodyText, knowledgeTableLimits, prepareKnowledgeBody } from "./body";
import { docToLines } from "./diff";
import { normalizeBody } from "./editor";
import { extractToc } from "./toc";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const cell = (type: "tableHeader" | "tableCell", text: string, attrs: Record<string, unknown> = {}) => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "left", ...attrs },
  content: [p(text)]
});
const table = (rows: object[][]) => ({ type: "table", content: rows.map((cells) => ({ type: "tableRow", content: cells })) });
const doc = (...content: object[]) => ({ type: "doc", content }) as RichTextDoc;

describe("prepareKnowledgeBody (contract \"knowledge\" profile)", () => {
  it("keeps tables (header cells, widths) and images (attachment only) next to regular blocks", () => {
    const prepared = prepareKnowledgeBody(
      doc(
        p("Trước bảng"),
        table([
          [cell("tableHeader", "Bước"), cell("tableHeader", "Mô tả", { colwidth: [180] })],
          [cell("tableCell", "1"), cell("tableCell", "Cân màu")]
        ]),
        { type: "image", attrs: { attachmentId: id(1).toUpperCase(), alt: "  Ảnh mẫu\u0007 ", width: 560.6, src: "https://evil.example/x.png", title: "x" } },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sau" }] }
      )
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const [first, tableNode, image, heading] = prepared.doc.content ?? [];
    expect(first).toEqual(p("Trước bảng"));
    expect(tableNode?.content?.[0]?.content?.[1]).toEqual({
      type: "tableHeader",
      attrs: { colspan: 1, rowspan: 1, colwidth: [180] },
      content: [p("Mô tả")]
    });
    // No URL is ever stored: only the attachment, the alt text and a whole-pixel width.
    expect(image?.type).toBe("image");
    expect(image?.attrs).toMatchObject({ attachmentId: id(1), alt: "Ảnh mẫu" });
    expect(image?.attrs && "src" in image.attrs).toBe(false);
    expect(heading?.type).toBe("heading");
  });

  it("drops images without an attachment and empty tables; fills empty cells", () => {
    const prepared = prepareKnowledgeBody(doc({ type: "image", attrs: { src: "https://example.com/a.png" } }, table([]), table([[{ type: "tableCell", content: [] }]])));
    expect(prepared.ok && prepared.doc.content).toEqual([
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: "paragraph" }] }] }] }
    ]);
  });

  it("refuses tables over the limits with a Vietnamese message", () => {
    const wide = Array.from({ length: 2 }, () => Array.from({ length: knowledgeTableLimits.columns + 1 }, () => cell("tableCell", "x")));
    expect(prepareKnowledgeBody(doc(table(wide)))).toEqual({ ok: false, message: `Mỗi bảng có tối đa ${knowledgeTableLimits.columns} cột.` });
    const tall = Array.from({ length: knowledgeTableLimits.rows + 1 }, () => [cell("tableCell", "x")]);
    expect(prepareKnowledgeBody(doc(table(tall)))).toEqual({ ok: false, message: `Mỗi bảng có tối đa ${knowledgeTableLimits.rows} hàng.` });
  });

  it("is what the editor compares and saves", () => {
    const body = doc(p("A"), { type: "image", attrs: { attachmentId: id(2), alt: null, width: null } });
    expect(normalizeBody(body)).toEqual(body);
  });
});

describe("plain text, diff lines and TOC with tables and images", () => {
  const body = doc(
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Bảng giá" }] },
    table([
      [cell("tableHeader", "Gói"), cell("tableHeader", "Giá")],
      [cell("tableCell", "Cơ bản"), cell("tableCell", "100k")]
    ]),
    { type: "image", attrs: { attachmentId: id(3), alt: "Sơ đồ", width: null } },
    { type: "image", attrs: { attachmentId: id(4), alt: null, width: null } }
  );

  it("reads tables row by row and images as [Ảnh: alt]", () => {
    expect(knowledgeBodyText(body)).toBe("Bảng giá\nGói | Giá\nCơ bản | 100k\n[Ảnh: Sơ đồ]\n[Ảnh]");
    expect(docToLines(body).map((line) => `${line.kind}:${line.text}`)).toEqual([
      "heading:Bảng giá",
      "table:Gói | Giá",
      "table:Cơ bản | 100k",
      "image:[Ảnh: Sơ đồ]",
      "image:[Ảnh]"
    ]);
    expect(bodyImageIds(body)).toEqual([id(3), id(4)]);
  });

  it("leaves table cells out of the table of contents", () => {
    const withHeadingInCell = doc(table([[{ type: "tableCell", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Trong ô" }] }] }]]));
    expect(extractToc(withHeadingInCell)).toEqual([]);
    expect(extractToc(body).map((entry) => entry.text)).toEqual(["Bảng giá"]);
  });
});
