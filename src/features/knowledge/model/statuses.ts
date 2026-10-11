import {
  knowledgeLimits,
  type KnowledgeStatus,
  type KnowledgeStatusGroup,
  type ReplaceKnowledgeStatusesRequest
} from "@/contracts/knowledge";
import { hasBidiControls, hasControlCharacters, isVisiblyBlank } from "@/contracts/schemas";
import type { ColorToken } from "@/contracts/work";
import { moveItem } from "@/lib/ordering";

import { statusGroupMeta, statusGroupOrder } from "./labels";

/**
 * Status list editor of a space (PD-031 §04, "Cài đặt kho › Trạng thái"). Pure so the rules are
 * unit-tested; the API checks every one of them again (PUT /knowledge/spaces/:id/statuses).
 */

export const minStatuses = 3;
export const maxStatuses = knowledgeLimits.statusesPerSpace;
/** ReplaceKnowledgeStatusesRequestSchema: SafeLineSchema(40). */
export const statusNameMaxLength = 40;

export type StatusDraft = {
  /** Stable React / drag key: the id of an existing status, a local key for a new one. */
  key: string;
  /** Existing statuses only (new ones get their id from the server). */
  id?: string;
  name: string;
  color: ColorToken;
  group: KnowledgeStatusGroup;
};

/** Kept existing status: the only valid destination for the items of a removed one. */
export type KeptStatusDraft = StatusDraft & { id: string };

export const sortStatuses = <T extends Pick<KnowledgeStatus, "position">>(
  statuses: readonly T[]
): T[] => [...statuses].sort((a, b) => a.position - b.position);

export const toStatusDrafts = (statuses: readonly KnowledgeStatus[]): StatusDraft[] =>
  sortStatuses(statuses).map(({ id, name, color, group }) => ({ key: id, id, name, color, group }));

const comparableRows = (rows: readonly Pick<StatusDraft, "id" | "name" | "color" | "group">[]) =>
  JSON.stringify(rows.map((row) => [row.id ?? null, row.name.trim(), row.color, row.group]));

/** Changes whenever the saved list changes (name, color, group, order, ids): keys the editor. */
export const statusesSignature = (statuses: readonly KnowledgeStatus[]) =>
  comparableRows(sortStatuses(statuses));

/** Unsaved changes? (Whitespace around names does not count.) */
export const statusDraftsChanged = (
  current: readonly KnowledgeStatus[],
  drafts: readonly StatusDraft[]
) => statusesSignature(current) !== comparableRows(drafts);

/** Colors offered to a new status, calm ones first; the first one not used yet wins. */
const newStatusColors: readonly ColorToken[] = [
  "sky",
  "violet",
  "teal",
  "amber",
  "indigo",
  "pink",
  "lime",
  "orange",
  "cyan",
  "rose",
  "emerald",
  "slate"
];

export const nextStatusColor = (drafts: readonly Pick<StatusDraft, "color">[]): ColorToken => {
  const used = new Set(drafts.map((draft) => draft.color));
  return newStatusColors.find((color) => !used.has(color)) ?? "slate";
};

/** A new row: in a group that has no status yet (else "Bản nháp"), empty name, an unused color. */
export const newStatusDraft = (key: string, drafts: readonly StatusDraft[]): StatusDraft => ({
  key,
  name: "",
  color: nextStatusColor(drafts),
  group: statusGroupOrder.find((group) => !drafts.some((draft) => draft.group === group)) ?? "draft"
});

/** Inserts `draft` right after the last row of its group (or at the end), where people expect it. */
export const insertStatusDraft = (
  drafts: readonly StatusDraft[],
  draft: StatusDraft
): StatusDraft[] => {
  const last = drafts.findLastIndex((row) => row.group === draft.group);
  const at = last < 0 ? drafts.length : last + 1;
  return [...drafts.slice(0, at), draft, ...drafts.slice(at)];
};

/** Keyboard reorder (Alt + ↑/↓): one step up (-1) or down (+1); unchanged at either end. */
export const moveStatusDraft = (
  drafts: readonly StatusDraft[],
  key: string,
  offset: -1 | 1
): StatusDraft[] => {
  const from = drafts.findIndex((draft) => draft.key === key);
  return from < 0 ? [...drafts] : moveItem(drafts, from, from + offset);
};

// --- Validation -------------------------------------------------------------------------------------

export type StatusIssueCode =
  | "too-few"
  | "too-many"
  | "empty-name"
  | "invalid-name"
  | "name-too-long"
  | "duplicate-name"
  | "missing-group"
  | "no-kept-status";

/** `keys` = rows to highlight (empty for list-wide problems). */
export type StatusIssue = { code: StatusIssueCode; message: string; keys: string[] };

/** Same name for the server: trimmed, NFC (macOS input methods type decomposed accents), any case. */
export const normalizeStatusName = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");

const quoteGroups = (groups: readonly KnowledgeStatusGroup[]) =>
  groups.map((group) => `“${statusGroupMeta[group].label}”`).join(", ");

/**
 * Every rule of ReplaceKnowledgeStatusesRequestSchema plus the server's: 3–12 statuses, names
 * non-empty / ≤ 40 / unique, at least one status per group. With `current` (the saved list): a removed
 * status hands its items to a kept one, so at least one existing status has to stay (renamed if needed).
 */
