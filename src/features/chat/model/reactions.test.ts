import { describe, expect, it } from "vitest";

import type { ReactionUsers } from "@/contracts/chat";

import { describeReactors, reactionPeople } from "./reactions";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = (n: number, name: string) => ({ id: uuid(n), displayName: name, email: null, avatarUrl: null });
const me = uuid(9);

describe("describeReactors", () => {
  it("lists names, the viewer first as Bạn", () => {
    expect(describeReactors([user(1, "An")], me)).toBe("An");
    expect(describeReactors([user(1, "An"), user(9, "Tôi")], me)).toBe("Bạn và An");
    expect(describeReactors([user(1, "An"), user(2, "Bình"), user(3, "Chi")], me)).toBe("An, Bình và Chi");
  });

  it("summarises long lists", () => {
    const many = Array.from({ length: 9 }, (_, index) => user(index + 10, `N${index}`));
    expect(describeReactors(many, me, 6)).toBe("N0, N1, N2, N3, N4, N5 và 3 người khác");
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
});
