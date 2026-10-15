// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionMe } from "@/contracts/production-catalog";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { configReadOnlyMessage } from "@/features/production/config-access";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionClientsRoute, ProductionClientsSettingsRoute } from "./clients";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids and people (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const session = (superadmin: boolean) =>
  ({
    user: { id: id(900), displayName: "Người Thử", email: "viewer@example.test", avatarUrl: null },
    role: { permissions: [] },
    hasFullOrganizationAuthority: superadmin,
    productionRoles: ["ACCOUNT"],
    departments: ["PHOTO_RETOUCH"]
  }) as unknown as SessionContext;

const me = {
  roles: ["ACCOUNT"],
  isAdmin: false,
  teamId: null,
  jobPermissions: { view: "all", create: "all", update: "all", delete: "none" },
  settings: { timezone: "Asia/Ho_Chi_Minh" }
} as unknown as ProductionMe;

const clients = {
  items: [
    {
      id: id(1),
      name: "Khách Thử",
      note: "Ghi chú thử",
      active: true,
      customValues: {},
      tagIds: [],
      projectCount: 2
    }
  ]
};

const renderPage = (page: ReactNode, superadmin: boolean) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session(superadmin)}>
        <MemoryRouter>{page}</MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.spyOn(productionApi, "me").mockResolvedValue(me);
  vi.spyOn(productionApi, "customFields").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "tags").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "clients").mockResolvedValue(clients);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Khách hàng (PD-050)", () => {
  it("top-level page: an Account reads the list with the note, no add / edit / row menu", async () => {
    renderPage(<ProductionClientsRoute />, false);
    expect(await screen.findByText("Khách Thử")).toBeTruthy();
    expect(screen.getAllByText(configReadOnlyMessage)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Thêm/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tùy chọn cho Khách Thử" })).toBeNull();
    fireEvent.click(screen.getByText("Khách Thử"));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Search still filters.
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm khách hàng" }), {
      target: { value: "không khớp" }
    });
    expect(screen.getByText("Không có khách hàng phù hợp")).toBeTruthy();
  });

  it("settings page: the note comes from PageIntro once, the list is read-only", async () => {
    renderPage(<ProductionClientsSettingsRoute />, false);
    expect(await screen.findByText("Khách Thử")).toBeTruthy();
    expect(screen.getAllByText(configReadOnlyMessage)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Thêm/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tùy chọn cho Khách Thử" })).toBeNull();
  });

  it("stays editable for the superadmin on both pages", async () => {
    renderPage(<ProductionClientsRoute />, true);
    const row = await screen.findByRole("button", { name: /^Khách Thử/ });
    expect(screen.queryByText(configReadOnlyMessage)).toBeNull();
    expect(screen.getByRole("button", { name: /Thêm/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tùy chọn cho Khách Thử" })).toBeTruthy();
    fireEvent.click(row);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Sửa Khách Thử")).toBeTruthy();
    cleanup();

    renderPage(<ProductionClientsSettingsRoute />, true);
    expect(await screen.findByRole("button", { name: /^Khách Thử/ })).toBeTruthy();
    expect(screen.queryByText(configReadOnlyMessage)).toBeNull();
    expect(screen.getByRole("button", { name: /Thêm/ })).toBeTruthy();
  });
});
