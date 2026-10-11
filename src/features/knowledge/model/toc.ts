import {
  asRichTextDoc,
  headingAnchorId,
  type RichTextDocLike
} from "@/components/shared/rich-text/helpers";
import type { RichTextNode } from "@/contracts/rich-text";

/**
 * Automatic table of contents ("Mục lục") from the headings of an item body.
 *
 * Anchor ids are derived from the heading's position in the document tree, exactly the way
 * <RichTextView headingIdPrefix> numbers them, so a TOC entry always scrolls to its heading — even when
 * two headings share the same text.
 */

export type TocEntry = {
  /** DOM id of the heading (see headingAnchorId). */
  id: string;
  level: 1 | 2 | 3;
  text: string;
};

export { headingAnchorId };

const nodeText = (node: RichTextNode): string => {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "mention") {
    const label = node.attrs?.label;
    return `@${typeof label === "string" ? label : ""}`;
  }
  if (node.type === "hardBreak") return " ";
  return (node.content ?? []).map(nodeText).join("");
};

/**
 * Headings (levels 1–3) in document order. Empty headings are skipped. `maxLevel` trims deep
 * levels for compact TOCs (phones).
 */
export const extractToc = (
  input: RichTextDocLike | null | undefined,
  prefix = "kb-h",
  maxLevel: 1 | 2 | 3 = 3
): TocEntry[] => {
  const doc = asRichTextDoc(input);
  const entries: TocEntry[] = [];
  const visit = (nodes: RichTextNode[] | undefined, path: string) => {
    nodes?.forEach((node, index) => {
      const key = `${path}.${index}`;
      if (node.type === "heading") {
        const raw = node.attrs?.level;
        const level = raw === 1 || raw === 3 ? raw : 2;
        const text = nodeText(node).replace(/\s+/g, " ").trim();
        if (text && level <= maxLevel) entries.push({ id: headingAnchorId(prefix, key), level, text });
        return;
      }
      // Headings never nest inside text blocks; quotes / list items can hold them (table cells are not
      // part of the outline).
      if (node.content && node.type !== "paragraph" && node.type !== "codeBlock" && node.type !== "table") {
        visit(node.content, key);
      }
    });
  };
  visit(doc?.content, "n");
  return entries;
};

/**
 * Indentation depth for each entry relative to the shallowest heading used (a document that only uses
 * H2/H3 starts flush left).
 */
export const tocDepths = (entries: readonly TocEntry[]) => {
  const min = entries.reduce((lowest, entry) => Math.min(lowest, entry.level), 3);
  return entries.map((entry) => entry.level - min);
};

/** The entry whose heading was passed most recently while scrolling (scroll-spy). */
export const activeTocId = (
  entries: readonly TocEntry[],
  offsets: ReadonlyMap<string, number>,
  scrollTop: number,
  threshold = 96
): string | null => {
  let active: string | null = entries[0]?.id ?? null;
  for (const entry of entries) {
    const top = offsets.get(entry.id);
    if (top === undefined) continue;
    if (top - threshold <= scrollTop) active = entry.id;
    else break;
  }
  return active;
};
