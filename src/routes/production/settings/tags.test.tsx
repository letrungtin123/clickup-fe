// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import type { Tag } from "@/features/production/types";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionTagsRoute } from "./tags";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const tags: Tag[] = [
  { id: id(1), name: "Gấp", color: "rose", active: true },
  { id: id(2), name: "Khách VIP", color: "amber", active: true },
  { id: id(3), name: "Mùa cũ", color: "slate", active: false }
];

/** PD-050: only the organization superadmin edits; a production Admin reads the page. */
const renderPage = ({ superadmin = true }: { superadmin?: boolean } = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const session = { hasFullOrganizationAuthority: superadmin } as unknown as SessionContext;
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter>
          <ProductionTagsRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → Tag (PD-050)", () => {
  it("the superadmin adds, recolours, renames and archives", async () => {
    vi.spyOn(productionApi, "tags").mockResolvedValue({ items: tags });
    const update = vi.spyOn(productionApi, "updateTag").mockResolvedValue({ items: tags });
    renderPage();
    await screen.findByRole("button", { name: "Gấp" });
    expect(screen.getByRole("textbox", { name: "Tên tag mới" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thêm tag" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Màu của tag Gấp/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tùy chọn cho Gấp" })).toBeTruthy();
    expect(screen.queryByText(/chế độ chỉ đọc/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Gấp" }));
    const field = screen.getByRole("textbox", { name: "Tên mới cho tag Gấp" });
    fireEvent.change(field, { target: { value: "Rất gấp" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(update).toHaveBeenCalledWith(id(1), { name: "Rất gấp" }));
  });

  it("a production Admin reads the tags (search and archived toggle still work), with nothing to edit", async () => {
    vi.spyOn(productionApi, "tags").mockResolvedValue({ items: tags });
    renderPage({ superadmin: false });
    expect(await screen.findByText("Gấp")).toBeTruthy();
    expect(
      screen.getByText(
        "Chỉ Siêu quản trị chỉnh sửa Cấu hình Photo Retouch. Bạn đang xem ở chế độ chỉ đọc."
      )
    ).toBeTruthy();
    expect(screen.getByText("Khách VIP")).toBeTruthy();
    expect(screen.queryByText("Mùa cũ")).toBeNull();

    expect(screen.queryByRole("textbox", { name: "Tên tag mới" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thêm tag" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Màu của tag / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Tùy chọn cho / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Gấp" })).toBeNull();
    fireEvent.click(screen.getByText("Gấp"));
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByText("Mùa cũ")).toBeTruthy();
    // No row menu says "Khôi phục": the archived state is spelled out.
    expect(screen.getByText("Đã lưu trữ")).toBeTruthy();
  });
});