export const validateStatusDrafts = (
  drafts: readonly StatusDraft[],
  current: readonly Pick<KnowledgeStatus, "id">[] = []
): StatusIssue[] => {
  const issues: StatusIssue[] = [];
  if (drafts.length < minStatuses) {
    issues.push({
      code: "too-few",
      message: `Kho cần ít nhất ${minStatuses} trạng thái.`,
      keys: []
    });
  }
  if (drafts.length > maxStatuses) {
    issues.push({
      code: "too-many",
      message: `Mỗi kho có tối đa ${maxStatuses} trạng thái.`,
      keys: []
    });
  }

  const empty = drafts.filter((draft) => isVisiblyBlank(draft.name)).map((draft) => draft.key);
  if (empty.length > 0) {
    issues.push({ code: "empty-name", message: "Đặt tên cho mọi trạng thái.", keys: empty });
  }
  const invalid = drafts
    .filter((draft) => hasControlCharacters(draft.name) || hasBidiControls(draft.name))
    .map((draft) => draft.key);
  if (invalid.length > 0) {
    issues.push({
      code: "invalid-name",
      message: "Tên trạng thái chứa ký tự không hợp lệ.",
      keys: invalid
    });
  }
  const long = drafts
    .filter((draft) => draft.name.trim().length > statusNameMaxLength)
    .map((draft) => draft.key);
  if (long.length > 0) {
    issues.push({
      code: "name-too-long",
      message: `Tên trạng thái tối đa ${statusNameMaxLength} ký tự.`,
      keys: long
    });
  }

  const byName = new Map<string, string[]>();
  for (const draft of drafts) {
    if (isVisiblyBlank(draft.name)) continue;
    const name = normalizeStatusName(draft.name);
    byName.set(name, [...(byName.get(name) ?? []), draft.key]);
  }
  const duplicates = [...byName.values()].filter((keys) => keys.length > 1).flat();
  if (duplicates.length > 0) {
    issues.push({
      code: "duplicate-name",
      message: "Tên trạng thái không được trùng nhau.",
      keys: duplicates
    });
  }

  const missing = statusGroupOrder.filter(
    (group) => !drafts.some((draft) => draft.group === group)
  );
  if (missing.length > 0) {
    issues.push({
      code: "missing-group",
      message: `Mỗi nhóm cần ít nhất một trạng thái: thêm trạng thái cho nhóm ${quoteGroups(missing)}.`,
      keys: []
    });
  }

  if (current.length > 0) {
    const currentIds = new Set(current.map((status) => status.id));
    if (!drafts.some((draft) => draft.id !== undefined && currentIds.has(draft.id))) {
      issues.push({
        code: "no-kept-status",
        message:
          "Giữ lại ít nhất một trạng thái cũ để nhận các mục (có thể đổi tên, màu hoặc nhóm của nó).",
        keys: []
      });
    }
  }
  return issues;
};

// --- Removed statuses & reassignment ------------------------------------------------------------------

/** Saved statuses that are no longer in the list, in their saved order. */
export const removedStatuses = (
  current: readonly KnowledgeStatus[],
  drafts: readonly StatusDraft[]
): KnowledgeStatus[] => {
  const kept = new Set(drafts.flatMap((draft) => (draft.id ? [draft.id] : [])));
  return sortStatuses(current).filter((status) => !kept.has(status.id));
};

/** Valid destinations for the items of a removed status: kept existing statuses, in the new order. */
export const reassignTargets = (drafts: readonly StatusDraft[]): KeptStatusDraft[] =>
  drafts.filter((draft): draft is KeptStatusDraft => draft.id !== undefined);

/** Default destination: the first kept status of the same group, else the first kept status. */
export const defaultReassign = (
  removed: readonly Pick<KnowledgeStatus, "id" | "group">[],
  drafts: readonly StatusDraft[]
): Record<string, string> => {
  const targets = reassignTargets(drafts);
  const result: Record<string, string> = {};
  for (const status of removed) {
    const target = targets.find((draft) => draft.group === status.group) ?? targets[0];
    if (target) result[status.id] = target.id;
  }
  return result;
};

export const isReassignComplete = (
  removed: readonly Pick<KnowledgeStatus, "id">[],
  reassign: Readonly<Record<string, string>>,
  drafts: readonly StatusDraft[]
) => {
  const targets = new Set(reassignTargets(drafts).map((draft) => draft.id));
  return removed.every((status) => {
    const target = reassign[status.id];
    return target !== undefined && targets.has(target);
  });
};

/** Kept statuses whose group changes: their items change visibility (e.g. back to drafts). */
export const regroupedStatuses = (
  current: readonly KnowledgeStatus[],
  drafts: readonly StatusDraft[]
) =>
  drafts.flatMap((draft) => {
    const saved = draft.id ? current.find((status) => status.id === draft.id) : undefined;
    return saved && saved.group !== draft.group
      ? [
          {
            key: draft.key,
            name: draft.name.trim() || saved.name,
            from: saved.group,
            to: draft.group
          }
        ]
      : [];
  });

/** PUT body: statuses in display order (new ones without id), reassignment to kept statuses only. */
export const buildReplaceStatusesRequest = (
  drafts: readonly StatusDraft[],
  removed: readonly Pick<KnowledgeStatus, "id">[],
  reassign: Readonly<Record<string, string>>
): ReplaceKnowledgeStatusesRequest => {
  const targets = new Set(reassignTargets(drafts).map((draft) => draft.id));
  return {
    statuses: drafts.map((draft) => ({
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name.normalize("NFC").trim(),
      color: draft.color,
      group: draft.group
    })),
    reassign: Object.fromEntries(
      removed.flatMap((status) => {
        const target = reassign[status.id];
        return target !== undefined && targets.has(target) ? [[status.id, target] as const] : [];
      })
    )
  };
};

/** Read-only view: the space's statuses under each group, in order. */
export const groupStatuses = (statuses: readonly KnowledgeStatus[]) =>
  statusGroupOrder.map((group) => ({
    group,
    statuses: sortStatuses(statuses).filter((status) => status.group === group)
  }));
