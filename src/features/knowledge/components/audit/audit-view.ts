import type { KnowledgeAuditAction, KnowledgeAuditEntry } from "@/contracts/knowledge";
import type { UserRef } from "@/contracts/work";
import { isApiError } from "@/lib/api/errors";

import { auditActionMeta } from "../../model/audit";
import type { AuditFilters } from "../../model/filters";

/**
 * Pure helpers of the space audit log screen ("Nhật ký kho", /k/:spaceId/audit): filter wording, the
 * links of a row (item / exact version), people for the actor filter and the Excel file name.
 */

export type AuditTone = (typeof auditActionMeta)[KnowledgeAuditAction]["tone"];

/** Action pill per tone — semantic tokens, so light and dark keep the same contrast. */
export const auditToneClass: Record<AuditTone, string> = {
  brand: "bg-brand-soft text-brand-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-foreground",
  danger: "bg-danger-soft text-danger",
  muted: "bg-muted text-foreground-muted"
};

export const auditToneDot: Record<AuditTone, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-foreground-subtle"
};

const allActions = Object.keys(auditActionMeta) as KnowledgeAuditAction[];

/** "Loại thao tác" choices, grouped like the log reads: item changes first, then space settings. */
export const auditActionGroups: readonly {
  scope: "item" | "space";
  label: string;
  actions: readonly KnowledgeAuditAction[];
}[] = [
  { scope: "item", label: "Mục", actions: allActions.filter((action) => auditActionMeta[action].scope === "item") },
  { scope: "space", label: "Kho", actions: allActions.filter((action) => auditActionMeta[action].scope === "space") }
];

export const emptyAuditFilters: AuditFilters = { actorId: null, actions: [], itemId: null, from: null, to: null };

/** One per narrowed dimension (person, action types, item, time range) — the "Lọc · 2" badge. */
export const activeAuditFilterCount = (filters: AuditFilters) =>
  (filters.actorId ? 1 : 0) +
  (filters.actions.length > 0 ? 1 : 0) +
  (filters.itemId ? 1 : 0) +
  (filters.from || filters.to ? 1 : 0);

export const auditActionsLabel = (actions: readonly KnowledgeAuditAction[]) => {
  const [first] = actions;
  if (!first) return "Mọi thao tác";
  if (actions.length === 1) return auditActionMeta[first].label;
  return `${actions.length} loại thao tác`;
};

/** Adds or removes one action, keeping the list in menu order (stable URLs). */
export const toggleAuditAction = (
  actions: readonly KnowledgeAuditAction[],
  action: KnowledgeAuditAction
): KnowledgeAuditAction[] => {
  const next = new Set(actions);
  if (next.has(action)) next.delete(action);
  else next.add(action);
  return allActions.filter((entry) => next.has(entry));
};

/** Sets one end of the time range; a reversed range is swapped so "từ" never comes after "đến". */
export const withAuditRange = (filters: AuditFilters, key: "from" | "to", day: string | null): AuditFilters => {
  const next = key === "from" ? { ...filters, from: day } : { ...filters, to: day };
  if (next.from && next.to && next.from > next.to) return { ...next, from: next.to, to: next.from };
  return next;
};

/** Entries of every loaded page, without the duplicates a shifting cursor can produce. */
export const uniqueById = <T extends { id: string }>(pages: readonly { items: readonly T[] }[] | undefined): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
};

/** Items whose permanent deletion is in the loaded log: their rows no longer link anywhere. */
export const purgedItemIds = (entries: readonly Pick<KnowledgeAuditEntry, "action" | "itemId">[]) =>
  new Set(entries.flatMap((entry) => (entry.action === "ITEM_PURGED" && entry.itemId ? [entry.itemId] : [])));

/**
 * Where a row leads: the item page and, for rows tied to a saved version, that exact version in the
 * item's history tab (`?tab=history&version=N`, read by the item page). Nothing for space-level rows and
 * purged items.
 */
export const auditEntryLinks = (
  entry: Pick<KnowledgeAuditEntry, "action" | "itemId" | "versionNumber">,
  spaceId: string,
  purged: ReadonlySet<string>
): { item: string | null; version: string | null } => {
  if (!entry.itemId || entry.action === "ITEM_PURGED" || purged.has(entry.itemId)) return { item: null, version: null };
  const item = `/k/${spaceId}/i/${entry.itemId}`;
  const version =
    entry.versionNumber !== null && entry.versionNumber > 0 ? `${item}?tab=history&version=${entry.versionNumber}` : null;
  return { item, version };
};

/** Title of the filtered item for the "Mục: …" chip (the newest title seen in the log). */
export const auditItemTitle = (
  entries: readonly Pick<KnowledgeAuditEntry, "itemId" | "itemTitle">[],
  itemId: string | null
) => {
  if (!itemId) return null;
  const title = entries.find((entry) => entry.itemId === itemId && entry.itemTitle?.trim())?.itemTitle?.trim();
  return title ?? null;
};

/**
 * People offered by the "Người thực hiện" filter: the space members plus anyone seen acting in the log
 * (org admins, former members), alphabetical.
 */
export const auditActorChoices = (
  members: readonly UserRef[],
  entries: readonly Pick<KnowledgeAuditEntry, "actor">[]
): UserRef[] => {
  const people = new Map<string, UserRef>();
  for (const member of members) people.set(member.id, member);
  for (const entry of entries) if (entry.actor && !people.has(entry.actor.id)) people.set(entry.actor.id, entry.actor);
  return [...people.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "vi"));
};

/** Lower case without Vietnamese diacritics ("Đức" → "duc") for forgiving people search. */
export const foldText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();

export const matchesPerson = (person: Pick<UserRef, "displayName" | "email">, query: string) => {
  const q = foldText(query);
  if (!q) return true;
  return foldText(person.displayName).includes(q) || foldText(person.email ?? "").includes(q);
};

/** Name of a user id seen in the payloads, through the people the screen knows. */
export const userNameResolver = (people: readonly Pick<UserRef, "id" | "displayName">[]) => {
  const names = new Map(people.map((person) => [person.id, person.displayName]));
  return (id: string) => names.get(id);
};

const dayStamp = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** Fallback name of the Excel export (the server's Content-Disposition name wins). */
export const auditExportFileName = (spaceName: string, now: Date = new Date()) => {
  const name = spaceName.replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return `Nhật ký kho ${name || "tri thức"} ${dayStamp(now)}.xlsx`;
};

/**
 * The export endpoint is not deployed (or not routed) yet: a 404/405/501 that is not a knowledge error
 * (a missing space answers KNOWLEDGE_SPACE_NOT_FOUND and keeps its own wording).
 */
export const isExportUnsupported = (error: unknown) =>
  isApiError(error) && [404, 405, 501].includes(error.status) && !error.code.startsWith("KNOWLEDGE_");
