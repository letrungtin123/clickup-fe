import { describe, expect, it } from "vitest";

import { withoutMentioned, type MentionCandidate } from "./mention-candidates";

const person = (id: string, displayName: string): MentionCandidate => ({ id, displayName, email: null, avatarUrl: null });
const all: MentionCandidate = { kind: "all", id: "all", description: "Nhắc tất cả 3 thành viên trong kênh" };

describe("withoutMentioned (owner, 2026-10-16)", () => {
  it("does not offer someone already @mentioned in the draft again, nor @all once used", () => {
    const items = [all, person("u1", "An"), person("u2", "Bình")];
    expect(withoutMentioned(items, new Set()).map((item) => item.id)).toEqual(["all", "u1", "u2"]);
    expect(withoutMentioned(items, new Set(["u1"])).map((item) => item.id)).toEqual(["all", "u2"]);
    expect(withoutMentioned(items, new Set(["all", "u2"])).map((item) => item.id)).toEqual(["u1"]);
  });
});
