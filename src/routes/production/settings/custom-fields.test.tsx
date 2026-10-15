// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CustomField } from "@/contracts/production-catalog";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionCustomFieldsRoute } from "./custom-fields";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const field = (n: number, label: string, overrides: Partial<CustomField> = {}): CustomField => ({
  id: id(n),
  entity: "JOB",
  key: `field_${n}`,
  label,
  type: "TEXT",
  options: [],
  required: false,
  showInTable: false,
  sortOrder: n,
  active: true,
  ...overrides
});

const fields: CustomField[] = [
  field(1, "Mã đơn hàng", { required: true, showInTable: true }),
  field(2, "Mức ưu tiên", {
    type: "SELECT",
    options: [
      { value: "cao", label: "Cao", color: "rose" },
      { value: "thap", label: "Thấp", color: "slate" }
    ]
  }),
  field(3, "Ghi chú cũ", { active: false })
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
          <ProductionCustomFieldsRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → Trường tùy chỉnh (PD-050)", () => {
  it("the superadmin adds, drags, edits and archives", async () => {
    vi.spyOn(productionApi, "customFields").mockResolvedValue({ items: fields });
    renderPage();
    await screen.findByRole("list", { name: "Trường đang dùng của Job" });
    expect(screen.getByRole("button", { name: "Thêm trường" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kéo để sắp xếp Mã đơn hàng" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tùy chọn cho Mức ưu tiên" })).toBeTruthy();
    expect(screen.queryByText(/chế độ chỉ đọc/)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Mã đơn hàng/ }));
      await Promise.resolve();
    });
    expect(await screen.findByRole("dialog", { name: "Sửa trường Mã đơn hàng" })).toBeTruthy();
  });

  it("a production Admin reads the fields and their options, with nothing to edit", async () => {
    vi.spyOn(productionApi, "customFields").mockResolvedValue({ items: fields });
    renderPage({ superadmin: false });
    const list = await screen.findByRole("list", { name: "Trường đang dùng của Job" });
    expect(
      screen.getByText(
        "Chỉ Siêu quản trị chỉnh sửa Cấu hình Photo Retouch. Bạn đang xem ở chế độ chỉ đọc."
      )
    ).toBeTruthy();
    expect(Array.from(list.querySelectorAll("li")).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Mã đơn hàng"),
      expect.stringContaining("Mức ưu tiên")
    ]);
    // A select field lists its options inline (the dialog never opens).
    expect(list.textContent).toContain("Cao");
    expect(list.textContent).toContain("Thấp");

    expect(screen.queryByRole("button", { name: "Thêm trường" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Kéo để sắp xếp / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Tùy chọn cho / })).toBeNull();
    expect(screen.queryByRole("button", { name: /Mã đơn hàng/ })).toBeNull();
    fireEvent.click(screen.getByText("Mã đơn hàng"));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Viewing stays: the entity switch and the archived toggle.
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByRole("list", { name: "Trường đã lưu trữ" })).toBeTruthy();
    expect(screen.getByText("Ghi chú cũ")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Task/ }));
    expect(await screen.findByText("Chưa có trường cho Task")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thêm trường" })).toBeNull();
  });
});
