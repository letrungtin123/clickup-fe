// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RichTextDoc } from "@/contracts/rich-text";

import { RichTextView } from "./rich-text-view";

afterEach(cleanup);

const personId = "00000000-0000-4000-8000-00000000000b";
const doc: RichTextDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "mention", attrs: { id: "all", label: "all" } },
        { type: "text", text: " họp lúc 3 giờ, " },
        { type: "mention", attrs: { id: personId, label: "An Phạm" } }
      ]
    }
  ]
};

describe("RichTextView — @all chip (PD-061)", () => {
  it("renders @all as a distinct chip, never a profile button", () => {
    const onMentionClick = vi.fn();
    render(<RichTextView doc={doc} onMentionClick={onMentionClick} />);

    const all = screen.getByText("@all");
    expect(all.tagName).toBe("SPAN");
    expect(all.className).toContain("rt-mention");
    expect(all.dataset.all).toBe("true");
    expect(all.dataset.self).toBeUndefined();
    // People stay clickable.
    expect(screen.getByRole("button", { name: "@An Phạm" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("highlights @all like a mention of me for everyone but the author", () => {
    const { rerender } = render(<RichTextView doc={doc} selfId={personId} mentionAllSelf />);
    expect(screen.getByText("@all").dataset.self).toBe("true");
    expect(screen.getByText("@An Phạm").dataset.self).toBe("true");

    rerender(<RichTextView doc={doc} selfId="00000000-0000-4000-8000-0000000000ff" mentionAllSelf={false} />);
    expect(screen.getByText("@all").dataset.self).toBeUndefined();
    expect(screen.getByText("@An Phạm").dataset.self).toBeUndefined();
  });
});
