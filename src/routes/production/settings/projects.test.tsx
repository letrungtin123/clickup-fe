// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionProject } from "@/contracts/production-catalog";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { configReadOnlyMessage } from "@/features/production/config-access";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionProjectsRoute } from "./projects";

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

const project = (n: number, code: string, name: string): ProductionProject => ({
  id: id(n),
  code,
  name,
  description: "Mô tả thử",
  clientId: null,
  clientName: null,
  qcBufferHours: 0,
  active: true
});

const renderPage = (superadmin: boolean) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session(superadmin)}>
        <MemoryRouter>
          <ProductionProjectsRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → Dự án (PD-050)", () => {
  it("is read-only for everyone but the superadmin: no add button, edit dialog or row menu", async () => {
    vi.spyOn(productionApi, "projects").mockResolvedValue({
      items: [project(1, "ABC", "Dự án Thử")]
    });
    renderPage(false);
    expect(await screen.findByText("Dự án Thử")).toBeTruthy();
    expect(screen.getByText(configReadOnlyMessage)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Thêm dự án/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tùy chọn cho ABC" })).toBeNull();
    fireEvent.click(screen.getByText("Dự án Thử"));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Search still works.
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm dự án" }), {
      target: { value: "không khớp" }
    });
    expect(screen.getByText("Không có dự án phù hợp")).toBeTruthy();
  });

  it("stays editable for the superadmin", async () => {
    vi.spyOn(productionApi, "projects").mockResolvedValue({
      items: [project(1, "ABC", "Dự án Thử")]
    });
    renderPage(true);
    const row = await screen.findByRole("button", { name: /Dự án Thử/ });
    expect(screen.getByRole("button", { name: /Thêm dự án/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tùy chọn cho ABC" })).toBeTruthy();
    expect(screen.queryByText(configReadOnlyMessage)).toBeNull();
    fireEvent.click(row);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Sửa dự án ABC")).toBeTruthy();
  });
});
