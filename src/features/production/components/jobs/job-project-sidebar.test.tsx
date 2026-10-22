// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { productionKeys } from "../../keys";
import { JobProjectSelect, JobProjectSidebar } from "./job-project-sidebar";

// PD-067 / PD-078 — the Job page's Project sidebar (facets). Obviously fake ids and names (public repository).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const me = id(900);
const projects = [
  // The API's order is not trusted: the sidebar sorts by code itself (Vietnamese collation).
  { projectId: id(4), code: "CAT", name: "CAT", active: true, count: 0, ownerId: id(901), ownerIds: [id(901), me] },
  { projectId: id(3), code: "BRX", name: "Brix", active: false, count: 7, ownerId: null, ownerIds: [] },
  { projectId: id(2), code: "AXP", name: "Axon Đẹp", active: true, count: 4, ownerId: id(901), ownerIds: [id(901)] }
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
    myId: me,
    ...overrides
  };
  render(<JobProjectSidebar {...props} />);
  return props;
};
const nav = () => screen.getByRole("navigation", { name: "Lọc job theo Project" });
const labels = () =>
  within(nav())
    .getAllByRole("button")
    .map((item) => item.textContent);

afterEach(cleanup);

describe("JobProjectSidebar (PD-067, PD-078)", () => {
  it("lists “Tất cả”, then EVERY active Project by code (0 included, mine crowned); the inactive ones folded", () => {
    renderSidebar({ selectedId: id(4) });
    expect(labels()).toEqual(["Tất cả11", "AXPAxon Đẹp4", "CAT0", "Ngừng hoạt động (1)7"]);
    const items = within(nav()).getAllByRole("button");
    expect(items[2]!.getAttribute("aria-current")).toBe("true");
    expect(items[0]!.getAttribute("aria-current")).toBe("false");
    expect(within(items[2]!).getByLabelText("Bạn phụ trách")).toBeTruthy();
    expect(within(items[1]!).queryByLabelText("Bạn phụ trách")).toBeNull();
    // Unfold the inactive group.
    const group = screen.getByRole("button", { name: /Ngừng hoạt động/ });
    expect(group.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(group);
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(labels()).toEqual([
      "Tất cả11",
      "AXPAxon Đẹp4",
      "CAT0",
      "Ngừng hoạt động (1)7",
      "BRXBrix7"
    ]);
  });

  it("the inactive group opens by itself when one of its Projects is selected", () => {
    renderSidebar({ selectedId: id(3) });
    expect(screen.getByRole("button", { name: /^BRX/ }).getAttribute("aria-current")).toBe("true");
  });

  it("a click filters the list by that Project (or every Project)", () => {
    const props = renderSidebar({ selectedId: id(2) });
    fireEvent.click(screen.getByRole("button", { name: /^CAT/ }));
    expect(props.onSelect).toHaveBeenCalledWith(id(4));
    fireEvent.click(screen.getByRole("button", { name: /^Tất cả/ }));
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it("searches code and name, accents ignored, in both groups", () => {
    renderSidebar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm Project" }), {
      target: { value: "dep" }
    });
    expect(labels()).toEqual(["Tất cả11", "AXPAxon Đẹp4"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm Project" }), {
      target: { value: "bri" }
    });
    expect(labels()).toEqual(["Tất cả11", "Ngừng hoạt động (1)7", "BRXBrix7"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm Project" }), {
      target: { value: "zzz" }
    });
    expect(screen.getByText("Không có Project khớp.")).toBeTruthy();
  });

  it("loading, error and hiding", () => {
    const props = renderSidebar({ projects: undefined, isPending: false, isError: true });
    expect(screen.getByText("Không tải được danh sách Project.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(props.onRetry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ẩn danh sách Project" }));
    expect(props.onHide).toHaveBeenCalled();
  });

  it("an organization without Projects says so", () => {
    renderSidebar({ projects: [] });
    expect(screen.getByText("Chưa có Project nào.")).toBeTruthy();
  });
});

describe("JobProjectSelect (phones)", () => {
  it("names every Project with its count and marks the inactive ones", () => {
    render(
      <JobProjectSelect
        projects={projects}
        isPending={false}
        isError={false}
        onRetry={vi.fn()}
        selectedId={null}
        onSelect={vi.fn()}
        myId={me}
      />
    );
    expect(screen.getByRole("combobox", { name: "Lọc job theo Project" }).textContent).toContain(
      "Tất cả Project · 11 job"
    );
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
