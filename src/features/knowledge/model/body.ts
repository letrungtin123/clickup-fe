import {
  knowledgeBodySpec,
  RichTextError,
  sanitizeKnowledgeBody,
  type RichTextDoc,
  type RichTextNode
} from "@/contracts/rich-text";
import { asRichTextDoc, type RichTextDocLike } from "@/components/shared/rich-text/helpers";

/**
 * Knowledge item bodies use the shared rich text plus two blocks only knowledge has (owner decision,
 * 2026-10-11): tables and images — the "knowledge" profile of contracts/rich-text.ts
 * (sanitizeKnowledgeBody, knowledgeBodySpec). Running it locally means what we send is what the server
 * keeps; images never store a URL ({ attachmentId, alt, width }; the signed URL is resolved at runtime).
 */

export const knowledgeTableLimits = {
  rows: knowledgeBodySpec.maxRows,
  columns: knowledgeBodySpec.maxColumns,
  span: knowledgeBodySpec.maxSpan
} as const;

/** Narrowest table column (px) a writer can drag to; the reading view applies the same floor. */
export const knowledgeCellMinWidth = 80;

/** Shown when the writer reaches a table limit (same wording as the server). */
export const knowledgeTableLimitMessages = {
  rows: `Mỗi bảng có tối đa ${knowledgeTableLimits.rows} hàng.`,
  columns: `Mỗi bảng có tối đa ${knowledgeTableLimits.columns} cột.`
} as const;

export type PreparedBody = { ok: true; doc: RichTextDoc } | { ok: false; message: string };

/** Knowledge body as the server will store it, or why it cannot be sent. */
export const prepareKnowledgeBody = (input: RichTextDocLike | null | undefined): PreparedBody => {
  const doc = asRichTextDoc(input) ?? { type: "doc", content: [] };
  try {
    return { ok: true, doc: sanitizeKnowledgeBody(doc).doc };
  } catch (error) {
    if (error instanceof RichTextError) {
      // The knowledge limits (tables, rows, columns, images) come with a Vietnamese message; the rest is generic.
      const message = /^(Nội dung có tối đa|Mỗi bảng)/.test(error.message) ? error.message : "Nội dung quá dài hoặc quá phức tạp.";
      return { ok: false, message };
    }
    throw error;
  }
};

const inlineText = (nodes: readonly RichTextNode[] | undefined): string =>
  (nodes ?? [])
    .map((node) => {
      if (node.type === "text") return node.text ?? "";
      if (node.type === "hardBreak") return " ";
      if (node.type === "mention") {
        const label = node.attrs?.label;
        return `@${typeof label === "string" ? label : ""}`;
      }
      return inlineText(node.content);
    })
    .join("");

/** "[Ảnh: alt]" — how an image reads in plain text, diffs and copies. */
export const imageText = (node: Pick<RichTextNode, "attrs">) => {
  const alt = node.attrs?.alt;
  return `[Ảnh${typeof alt === "string" && alt.trim() ? `: ${alt.trim()}` : ""}]`;
};

/** Text of one table cell (its blocks joined by spaces). */
export const cellText = (cell: RichTextNode): string =>
  (cell.content ?? [])
    .map((block) => (block.type === "image" ? imageText(block) : block.content ? cellText(block) || inlineText(block.content) : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** One line per table row: "a | b | c". */
export const tableRowsText = (table: RichTextNode) =>
  (table.content ?? []).map((row) => (row.content ?? []).map(cellText).join(" | "));

/** Plain text of a knowledge body: blocks on their own lines, tables row by row, images as "[Ảnh: …]". */
export const knowledgeBodyText = (input: RichTextDocLike | null | undefined): string => {
  const doc = asRichTextDoc(input);
  const lines: string[] = [];
  const visit = (nodes: readonly RichTextNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === "table") lines.push(...tableRowsText(node));
      else if (node.type === "image") lines.push(imageText(node));
      else if (node.type === "paragraph" || node.type === "heading") lines.push(inlineText(node.content));
      else if (node.type === "codeBlock") lines.push((node.content ?? []).map((child) => child.text ?? "").join(""));
      else visit(node.content);
    }
  };
  visit(doc?.content);
  return lines
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/** Attachment ids of the images placed in the body (document order, unique). */
export const bodyImageIds = (input: RichTextDocLike | null | undefined): string[] => {
  const ids: string[] = [];
  const visit = (nodes: readonly RichTextNode[] | undefined) => {
    for (const node of nodes ?? []) {
      const id = node.type === "image" ? node.attrs?.attachmentId : null;
      if (typeof id === "string" && !ids.includes(id)) ids.push(id);
      visit(node.content);
    }
  };
  visit(asRichTextDoc(input)?.content);
  return ids;
};
