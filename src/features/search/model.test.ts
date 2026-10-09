import { describe, expect, it } from "vitest";

import type { GlobalSearchResult } from "@/contracts/search";

import {
  countByGroup,
  excerptAround,
  findMatches,
  highlightSegments,
  mapSearchResults,
  messageHref
} from "./model";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

const result: GlobalSearchResult = {
  tasks: [
    {
      id: id(1),
      key: "WEB-12",
      title: "Thiết kế màn hình đăng nhập",
      projectId: id(2),
      projectName: "Web",
      listId: id(3),
      listName: "Sprint 1",
      status: { id: id(4), name: "Đang làm", color: "blue", category: "active" },
      completedAt: null,
      updatedAt: "2026-10-09T08:00:00Z"
    }
  ],
  projects: [{ id: id(2), key: "WEB", name: "Web", color: "blue", visibility: "private" }],
  lists: [{ id: id(3), name: "Sprint 1", projectId: id(2), projectName: "Web" }],
  people: [{ id: id(5), displayName: "Minh Nguyễn", email: "minh@example.test", avatarUrl: null }],
  messages: [
    {
      messageId: id(6),
      channelId: id(7),
      channelName: "thiết-kế",
      channelKind: "public",
      threadRootId: id(8),
      author: null,
      text: "Đã cập nhật thiết kế",
      createdAt: "2026-10-09T08:00:00Z"
    }
  ]
};

describe("search result mapping", () => {
  it("flattens groups in display order with hrefs", () => {
    const items = mapSearchResults(result);
    expect(items.map((item) => item.group)).toEqual([
      "tasks",
      "messages",
      "projects",
      "lists",
      "people"
    ]);
    expect(items[0]).toMatchObject({ href: `/p/${id(2)}/l/${id(3)}?task=${id(1)}`, key: "WEB-12" });
    expect(items[1]).toMatchObject({
      href: `/c/${id(7)}?thread=${id(8)}&message=${id(6)}`,
      meta: "#thiết-kế"
    });
    expect(items[2]).toMatchObject({ href: `/p/${id(2)}`, meta: "Dự án riêng tư" });
    expect(items[3]).toMatchObject({ href: `/p/${id(2)}/l/${id(3)}`, meta: "Web" });
    expect(countByGroup(items)).toEqual({
      tasks: 1,
      messages: 1,
      projects: 1,
      lists: 1,
      people: 1
    });
    expect(mapSearchResults(undefined)).toEqual([]);
  });

  it("links top-level messages without a thread param", () => {
    expect(messageHref({ channelId: id(7), messageId: id(6), threadRootId: null })).toBe(
      `/c/${id(7)}?message=${id(6)}`
    );
  });
});

describe("highlighting", () => {
  it("matches without case or Vietnamese diacritics and maps back to the original text", () => {
    const text = "Thiết kế Đăng nhập";
    expect(findMatches(text, "thiet ke")).toEqual([
      [0, 5],
      [6, 8]
    ]);
    expect(highlightSegments(text, "dang")).toEqual([
      { text: "Thiết kế ", match: false },
      { text: "Đăng", match: true },
      { text: " nhập", match: false }
    ]);
  });

  it("merges overlapping matches and handles no match", () => {
    expect(findMatches("aaaa", "aa a")).toEqual([[0, 4]]);
    expect(highlightSegments("Xin chào", "zzz")).toEqual([{ text: "Xin chào", match: false }]);
  });

  it("builds an excerpt around the first match", () => {
    const long = `${"mở đầu ".repeat(40)}điểm chính${" phần sau".repeat(40)}`;
    const excerpt = excerptAround(long, "diem chinh", 20);
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).toContain("điểm chính");
  });
});
