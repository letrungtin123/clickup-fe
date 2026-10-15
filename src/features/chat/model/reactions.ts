import type { ReactionSummary, ReactionUsers } from "@/contracts/chat";
import type { UserRef } from "@/contracts/work";

/** Names a reaction tooltip lists before "và N người khác". */
export const REACTION_TOOLTIP_NAMES = 6;

const joinNames = (names: readonly string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} và ${names.at(-1)}` : (names[0] ?? "");

/**
 * Who reacted: "Bạn, Minh Nguyễn và 4 người khác" — "Bạn" first when the viewer reacted, at most `max`
 * names, everyone else counted from `total` (a reaction lists only its first reactors, so the total can
 * exceed the people known). `total` defaults to the people given; `reactedByMe` to the viewer being among
 * them. Without any known name: "3 người".
 */
export const describeReactors = (
  users: readonly UserRef[],
  myId: string,
  options: { total?: number; reactedByMe?: boolean; max?: number } = {}
) => {
  const max = options.max ?? REACTION_TOOLTIP_NAMES;
  const seen = new Set<string>([myId]);
  const others: UserRef[] = [];
  for (const user of users) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    others.push(user);
  }
  const mine = options.reactedByMe ?? users.some((user) => user.id === myId);
  const names = [...(mine ? ["Bạn"] : []), ...others.map((user) => user.displayName)];
  const total = Math.max(options.total ?? names.length, names.length);
  if (names.length === 0) return total > 0 ? `${total} người` : "";
  // Everyone known and just one over the limit: name them rather than "và 1 người khác".
  if (names.length === total && total <= max + 1) return joinNames(names);
  const shown = names.slice(0, max);
  const rest = total - shown.length;
  return rest > 0 ? `${shown.join(", ")} và ${rest} người khác` : joinNames(shown);
};

/** Chip tooltip: "An, Bình và 3 người khác đã thả 👍". */
export const reactionTooltipText = (
  reaction: ReactionSummary,
  myId: string,
  max = REACTION_TOOLTIP_NAMES
) =>
  `${describeReactors(reaction.users, myId, {
    total: reaction.count,
    reactedByMe: reaction.reactedByMe,
    max
  })} đã thả ${reaction.emoji}`;

/** The first people who reacted to a message, across its emojis, without repeats (avatar stack). */
export const firstReactors = (reactions: readonly ReactionSummary[], max = 3): UserRef[] => {
  const byId = new Map<string, UserRef>();
  for (const reaction of reactions) {
    for (const user of reaction.users) {
      if (byId.size >= max) return [...byId.values()];
      if (!byId.has(user.id)) byId.set(user.id, user);
    }
  }
  return [...byId.values()];
};

/** What the reactions sheet shows before the full list arrives: the message's own reactions. */
export const reactionUsersPreview = (messageId: string, reactions: readonly ReactionSummary[]): ReactionUsers => ({
  messageId,
  items: reactions.map((reaction) => ({ ...reaction, users: [...reaction.users] }))
});

export type ReactionPersonRow = { user: UserRef; emojis: string[] };

/** One emoji's people, or everyone (each with all the emojis they used) when `emoji` is null. */
export const reactionPeople = (data: ReactionUsers | undefined, emoji: string | null): ReactionPersonRow[] => {
  if (!data) return [];
  if (emoji) {
    return (data.items.find((item) => item.emoji === emoji)?.users ?? []).map((user) => ({
      user,
      emojis: [emoji]
    }));
  }
  const byUser = new Map<string, ReactionPersonRow>();
  for (const item of data.items) {
    for (const user of item.users) {
      const row = byUser.get(user.id) ?? { user, emojis: [] };
      row.emojis.push(item.emoji);
      byUser.set(user.id, row);
    }
  }
  return [...byUser.values()];
};
