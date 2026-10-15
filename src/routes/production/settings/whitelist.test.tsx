// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { configReadOnlyMessage } from "@/features/production/config-access";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionWhitelistRoute } from "./whitelist";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids and addresses (the repository is public).
const session = (superadmin: boolean) =>
  ({
    user: {
      id: "00000000-0000-4000-8000-000000000900",
      displayName: "Người Thử",
      email: "viewer@example.test",
      avatarUrl: null
    },
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
          <ProductionWhitelistRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

const emails = {
  items: [
    {
      email: "nhanvien1@example.test",
      addedBy: "Quản trị Thử",
      createdAt: "2026-01-02T03:00:00.000Z"
    }
  ]
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → Whitelist email (PD-050)", () => {
  it("is read-only for everyone but the superadmin: no paste form, no remove buttons", async () => {
    vi.spyOn(productionApi, "allowedEmails").mockResolvedValue(emails);
    renderPage(false);
    expect(await screen.findByText("nhanvien1@example.test")).toBeTruthy();
    expect(screen.getByText(configReadOnlyMessage)).toBeTruthy();
    expect(screen.queryByText("Thêm email")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Danh sách email" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thêm vào danh sách" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Xóa nhanvien1@example.test khỏi danh sách" })
    ).toBeNull();
  });

  it("stays editable for the superadmin", async () => {
    vi.spyOn(productionApi, "allowedEmails").mockResolvedValue(emails);
    renderPage(true);
    expect(
      await screen.findByRole("button", { name: "Xóa nhanvien1@example.test khỏi danh sách" })
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Danh sách email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thêm vào danh sách" })).toBeTruthy();
    expect(screen.queryByText(configReadOnlyMessage)).toBeNull();
  });
});
