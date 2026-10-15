// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultJobPermissions,
  type ProductionSettings
} from "@/contracts/production-catalog";
import { adminApi } from "@/features/admin/api";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import type { SessionContext } from "@/lib/api/schemas";

import { RolesSettingsRoute } from "./roles";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pending = () => new Promise<never>(() => undefined);

const settings = {
  scoresPublic: true,
  moneyPublic: false,
  jobPermissions: defaultJobPermissions,
  timezone: "Asia/Ho_Chi_Minh"
} as unknown as ProductionSettings;

/** Photo Retouch is the department shown; `superadmin` decides who edits the job permission matrix (PD-050). */
const renderPage = ({ superadmin }: { superadmin: boolean }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const session = {
    hasFullOrganizationAuthority: superadmin,
    user: { id: id(1) },
    role: { id: id(2), key: superadmin ? "superadmin" : "member", permissions: ["role.view"] },
    departments: ["PHOTO_RETOUCH"],
    currentDepartment: "PHOTO_RETOUCH",
    canSwitchDepartment: false
  } as unknown as SessionContext;
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter>
          <RolesSettingsRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  // Organization roles load in the background; the viewer is a production ADMIN either way.
  vi.spyOn(adminApi, "roles").mockReturnValue(pending());
  vi.spyOn(adminApi, "permissions").mockReturnValue(pending());
  vi.spyOn(productionApi, "me").mockResolvedValue({
    roles: ["ADMIN"],
    isAdmin: true,
    settings,
    jobPermissions: { view: "all", create: "all", update: "all", delete: "all" }
  } as unknown as Awaited<ReturnType<typeof productionApi.me>>);
  vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cài đặt → Vai trò & phân quyền — Photo Retouch (PD-050)", () => {
  it("the superadmin edits the job permission matrix", async () => {
    renderPage({ superadmin: true });
    expect(await screen.findByRole("combobox", { name: "Xem job — Leader" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mặc định Job" })).toBeTruthy();
    expect(screen.queryByText("Chỉ Siêu quản trị chỉnh sửa phân quyền Photo Retouch.")).toBeNull();
  });

  it("a production Admin reads it, with a short note and no controls", async () => {
    const update = vi.spyOn(productionApi, "updateSettings");
    renderPage({ superadmin: false });
    expect(
      await screen.findByText("Chỉ Siêu quản trị chỉnh sửa phân quyền Photo Retouch.")
    ).toBeTruthy();
    const matrix = await screen.findByRole("region", { name: "Phân quyền Photo Retouch theo vai trò" });
    // The scopes as text (the default matrix: Leader sees every job).
    expect(await screen.findAllByTitle("Chỉ Siêu quản trị sửa được")).not.toHaveLength(0);
    expect(matrix.textContent).toContain("Tất cả");
    expect(screen.queryByRole("combobox", { name: /— Leader$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mặc định Job" })).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
