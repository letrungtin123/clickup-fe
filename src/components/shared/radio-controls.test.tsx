// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { SegmentedControl } from "./radio-controls";

const Harness = () => {
  const [value, setValue] = useState<"list" | "board" | "table">("list");
  return (
    <SegmentedControl
      aria-label="Chế độ xem"
      value={value}
      onChange={setValue}
      options={[
        { value: "list", label: "Danh sách" },
        { value: "board", label: "Bảng" },
        { value: "table", label: "Bảng tính" }
      ]}
    />
  );
};

afterEach(cleanup);

describe("SegmentedControl", () => {
  it("exposes a radiogroup with a single tab stop", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Chế độ xem" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false"
    ]);
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
  });

  it("moves selection and focus with arrow keys, wrapping around", () => {
    render(<Harness />);
    const [list, board, table] = screen.getAllByRole("radio");
    act(() => list?.focus());
    fireEvent.keyDown(list!, { key: "ArrowRight" });
    expect(board?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(board);

    fireEvent.keyDown(board!, { key: "End" });
    expect(table?.getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(table!, { key: "ArrowRight" });
    expect(list?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(list);
  });

  it("selects on click", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Bảng tính" }));
    expect(screen.getByRole("radio", { name: "Bảng tính" }).getAttribute("aria-checked")).toBe(
      "true"
    );
  });
});
