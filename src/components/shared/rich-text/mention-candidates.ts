import { MENTION_ALL_ID } from "@/contracts/rich-text";
import type { UserRef } from "@/contracts/work";

/**
 * Rows of the @mention popup. Pure types + helpers (no Tiptap): feature hooks build candidates without pulling the
 * editor into their chunk.
 */

/**
 * The "@all" suggestion (PD-061): mentions everyone in the conversation. Opt-in per mention source — only chat
 * channels and group DMs offer it (first row); task / job comments and knowledge never do.
 */
export type MentionAllCandidate = {
  kind: "all";
  id: typeof MENTION_ALL_ID;
  /** Short explanation under "@all", e.g. "Nhắc tất cả 12 thành viên trong kênh". */
  description: string;
};

/** One row of the @mention popup: a person, or @all. */
export type MentionCandidate = UserRef | MentionAllCandidate;

/**
 * Async search for @mentions (debounced by the editor, aborted when the query changes). `MentionSource<UserRef>`: a
 * people-only source (also usable by plain people pickers).
 */
export type MentionSource<T extends MentionCandidate = MentionCandidate> = (
  query: string,
  signal?: AbortSignal
) => Promise<T[]>;

/**
 * Drops the candidates already mentioned in the draft (owner, 2026-10-16): one person — or @all — is @mentioned once
 * per message, so a second "@" never offers them again.
 */
export const withoutMentioned = <T extends MentionCandidate>(items: T[], mentionedIds: ReadonlySet<string>) =>
  mentionedIds.size === 0 ? items : items.filter((item) => !mentionedIds.has(item.id));

export const isMentionAllCandidate = (item: MentionCandidate): item is MentionAllCandidate =>
  "kind" in item && item.kind === "all";

/** The mention node attrs a candidate inserts: `{ id: "all", label: "all" }` for @all, else the person. */
export const mentionAttrsOf = (item: MentionCandidate): { id: string; label: string } =>
  isMentionAllCandidate(item)
    ? { id: MENTION_ALL_ID, label: MENTION_ALL_ID }
    : { id: item.id, label: item.displayName };
