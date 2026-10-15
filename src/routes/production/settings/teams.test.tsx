// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { configReadOnlyMessage } from "@/features/production/config-access";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionTeamsRoute } from "./teams";

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

const renderPage = (superadmin: boolean) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session(superadmin)}>
        <MemoryRouter>
          <ProductionTeamsRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → Team (PD-050)", () => {
  it("is read-only for everyone but the superadmin: no add form, rename or row menu", async () => {
    vi.spyOn(productionApi, "teams").mockResolvedValue({
      items: [
        { id: id(1), name: "Team Sáng", active: true, memberCount: 4 },
        { id: id(2), name: "Team Tối", active: true, memberCount: 2 }
      ]
    });
    renderPage(false);
    expect(await screen.findByText("Team Sáng")).toBeTruthy();
    expect(screen.getByText(configReadOnlyMessage)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Tên team mới" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thêm team" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tùy chọn cho Team Sáng" })).toBeNull();
    // The name is plain text: clicking it opens no rename field.
    expect(screen.queryByRole("button", { name: "Team Sáng" })).toBeNull();
    fireEvent.click(screen.getByText("Team Sáng"));
    expect(screen.queryByRole("textbox", { name: "Tên mới cho team Team Sáng" })).toBeNull();
    expect(screen.getByText("4 thành viên")).toBeTruthy();
  });

  it("stays editable for the superadmin", async () => {
    vi.spyOn(productionApi, "teams").mockResolvedValue({
      items: [{ id: id(1), name: "Team Sáng", active: true, memberCount: 4 }]
    });
    renderPage(true);
    fireEvent.click(await screen.findByRole("button", { name: "Team Sáng" }));
    expect(screen.getByRole("textbox", { name: "Tên mới cho team Team Sáng" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Tên team mới" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thêm team" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tùy chọn cho Team Sáng" })).toBeTruthy();
    expect(screen.queryByText(configReadOnlyMessage)).toBeNull();
  });
});
