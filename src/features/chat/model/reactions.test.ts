import { describe, expect, it } from "vitest";

import type { ReactionSummary, ReactionUsers } from "@/contracts/chat";

import {
  describeReactors,
  firstReactors,
  reactionPeople,
  reactionTooltipText,
  reactionUsersPreview
} from "./reactions";

// Obviously fake ids and names (the repository is public).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = (n: number, name: string) => ({ id: uuid(n), displayName: name, email: null, avatarUrl: null });
const me = uuid(9);
const reaction = (overrides: Partial<ReactionSummary>): ReactionSummary => ({
  emoji: "👍",
  count: 1,
  reactedByMe: false,
  users: [],
  ...overrides
});

describe("describeReactors", () => {
  it("lists names, the viewer first as Bạn", () => {
    expect(describeReactors([user(1, "An")], me)).toBe("An");
    expect(describeReactors([user(1, "An"), user(9, "Tôi")], me)).toBe("Bạn và An");
    expect(describeReactors([user(1, "An"), user(2, "Bình"), user(3, "Chi")], me)).toBe("An, Bình và Chi");
  });

  it("summarises long lists", () => {
    const many = Array.from({ length: 9 }, (_, index) => user(index + 10, `N${index}`));
    expect(describeReactors(many, me, { max: 6 })).toBe("N0, N1, N2, N3, N4, N5 và 3 người khác");
    // One over the limit with every name known: name them all.
    expect(describeReactors(many.slice(0, 3), me, { max: 2 })).toBe("N0, N1 và N2");
  });

  it("counts people beyond the listed first reactors from the total", () => {
    expect(describeReactors([user(1, "An"), user(2, "Bình")], me, { total: 5, max: 6 })).toBe(
      "An, Bình và 3 người khác"
    );
    expect(describeReactors([], me, { total: 3 })).toBe("3 người");
  });

  it("names the viewer even when they are past the listed reactors", () => {
    expect(describeReactors([user(1, "An")], me, { total: 25, reactedByMe: true, max: 6 })).toBe(
      "Bạn, An và 23 người khác"
    );
  });
});

describe("reactionTooltipText", () => {
  it("reads 'Tên A, Tên B và 3 người khác đã thả 👍'", () => {
    expect(
      reactionTooltipText(reaction({ count: 5, users: [user(1, "Tên A"), user(2, "Tên B")] }), me, 2)
    ).toBe("Tên A, Tên B và 3 người khác đã thả 👍");
  });

  it("puts the viewer first and keeps everyone when the list is short", () => {
    expect(
      reactionTooltipText(
        reaction({ emoji: "🎉", count: 2, reactedByMe: true, users: [user(1, "An"), user(9, "Tôi")] }),
        me
      )
    ).toBe("Bạn và An đã thả 🎉");
    expect(reactionTooltipText(reaction({ count: 1, reactedByMe: true, users: [user(9, "Tôi")] }), me)).toBe(
      "Bạn đã thả 👍"
    );
  });

  it("falls back to a count when no names are known yet", () => {
    expect(reactionTooltipText(reaction({ count: 4 }), me)).toBe("4 người đã thả 👍");
  });
});

describe("firstReactors", () => {
  it("collects the first distinct people across emojis", () => {
    const reactions = [
      reaction({ count: 2, users: [user(1, "An"), user(2, "Bình")] }),
      reaction({ emoji: "🎉", count: 2, users: [user(2, "Bình"), user(3, "Chi")] }),
      reaction({ emoji: "👀", count: 1, users: [user(4, "Dũng")] })
    ];
    expect(firstReactors(reactions).map((entry) => entry.displayName)).toEqual(["An", "Bình", "Chi"]);
    expect(firstReactors(reactions, 2)).toHaveLength(2);
    expect(firstReactors([])).toEqual([]);
  });
});

describe("reactionPeople", () => {
  const data: ReactionUsers = {
    messageId: uuid(100),
    items: [
      { emoji: "👍", count: 2, reactedByMe: false, users: [user(1, "An"), user(2, "Bình")] },
      { emoji: "🎉", count: 1, reactedByMe: false, users: [user(1, "An")] }
    ]
  };

  it("filters by emoji", () => {
    expect(reactionPeople(data, "🎉").map((row) => row.user.displayName)).toEqual(["An"]);
  });

  it("groups everyone with all their emojis", () => {
    expect(reactionPeople(data, null)).toEqual([
      { user: user(1, "An"), emojis: ["👍", "🎉"] },
      { user: user(2, "Bình"), emojis: ["👍"] }
    ]);
  });

  it("is empty before data arrives", () => {
    expect(reactionPeople(undefined, null)).toEqual([]);
  });

  it("starts from the message's own reactions", () => {
    const preview = reactionUsersPreview(uuid(100), data.items);
    expect(preview).toEqual(data);
    expect(reactionPeople(preview, "👍")).toHaveLength(2);
  });
});
