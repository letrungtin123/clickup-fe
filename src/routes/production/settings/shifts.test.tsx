// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { configReadOnlyMessage } from "@/features/production/config-access";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionShiftsRoute } from "./shifts";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const session = (superadmin: boolean) =>
  ({
    user: { id: id(900), displayName: "Người Thử", email: "viewer@example.test", avatarUrl: null },
    role: { permissions: [] },
    hasFullOrganizationAuthority: superadmin,
    productionRoles: ["ADMIN"],
    departments: ["PHOTO_RETOUCH"]
  }) as unknown as SessionContext;

const shifts = {
  items: [
    {
      id: id(1),
      name: "Chính thức",
      payMode: "POINTS" as const,
      requiresOtHours: false,
      sortOrder: 0,
      active: true
    },
    {
      id: id(2),
      name: "Ca khoán",
      payMode: "MONEY_IF_KPI" as const,
      requiresOtHours: true,
      sortOrder: 1,
      active: true
    }
  ]
};

const renderPage = (superadmin: boolean) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session(superadmin)}>
        <MemoryRouter>
          <ProductionShiftsRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → Ca làm (PD-050)", () => {
  it("is read-only for everyone but the superadmin: no add, edit dialog, drag handle or menu", async () => {
    vi.spyOn(productionApi, "shifts").mockResolvedValue(shifts);
    renderPage(false);
    const list = await screen.findByRole("list", { name: "Ca đang dùng" });
    expect(list.textContent).toContain("Ca khoán");
    expect(list.textContent).toContain("Khoán");
    expect(list.textContent).toContain("Nhập giờ OT");
    expect(screen.getByText(configReadOnlyMessage)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Thêm ca/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Kéo để sắp xếp Ca khoán" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tùy chọn cho Ca khoán" })).toBeNull();
    fireEvent.click(screen.getByText("Ca khoán"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays editable for the superadmin", async () => {
    vi.spyOn(productionApi, "shifts").mockResolvedValue(shifts);
    renderPage(true);
    expect(await screen.findByRole("button", { name: "Kéo để sắp xếp Ca khoán" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Thêm ca/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tùy chọn cho Ca khoán" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Ca khoán/ }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Sửa ca Ca khoán")).toBeTruthy();
    expect(screen.queryByText(configReadOnlyMessage)).toBeNull();
  });
});
