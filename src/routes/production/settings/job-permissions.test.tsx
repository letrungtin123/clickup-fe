// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultJobPermissions,
  type JobPermissionMatrix,
  type ProductionSettings
} from "@/contracts/production-catalog";
import { productionApi } from "@/features/production/api";

import { ProductionJobPermissionsRoute } from "./job-permissions";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const settings = (jobPermissions: JobPermissionMatrix): ProductionSettings => ({
  kpiCloseDay: 31,
  kpiCloseDays: [{ fromPeriod: null, closeDay: 31 }],
  scoresPublic: true,
  moneyPublic: false,
  kpiProrateLeave: false,
  khoanPayPolicy: "ALWAYS",
  anomalyFailRate: 0.15,
  dueSoonHours: 2,
  kpiDefaultMember: 100,
  kpiDefaultLeader: 80,
  chatAttachmentsEnabled: true,
  jobPermissions,
  timezone: "Asia/Ho_Chi_Minh"
});

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProductionJobPermissionsRoute />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Phân quyền Job (PD-036)", () => {
  it("shows a scope select per role × action, ADMIN fixed at “Tất cả”", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings(defaultJobPermissions));
    renderPage();
    expect((await screen.findByRole("combobox", { name: "Xem — Leader" })).textContent).toContain(
      "Tất cả"
    );
    expect(screen.getByRole("combobox", { name: "Xoá — Nhân viên" }).textContent).toContain(
      "Của mình"
    );
    // 4 configurable roles × 4 actions; ADMIN has no select.
    expect(screen.getAllByRole("combobox")).toHaveLength(16);
    expect(screen.queryByRole("combobox", { name: /Quản trị/ })).toBeNull();
    expect(screen.getByText("Quản trị luôn có toàn quyền")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Khôi phục mặc định" }).hasAttribute("disabled")
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).toBeNull();
  });

  it("“Khôi phục mặc định” needs a save, which sends only the matrix", async () => {
    const custom: JobPermissionMatrix = {
      ...defaultJobPermissions,
      STAFF: { view: "own", create: "none", update: "own", delete: "none" }
    };
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings(custom));
    const update = vi
      .spyOn(productionApi, "updateSettings")
      .mockImplementation((input) =>
        Promise.resolve({ ...settings(custom), ...input } as ProductionSettings)
      );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Khôi phục mặc định" }));
    expect(screen.getByText(/2 thay đổi chưa lưu/)).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Tạo — Nhân viên" }).textContent).toContain(
      "Của mình"
    );
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0]).toEqual({ jobPermissions: defaultJobPermissions });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).toBeNull());
  });

  it("“Hoàn tác” drops the draft", async () => {
    const custom: JobPermissionMatrix = {
      ...defaultJobPermissions,
      QC: { view: "all", create: "own", update: "own", delete: "own" }
    };
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings(custom));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Khôi phục mặc định" }));
    expect(screen.getByRole("combobox", { name: "Xem — QC" }).textContent).toContain("Của mình");
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    expect(screen.getByRole("combobox", { name: "Xem — QC" }).textContent).toContain("Tất cả");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).toBeNull());
  });
});
