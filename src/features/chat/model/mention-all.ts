import type { MentionAllCandidate } from "@/components/shared/rich-text/mention-candidates";
import type { ChannelKind, ChatChannel } from "@/contracts/chat";
import { MENTION_ALL_ID } from "@/contracts/rich-text";

/**
 * @all in chat (PD-061): mention everyone in the conversation. Anyone who may post can use it in channels (public /
 * private) and group DMs — never in a 1:1 DM, never outside chat. Every member but the author is alerted, even those
 * who muted the conversation ("Tắt thông báo").
 */

/** Does this kind of conversation offer @all? */
export const allowsMentionAll = (kind: ChannelKind) => kind !== "dm";

/** Lower case, no Vietnamese diacritics, no spaces ("Tất cả" → "tatca"). */
const fold = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "");

/** Words that bring up "@all" after "@" (with or without diacritics: "tất cả" / "tat ca", "mọi người", "kênh"…). */
export const mentionAllKeywords = ["all", "tat ca", "everyone", "moi nguoi", "kenh", "nhom"] as const;
const foldedKeywords = mentionAllKeywords.map(fold);

/** Letters typed after "@" before a keyword prefix brings up @all ("@ta" is still Tâm, Tài…; "@tat" is "tất cả"). */
const minPrefix = 3;

/**
 * Does "@<query>" suggest @all? Always on a bare "@"; otherwise when the query starts one of the keywords, from three
 * letters on — shorter prefixes are mostly people searches ("@nh" for Nhung, "@ta" for Tâm) and @all, the first row,
 * would be one Enter away.
 */
export const matchesMentionAll = (query: string) => {
  const folded = fold(query);
  if (folded.length === 0) return true;
  if (folded.length < minPrefix) return false;
  return foldedKeywords.some((keyword) => keyword.startsWith(folded));
};

/** "Nhắc tất cả 12 thành viên trong kênh" (group DMs: "trong nhóm"). */
export const mentionAllDescription = (channel: Pick<ChatChannel, "kind" | "memberCount">) =>
  `Nhắc tất cả ${channel.memberCount} thành viên trong ${channel.kind === "group_dm" ? "nhóm" : "kênh"}`;

/** The "@all" row of the mention popup for this conversation, or null where @all is not offered / not matched. */
export const mentionAllCandidate = (
  channel: Pick<ChatChannel, "kind" | "memberCount">,
  query: string
): MentionAllCandidate | null =>
  allowsMentionAll(channel.kind) && matchesMentionAll(query)
    ? { kind: "all", id: MENTION_ALL_ID, description: mentionAllDescription(channel) }
    : null;
