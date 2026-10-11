import { describe, expect, it } from "vitest";

import type { KnowledgeChangedEvent } from "@/contracts/knowledge";

import { knowledgeEventKeys } from "./realtime";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const event = (kind: KnowledgeChangedEvent["kind"], itemId: string | null = id(2)): KnowledgeChangedEvent => ({
  spaceId: id(1),
  itemId,
  kind,
  actorId: id(3),
  version: 4,
  at: "2026-10-11T10:00:00Z"
});

const keys = (value: KnowledgeChangedEvent) => knowledgeEventKeys(value).map((entry) => JSON.stringify(entry.key));

describe("knowledge realtime → cache keys", () => {
  it("refreshes the item, its versions and history, and the space lists on a new version", () => {
    const result = keys(event("item_updated"));
    expect(result).toContain(JSON.stringify(["knowledge", "item", id(2)]));
    expect(result).toContain(JSON.stringify(["knowledge", "item", id(2), "versions"]));
    expect(result).toContain(JSON.stringify(["knowledge", "item", id(2), "history"]));
    expect(result).toContain(JSON.stringify(["knowledge", "space", id(1), "items"]));
    expect(result).toContain(JSON.stringify(["knowledge", "space", id(1), "audit"]));
  });

  it("refreshes comments for comment events and the sidebar for membership changes", () => {
    expect(keys(event("comment"))).toContain(JSON.stringify(["knowledge", "item", id(2), "comments"]));
    expect(keys(event("members", null))).toEqual(
      expect.arrayContaining([JSON.stringify(["knowledge", "spaces"]), JSON.stringify(["knowledge", "space", id(1), "members"])])
    );
  });

  it("refreshes lists, trash and counts when items come and go", () => {
    for (const kind of ["item_created", "item_deleted", "item_restored"] as const) {
      expect(keys(event(kind))).toEqual(
        expect.arrayContaining([
          JSON.stringify(["knowledge", "space", id(1), "items"]),
          JSON.stringify(["knowledge", "space", id(1), "trash"]),
          JSON.stringify(["knowledge", "space", id(1)])
        ])
      );
    }
    expect(keys(event("structure", null))).toContain(JSON.stringify(["knowledge", "space", id(1), "items"]));
  });
});
