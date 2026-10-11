import type {
  KnowledgeItemDetail,
  KnowledgeStatus,
  UpdateKnowledgeItemRequest
} from "@/contracts/knowledge";
import type { RichTextDoc } from "@/contracts/rich-text";

import { knowledgeBodyText, prepareKnowledgeBody } from "./body";
import type { EditorFields } from "./drafts";

/**
 * Pure helpers of the item editor: the form state, what changed, and the create / update requests.
 * Content fields (title, summary, body) carry `expectedVersion` so a concurrent save is refused with a
 * conflict instead of being overwritten (PD-031).
 */

const emptyBody = (): RichTextDoc => ({ type: "doc", content: [] });

/** The body as the server will store it (sanitized, tables and images included), for comparisons. */
export const normalizeBody = (doc: RichTextDoc | null | undefined): RichTextDoc => {
  const prepared = prepareKnowledgeBody(doc ?? emptyBody());
  return prepared.ok ? prepared.doc : (doc ?? emptyBody());
};

export const fieldsFromItem = (item: KnowledgeItemDetail): EditorFields => ({
  title: item.title,
  summary: item.summary ?? "",
  body: normalizeBody(item.body as RichTextDoc),
  categoryId: item.categoryId,
  importance: item.importance,
  statusId: item.status.id,
  ownerId: item.owner?.id ?? null,
  effectiveFrom: item.effectiveFrom,
  reviewBy: item.reviewBy,
  tags: [...item.tags]
});

export const newItemFields = ({
  categoryId,
  statusId,
  ownerId
}: {
  categoryId: string | null;
  statusId: string | null;
  ownerId: string | null;
}): EditorFields => ({
  title: "",
  summary: "",
  body: emptyBody(),
  categoryId,
  importance: "normal",
  statusId,
  ownerId,
  effectiveFrom: null,
  reviewBy: null,
  tags: []
});

/** First draft status of the space (what the server would pick), in space order. */
export const defaultDraftStatus = (statuses: readonly KnowledgeStatus[]) =>
  [...statuses].sort((a, b) => a.position - b.position).find((status) => status.group === "draft") ?? null;

const sameBody = (a: RichTextDoc, b: RichTextDoc) => JSON.stringify(normalizeBody(a)) === JSON.stringify(normalizeBody(b));
const sameTags = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...a].map((tag) => tag.trim()).sort()) === JSON.stringify([...b].map((tag) => tag.trim()).sort());

export type FieldChanges = {
  content: boolean;
  fields: (keyof EditorFields)[];
  any: boolean;
};

export const diffFields = (base: EditorFields, current: EditorFields): FieldChanges => {
  const fields: (keyof EditorFields)[] = [];
  if (base.title.trim() !== current.title.trim()) fields.push("title");
  if (base.summary.trim() !== current.summary.trim()) fields.push("summary");
  if (!sameBody(base.body, current.body)) fields.push("body");
  if (base.categoryId !== current.categoryId) fields.push("categoryId");
  if (base.importance !== current.importance) fields.push("importance");
  if (base.statusId !== current.statusId) fields.push("statusId");
  if (base.ownerId !== current.ownerId) fields.push("ownerId");
  if (base.effectiveFrom !== current.effectiveFrom) fields.push("effectiveFrom");
  if (base.reviewBy !== current.reviewBy) fields.push("reviewBy");
  if (!sameTags(base.tags, current.tags)) fields.push("tags");
  const content = fields.some((field) => field === "title" || field === "summary" || field === "body");
  return { content, fields, any: fields.length > 0 };
};

export const buildCreateRequest = (fields: EditorFields) => ({
  title: fields.title.trim(),
  summary: fields.summary.trim() || null,
  body: normalizeBody(fields.body),
  categoryId: fields.categoryId,
  importance: fields.importance,
  ...(fields.statusId ? { statusId: fields.statusId } : {}),
  ownerId: fields.ownerId,
  effectiveFrom: fields.effectiveFrom,
  reviewBy: fields.reviewBy,
  tags: fields.tags.map((tag) => tag.trim()).filter(Boolean)
});

/**
 * PATCH body with only what changed. `expectedVersion` (and the optional version note) go with content
 * changes; the reason with any change of a critical item. Null when nothing changed.
 */
export const buildUpdateRequest = (
  base: EditorFields,
  current: EditorFields,
  options: { baseVersion: number; versionNote?: string | undefined; reason?: string | undefined }
): UpdateKnowledgeItemRequest | null => {
  const changes = diffFields(base, current);
  if (!changes.any) return null;
  const request: UpdateKnowledgeItemRequest = {};
  for (const field of changes.fields) {
    switch (field) {
      case "title":
        request.title = current.title.trim();
        break;
      case "summary":
        request.summary = current.summary.trim() || null;
        break;
      case "body":
        request.body = normalizeBody(current.body);
        break;
      case "categoryId":
        request.categoryId = current.categoryId;
        break;
      case "importance":
        request.importance = current.importance;
        break;
      case "statusId":
        if (current.statusId) request.statusId = current.statusId;
        break;
      case "ownerId":
        request.ownerId = current.ownerId;
        break;
      case "effectiveFrom":
        request.effectiveFrom = current.effectiveFrom;
        break;
      case "reviewBy":
        request.reviewBy = current.reviewBy;
        break;
      case "tags":
        request.tags = current.tags.map((tag) => tag.trim()).filter(Boolean);
        break;
    }
  }
  if (changes.content) {
    request.expectedVersion = options.baseVersion;
    const note = options.versionNote?.trim();
    if (note) request.versionNote = note.slice(0, 200);
  }
  const reason = options.reason?.trim();
  if (reason) request.reason = reason.slice(0, 500);
  return request;
};

/** Plain text of what the writer has (clipboard copy when a conflict is resolved by hand). */
export const fieldsToPlainText = (fields: Pick<EditorFields, "title" | "summary" | "body">) =>
  [fields.title.trim(), fields.summary.trim(), knowledgeBodyText(fields.body)].filter(Boolean).join("\n\n");

/** Validation of the form before saving (messages in Vietnamese). */
export const validateFields = (fields: EditorFields) => {
  const errors: Partial<Record<"title" | "summary" | "body" | "dates", string>> = {};
  const title = fields.title.trim();
  if (!title) errors.title = "Nhập tiêu đề.";
  else if (title.length > 200) errors.title = "Tiêu đề tối đa 200 ký tự.";
  if (fields.summary.trim().length > 400) errors.summary = "Tóm tắt tối đa 400 ký tự.";
  const prepared = prepareKnowledgeBody(fields.body);
  if (!prepared.ok) errors.body = prepared.message;
  if (fields.effectiveFrom && fields.reviewBy && fields.reviewBy < fields.effectiveFrom) {
    errors.dates = "Hạn rà soát phải sau ngày hiệu lực.";
  }
  return errors;
};
