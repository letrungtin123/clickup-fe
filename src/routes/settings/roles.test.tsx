// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultFeaturePermissions,
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
  featurePermissions: defaultFeaturePermissions,
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
    jobPermissions: { view: "all", create: "all", update: "all", delete: "all" },
    features: ["qc_queue", "view_others_scores", "leader_dashboard", "leave_approval", "clients"]
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
    const matrix = await screen.findByRole("region", {
      name: "Phân quyền Photo Retouch theo vai trò"
    });
    // The scopes as text (the default matrix: Leader sees every job).
    expect(await screen.findAllByTitle("Chỉ Siêu quản trị sửa được")).not.toHaveLength(0);
    expect(matrix.textContent).toContain("Tất cả");
    expect(screen.queryByRole("combobox", { name: /— Leader$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mặc định Job" })).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("the superadmin edits “Quyền theo tính năng” and saves it with one PATCH (PD-065)", async () => {
    const update = vi
      .spyOn(productionApi, "updateSettings")
      .mockImplementation((input) =>
        Promise.resolve({ ...settings, ...input } as ProductionSettings)
      );
    renderPage({ superadmin: true });
    const box = await screen.findByRole("checkbox", { name: "Bất thường — Quản trị" });
    expect(screen.getByText("Quyền theo tính năng")).toBeTruthy();
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(box.closest("label")?.getAttribute("data-changed")).toBe("true");
    fireEvent.click(screen.getByRole("checkbox", { name: "Khách hàng — Account" }));
    expect(await screen.findByText("2 thay đổi chưa lưu.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      featurePermissions: {
        ...defaultFeaturePermissions,
        anomalies: ["ADMIN", "DIRECTOR"],
        clients: ["ADMIN"]
      }
    });
  });

  it("“Mặc định tính năng” drafts the owner's defaults; Hoàn tác drops the draft", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue({
      ...settings,
      featurePermissions: { ...defaultFeaturePermissions, anomalies: ["LEADER", "DIRECTOR"] }
    });
    renderPage({ superadmin: true });
    const leader = await screen.findByRole("checkbox", { name: "Bất thường — Leader" });
    expect(leader.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Mặc định tính năng" }));
    expect(leader.getAttribute("aria-checked")).toBe("false");
    expect(await screen.findByText("1 thay đổi chưa lưu.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    expect(leader.getAttribute("aria-checked")).toBe("true");
  });

  it("a production Admin reads the features without changing them", async () => {
    const update = vi.spyOn(productionApi, "updateSettings");
    renderPage({ superadmin: false });
    const box = await screen.findByRole("checkbox", { name: "Bất thường — Director" });
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(box.hasAttribute("data-disabled")).toBe(true);
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("button", { name: "Mặc định tính năng" })).toBeNull();
    expect(screen.queryByText(/thay đổi chưa lưu/)).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("adds the Director column to the job permission matrix", async () => {
    renderPage({ superadmin: true });
    expect(
      (await screen.findByRole("combobox", { name: "Xem job — Director" })).textContent
    ).toContain("Tất cả");
    expect(screen.getByRole("combobox", { name: "Sửa — Director" }).textContent).toContain("Không");
  });
});
