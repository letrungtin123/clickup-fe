import type { ReactionUsers } from "@/contracts/chat";
import type { UserRef } from "@/contracts/work";

/** "Minh Nguyễn, Khoa Lê và 4 người khác" — "Bạn" first when the viewer reacted. */
export const describeReactors = (users: readonly UserRef[], myId: string, max = 6) => {
  const names = [...users]
    .sort((a, b) => Number(b.id === myId) - Number(a.id === myId))
    .map((user) => (user.id === myId ? "Bạn" : user.displayName));
  if (names.length <= max) {
    return names.length > 1 ? `${names.slice(0, -1).join(", ")} và ${names.at(-1)}` : (names[0] ?? "");
  }
  return `${names.slice(0, max).join(", ")} và ${names.length - max} người khác`;
};

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
