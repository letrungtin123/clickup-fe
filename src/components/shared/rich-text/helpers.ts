import {
  commentLimits,
  descriptionLimits,
  messageLimits,
  RichTextError,
  richTextFromPlainText,
  sanitizeRichText,
  type RichTextDoc,
  type RichTextNode,
  type SanitizeLimits
} from "@/contracts/rich-text";

/**
 * Pure helpers for the allow-listed rich text documents (contracts/rich-text.ts).
 * No Tiptap imports here — safe to use from list rows, previews and tests.
 */

export type RichTextVariant = "comment" | "description" | "message";

/**
 * Any document shape the app holds: the strict `RichTextDoc` or the zod-inferred contract type
 * (`z.infer<typeof RichTextDocSchema>`, e.g. `Comment.body`, `TaskDetail.description`, chat bodies).
 */
export type RichTextDocLike = { type: "doc"; content?: readonly unknown[] | undefined };

/** Narrows a contract document to the node tree type (the server already sanitized it). */
export const asRichTextDoc = (doc: RichTextDocLike | null | undefined): RichTextDoc | null =>
  doc && doc.type === "doc" ? (doc as RichTextDoc) : null;

export const richTextLimits: Record<RichTextVariant, SanitizeLimits> = {
  comment: commentLimits,
  description: descriptionLimits,
  message: messageLimits
};

export const emptyDoc = (): RichTextDoc => ({ type: "doc", content: [] });

const blockSeparated = new Set([
  "paragraph",
  "heading",
  "codeBlock",
  "blockquote",
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem"
]);

/**
 * Plain text of a document, matching the server's derivation closely (text, hard breaks as
 * newlines, mentions as "@label", one newline after each block, 3+ newlines collapsed).
 */
export const docToPlainText = (input: RichTextDocLike | null | undefined): string => {
  const doc = asRichTextDoc(input);
  if (!doc?.content) {
    return "";
  }
  const parts: string[] = [];
  const visit = (node: RichTextNode) => {
    switch (node.type) {
      case "text":
        parts.push(node.text ?? "");
        return;
      case "hardBreak":
        parts.push("\n");
        return;
      case "mention": {
        const label = node.attrs?.label;
        parts.push(`@${typeof label === "string" ? label : ""}`);
        return;
      }
      default:
        node.content?.forEach(visit);
        if (blockSeparated.has(node.type)) {
          parts.push("\n");
        }
    }
  };
  doc.content.forEach(visit);
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/** True when the document has no visible text and no mentions (what the server rejects as empty). */
export const isEmptyDoc = (doc: RichTextDocLike | null | undefined): boolean =>
  docToPlainText(doc).trim().length === 0;

/** Paragraphs split on blank lines, single newlines become hard breaks. */
export const plainTextToDoc = (text: string): RichTextDoc => {
  const doc = richTextFromPlainText(text);
  return { type: "doc", content: doc.content ?? [] };
};

/** Mentioned user ids (deduplicated, document order). */
export const docMentions = (input: RichTextDocLike | null | undefined): string[] => {
  const doc = asRichTextDoc(input);
  const ids: string[] = [];
  const visit = (node: RichTextNode) => {
    if (node.type === "mention" && typeof node.attrs?.id === "string" && !ids.includes(node.attrs.id)) {
      ids.push(node.attrs.id);
    }
    node.content?.forEach(visit);
  };
  doc?.content?.forEach(visit);
  return ids;
};

export type PreparedDoc =
  | { ok: true; doc: RichTextDoc; text: string; mentions: string[] }
  | { ok: false; reason: "empty" | "too-large"; message: string };

/**
 * Runs the shared server sanitizer locally so what we send is exactly what will be stored, and
 * reports limit violations before a round trip.
 */
export const prepareDoc = (
  doc: RichTextDocLike | null | undefined,
  variant: RichTextVariant,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): PreparedDoc => {
  try {
    const result = sanitizeRichText(doc ?? emptyDoc(), richTextLimits[variant]);
    if (!allowEmpty && result.text.trim().length === 0) {
      return { ok: false, reason: "empty", message: "Nội dung đang trống." };
    }
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof RichTextError) {
      return { ok: false, reason: "too-large", message: "Nội dung quá dài hoặc quá phức tạp." };
    }
    throw error;
  }
};

/** Stable structural comparison (documents are small JSON trees). */
export const docsEqual = (a: RichTextDocLike | null | undefined, b: RichTextDocLike | null | undefined) => {
  const left = a && !isEmptyStructure(a as RichTextDoc) ? JSON.stringify(a) : "";
  const right = b && !isEmptyStructure(b as RichTextDoc) ? JSON.stringify(b) : "";
  return left === right;
};

const isEmptyStructure = (doc: RichTextDoc) =>
  !doc.content ||
  doc.content.length === 0 ||
  (doc.content.length === 1 && doc.content[0]?.type === "paragraph" && !doc.content[0].content?.length);

const safeHref = /^(https?:\/\/|mailto:)[^\s<>"']{1,2000}$/i;

/** Only http(s) and mailto links are kept by the server; everything else is dropped. */
export const isSafeHref = (href: string) => safeHref.test(href.trim());

/** Adds https:// to bare domains typed into the link field ("nesso.vn" → "https://nesso.vn"). */
export const normalizeHref = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null;
  if (isSafeHref(value)) return value;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(value)) return `mailto:${value}`;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(value)) {
    const withScheme = `https://${value}`;
    return isSafeHref(withScheme) ? withScheme : null;
  }
  return null;
};
