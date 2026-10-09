import { describe, expect, it } from "vitest";

import type { RichTextDoc } from "@/contracts/rich-text";

import { canSaveOnUnload, toDescriptionPayload } from "./description-save";

const paragraph = (text: string): RichTextDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }]
});

describe("description unload save (BUG-WK-17)", () => {
  it("normalizes an empty document to a cleared description", () => {
    expect(toDescriptionPayload({ type: "doc", content: [{ type: "paragraph" }] })).toEqual({ next: null, serialized: "null" });
    const payload = toDescriptionPayload(paragraph("Giao bản nháp trước thứ Sáu"));
    expect(payload?.next).not.toBeNull();
    expect(payload?.serialized).toContain("Giao bản nháp");
  });

  it("only sends with keepalive when it can leave synchronously and fits the quota", () => {
    const small = toDescriptionPayload(paragraph("ngắn"));
    expect(small && canSaveOnUnload(small, true)).toBe(true);
    expect(small && canSaveOnUnload(small, false)).toBe(false);
    // Multi-byte text counts in bytes, not characters.
    const large = { next: paragraph("ễ".repeat(25_000)), serialized: JSON.stringify(paragraph("ễ".repeat(25_000))) };
    expect(canSaveOnUnload(large, true)).toBe(false);
  });
});
