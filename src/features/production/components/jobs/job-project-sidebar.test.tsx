// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { productionKeys } from "../../keys";
import { JobProjectSidebar } from "./job-project-sidebar";

// PD-067 — the Job page's project sidebar (facets). Obviously fake ids and names (public repository).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projects = [
  { projectId: id(2), code: "AXP", name: "Axon Đẹp", active: true, count: 4 },
  { projectId: id(3), code: "BRX", name: "Brix", active: false, count: 7 },
  { projectId: id(4), code: "CAT", name: "CAT", active: true, count: 0 }
];

const renderSidebar = (overrides: Partial<Parameters<typeof JobProjectSidebar>[0]> = {}) => {
  const props = {
    projects,
    isPending: false,
    isError: false,
    onRetry: vi.fn(),
    selectedId: null,
    onSelect: vi.fn(),
    onHide: vi.fn(),
    ...overrides
  };
  render(<JobProjectSidebar {...props} />);
  return props;
};

afterEach(cleanup);

describe("JobProjectSidebar (PD-067)", () => {
  it("lists “Tất cả” with every job, then each project with its count; the selection is highlighted", () => {
    renderSidebar({ selectedId: id(4) });
    const nav = screen.getByRole("navigation", { name: "Lọc job theo dự án" });
    const items = within(nav).getAllByRole("button");
    expect(items.map((item) => item.textContent)).toEqual([
      "Tất cả11",
      "AXPAxon Đẹp4",
      "BRXBrixlưu trữ7",
      "CAT0"
    ]);
    expect(items[3]!.getAttribute("aria-current")).toBe("true");
    expect(items[0]!.getAttribute("aria-current")).toBe("false");
  });

  it("a click filters the list by that project (or every project)", () => {
    const props = renderSidebar({ selectedId: id(2) });
    fireEvent.click(screen.getByRole("button", { name: /^BRX/ }));
    expect(props.onSelect).toHaveBeenCalledWith(id(3));
    fireEvent.click(screen.getByRole("button", { name: /^Tất cả/ }));
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it("searches code and name, accents ignored", () => {
    renderSidebar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm dự án" }), {
      target: { value: "dep" }
    });
    const nav = screen.getByRole("navigation", { name: "Lọc job theo dự án" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((item) => item.textContent)
    ).toEqual(["Tất cả11", "AXPAxon Đẹp4"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm dự án" }), {
      target: { value: "zzz" }
    });
    expect(screen.getByText("Không có dự án khớp.")).toBeTruthy();
  });

  it("loading, error and hiding", () => {
    const props = renderSidebar({ projects: undefined, isPending: false, isError: true });
    expect(screen.getByText("Không tải được danh sách dự án.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(props.onRetry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ẩn danh sách dự án" }));
    expect(props.onHide).toHaveBeenCalled();
  });
});

describe("facets query key (PD-067)", () => {
  it("sits under the job lists' prefix, apart from any list page", () => {
    expect(productionKeys.jobFacets({ q: "a" }).slice(0, 2)).toEqual([...productionKeys.jobs()]);
    expect(productionKeys.jobFacets({ q: "a" })).toEqual([
      "production",
      "jobs",
      "facets",
      { q: "a" }
    ]);
  });
});
