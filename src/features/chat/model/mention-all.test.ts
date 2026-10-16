import { describe, expect, it } from "vitest";

import { allowsMentionAll, matchesMentionAll, mentionAllCandidate, mentionAllDescription } from "./mention-all";

describe("@all in chat (PD-061)", () => {
  it("is offered in channels and group DMs, never in a 1:1 DM", () => {
    expect(allowsMentionAll("public")).toBe(true);
    expect(allowsMentionAll("private")).toBe(true);
    expect(allowsMentionAll("group_dm")).toBe(true);
    expect(allowsMentionAll("dm")).toBe(false);
  });

  it("shows on a bare @ and for its keywords from three letters on, diacritics-insensitive", () => {
    for (const query of ["", " ", "all", "All", "tat", "tất", "tất cả", "tat ca", "tatca", "everyone", "eve", "kênh", "kenh", "Kên", "mọi người", "moinguoi", "nhóm"]) {
      expect(matchesMentionAll(query), query).toBe(true);
    }
    for (const query of ["a", "al", "t", "ta", "tâ", "nh", "an", "minh", "tuấn", "kenhx", "allx"]) {
      expect(matchesMentionAll(query), query).toBe(false);
    }
  });

  it("describes how many members it reaches", () => {
    expect(mentionAllDescription({ kind: "public", memberCount: 12 })).toBe("Nhắc tất cả 12 thành viên trong kênh");
    expect(mentionAllDescription({ kind: "group_dm", memberCount: 3 })).toBe("Nhắc tất cả 3 thành viên trong nhóm");
    expect(mentionAllCandidate({ kind: "private", memberCount: 5 }, "all")).toEqual({
      kind: "all",
      id: "all",
      description: "Nhắc tất cả 5 thành viên trong kênh"
    });
    expect(mentionAllCandidate({ kind: "dm", memberCount: 2 }, "")).toBeNull();
    expect(mentionAllCandidate({ kind: "public", memberCount: 5 }, "minh")).toBeNull();
  });
});
