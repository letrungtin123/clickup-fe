// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { configReadOnlyMessage } from "@/features/production/config-access";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionProcessesRoute } from "./processes";

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

const processes = {
  items: [
    { id: id(1), name: "Retouch thường", isQc: false, sortOrder: 0, active: true },
    { id: id(2), name: "Checking", isQc: true, sortOrder: 1, active: true }
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
          <ProductionProcessesRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → Quy trình (PD-050)", () => {
  it("is read-only for everyone but the superadmin: QC as a badge, no add / rename / drag / switch / menu", async () => {
    vi.spyOn(productionApi, "processes").mockResolvedValue(processes);
    renderPage(false);
    const list = await screen.findByRole("list", { name: "Quy trình đang dùng" });
    expect(Array.from(list.querySelectorAll("li")).map((row) => row.textContent)).toEqual([
      "Retouch thường",
      "CheckingQC"
    ]);
    expect(screen.getByText(configReadOnlyMessage)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Tên quy trình mới" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Kéo để sắp xếp Checking" })).toBeNull();
    // No QC switch on any row (nothing archived: the archived toggle is not shown either).
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Tùy chọn cho Checking" })).toBeNull();
    fireEvent.click(screen.getByText("Retouch thường"));
    expect(
      screen.queryByRole("textbox", { name: "Tên mới cho quy trình Retouch thường" })
    ).toBeNull();
  });

  it("stays editable for the superadmin", async () => {
    vi.spyOn(productionApi, "processes").mockResolvedValue(processes);
    renderPage(true);
    fireEvent.click(await screen.findByRole("button", { name: "Retouch thường" }));
    expect(
      screen.getByRole("textbox", { name: "Tên mới cho quy trình Retouch thường" })
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Tên quy trình mới" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kéo để sắp xếp Checking" })).toBeTruthy();
    // One QC switch per active process.
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Tùy chọn cho Checking" })).toBeTruthy();
    expect(screen.queryByText(configReadOnlyMessage)).toBeNull();
  });
});
