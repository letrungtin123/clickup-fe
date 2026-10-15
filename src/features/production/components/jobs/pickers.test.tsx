// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OptionSelect, SEARCHABLE_FROM } from "./pickers";

// Obviously fake ids and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projects = Array.from({ length: SEARCHABLE_FROM + 2 }, (_, index) => ({
  id: id(index + 1),
  label: index === 3 ? "VĐ · Dự án Đặc biệt" : `VD${index + 1} · Dự án mẫu ${index + 1}`
}));

afterEach(cleanup);

beforeAll(() => {
  // cmdk measures its list and scrolls the active option into view; jsdom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined });
  }
});

describe("OptionSelect — long lists are searchable (owner 2026-10-15)", () => {
  it("opens a search box, filters ignoring accents and case, and picks", async () => {
    const onChange = vi.fn();
    render(
      <OptionSelect
        aria-label="Dự án"
        options={projects}
        value={null}
        onChange={onChange}
        placeholder="Chọn dự án"
        searchPlaceholder="Tìm dự án…"
      />
    );
    const trigger = screen.getByRole("combobox", { name: "Dự án" });
    expect(trigger.textContent).toContain("Chọn dự án");
    await act(async () => {
      fireEvent.click(trigger);
      await Promise.resolve();
    });
    const search = await screen.findByPlaceholderText("Tìm dự án…");
    expect(screen.getAllByRole("option")).toHaveLength(projects.length);
    fireEvent.change(search, { target: { value: "dac biet" } });
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["VĐ · Dự án Đặc biệt"]);
    await act(async () => {
      fireEvent.click(options[0]!);
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledWith(id(4));
  });

  it("keeps the plain select for short lists", () => {
    render(
      <OptionSelect
        aria-label="Ca"
        options={projects.slice(0, 3)}
        value={id(2)}
        onChange={() => undefined}
        placeholder="Chọn ca"
      />
    );
    expect(screen.getByRole("combobox", { name: "Ca" }).textContent).toContain("VD2 · Dự án mẫu 2");
    expect(screen.queryByPlaceholderText("Tìm…")).toBeNull();
  });
});
