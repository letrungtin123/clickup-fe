import type { KnowledgeImportance } from "@/contracts/knowledge";
import type { RichTextDoc } from "@/contracts/rich-text";

/**
 * Local draft autosave for the item editor ("Tự lưu nháp trên máy", PD-031): every edit is kept in
 * localStorage per user + item (or per space for a new item) until it is saved as a version or
 * discarded. Nothing leaves the device; a draft never becomes a version on its own. Every storage access
 * is guarded (private mode / quota / blocked storage simply means "not kept").
 */

export type EditorFields = {
  title: string;
  summary: string;
  body: RichTextDoc;
  categoryId: string | null;
  importance: KnowledgeImportance;
  statusId: string | null;
  ownerId: string | null;
  effectiveFrom: string | null;
  reviewBy: string | null;
  tags: string[];
};

export type LocalDraft = {
  /** Version the draft was started from (null for a new item). */
  baseVersion: number | null;
  fields: EditorFields;
  versionNote: string;
  savedAt: number;
};

const prefix = "nesso-work-kb-draft:";
/** Drafts older than this are dropped on read. */
export const draftMaxAgeMs = 30 * 24 * 60 * 60_000;

export const draftKey = (userId: string, target: { itemId: string } | { spaceId: string }) =>
  "itemId" in target ? `${prefix}${userId}:item:${target.itemId}` : `${prefix}${userId}:new:${target.spaceId}`;

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown) => (typeof value === "string" ? value : null);

/** Validates a stored draft (it may be stale, hand-edited or from an older build). */
export const parseDraft = (raw: string | null, now = Date.now()): LocalDraft | null => {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isRecord(value.fields)) return null;
    const fields = value.fields;
    const body = fields.body;
    if (!isRecord(body) || body.type !== "doc") return null;
    const savedAt = typeof value.savedAt === "number" ? value.savedAt : 0;
    if (now - savedAt > draftMaxAgeMs) return null;
    const importance = fields.importance;
    return {
      baseVersion: typeof value.baseVersion === "number" ? value.baseVersion : null,
      versionNote: str(value.versionNote) ?? "",
      savedAt,
      fields: {
        title: str(fields.title) ?? "",
        summary: str(fields.summary) ?? "",
        body: body as RichTextDoc,
        categoryId: str(fields.categoryId),
        importance: importance === "important" || importance === "critical" ? importance : "normal",
        statusId: str(fields.statusId),
        ownerId: str(fields.ownerId),
        effectiveFrom: str(fields.effectiveFrom),
        reviewBy: str(fields.reviewBy),
        tags: Array.isArray(fields.tags) ? fields.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 10) : []
      }
    };
  } catch {
    return null;
  }
};

export const readDraft = (key: string): LocalDraft | null => {
  try {
    const store = storage();
    const draft = parseDraft(store?.getItem(key) ?? null);
    if (!draft) store?.removeItem(key);
    return draft;
  } catch {
    return null;
  }
};

/** Returns false when the draft could not be kept (quota / blocked storage). */
export const writeDraft = (key: string, draft: Omit<LocalDraft, "savedAt">, now = Date.now()) => {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(key, JSON.stringify({ ...draft, savedAt: now }));
    return true;
  } catch {
    return false;
  }
};

/** The safety copy written by "Chép nội dung của tôi" (`<key>:copy`) is never shown again: kept one day. */
export const draftCopyMaxAgeMs = 24 * 60 * 60_000;

/** Every key this module wrote (all users of this browser). */
const storedDraftKeys = (store: Storage) => {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
};

/**
 * Drops drafts nobody will reopen (KB-SEC FE-03): expired or unreadable ones, and conflict copies older than
 * a day. Reading a draft only drops that one key, so this runs once per app start. Returns how many were removed.
 */
export const sweepDrafts = (now = Date.now()) => {
  try {
    const store = storage();
    if (!store) return 0;
    let removed = 0;
    for (const key of storedDraftKeys(store)) {
      const draft = parseDraft(store.getItem(key), now);
      if (!draft || (key.endsWith(":copy") && now - draft.savedAt > draftCopyMaxAgeMs)) {
        store.removeItem(key);
        removed += 1;
      }
    }
    return removed;
  } catch {
    return 0;
  }
};

/** Explicit sign-out: no knowledge draft stays behind on this browser (shared computers). */
export const clearAllDrafts = () => {
  try {
    const store = storage();
    if (!store) return;
    for (const key of storedDraftKeys(store)) store.removeItem(key);
  } catch {
    // Blocked storage: nothing was kept either.
  }
};

export const clearDraft = (key: string) => {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to do: the draft simply stays until it expires.
  }
};

/** Comparable form of the fields (whitespace-insensitive text, sorted tags). */
export const fieldsSignature = (fields: EditorFields) =>
  JSON.stringify({
    ...fields,
    title: fields.title.trim(),
    summary: fields.summary.trim(),
    tags: [...fields.tags].map((tag) => tag.trim()).sort()
  });

export const sameFields = (a: EditorFields, b: EditorFields) => fieldsSignature(a) === fieldsSignature(b);
