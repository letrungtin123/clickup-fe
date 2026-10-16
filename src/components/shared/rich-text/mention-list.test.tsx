// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UserRef } from "@/contracts/work";

import type { MentionAllCandidate } from "./mention-candidates";

import { MentionList, type MentionListHandle } from "./mention-list";

// Obviously fake people (the repository is public).
const people: UserRef[] = Array.from({ length: 50 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  displayName: `Người ${index + 1}`,
  email: null,
  avatarUrl: null
}));

const rowHeight = 32;
const listHeight = 256;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** jsdom has no layout: rows stack at `rowHeight`, the list shows `listHeight` pixels. */
const fakeLayout = () => {
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (
    this: HTMLElement
  ) {
    return 4 + Number(this.dataset.index ?? 0) * rowHeight;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(rowHeight);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(listHeight);
};

const press = (ref: React.RefObject<MentionListHandle | null>, key: string) =>
  act(() => {
    ref.current?.onKeyDown(new KeyboardEvent("keydown", { key }));
  });

describe("MentionList (PD-053)", () => {
  it("lists every candidate in a scrolling list and keeps the keyboard highlight in view", () => {
    fakeLayout();
    const ref = createRef<MentionListHandle>();
    const command = vi.fn();
    render(<MentionList ref={ref} items={people} loading={false} query="" command={command} />);

    const list = screen.getByRole("listbox", { name: "Gợi ý nhắc tên" });
    expect(screen.getAllByRole("option")).toHaveLength(50);
    expect(list.className).toContain("overflow-y-auto");
    expect(list.className).toContain("max-h-64");

    // ↑ from the first row wraps to the last one: the list (only) scrolls down to it.
    press(ref, "ArrowUp");
    const last = screen.getByRole("option", { name: /Người 50/ });
    expect(last.getAttribute("aria-selected")).toBe("true");
    expect(list.scrollTop).toBe(4 + 49 * rowHeight + rowHeight + 4 - listHeight);

    // ↓ wraps back to the first row: scrolled back to the top.
    press(ref, "ArrowDown");
    expect(screen.getByRole("option", { name: /Người 1$/ }).getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(list.scrollTop).toBe(0);

    press(ref, "Enter");
    expect(command).toHaveBeenCalledWith({ id: people[0]?.id, label: "Người 1" });
  });
});

describe("MentionList — @all (PD-061)", () => {
  const all: MentionAllCandidate = { kind: "all", id: "all", description: "Nhắc tất cả 12 thành viên trong kênh" };

  it("shows @all first with its description and inserts { id: \"all\", label: \"all\" }", () => {
    fakeLayout();
    const ref = createRef<MentionListHandle>();
    const command = vi.fn();
    render(<MentionList ref={ref} items={[all, ...people.slice(0, 3)]} loading={false} query="" command={command} />);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(4);
    expect(options[0]?.textContent).toContain("@all");
    expect(options[0]?.textContent).toContain("Nhắc tất cả 12 thành viên trong kênh");
    expect(options[0]?.dataset.mentionAll).toBe("true");
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(options[1]?.dataset.mentionAll).toBeUndefined();

    press(ref, "Enter");
    expect(command).toHaveBeenCalledWith({ id: "all", label: "all" });

    // The people below still insert themselves.
    press(ref, "ArrowDown");
    press(ref, "Enter");
    expect(command).toHaveBeenLastCalledWith({ id: people[0]?.id, label: "Người 1" });
  });
});
