// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultJobPermissions, type ProductionSettings } from "@/contracts/production-catalog";
import { productionApi } from "@/features/production/api";

import { ProductionGeneralRoute } from "./general";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const settings: ProductionSettings = {
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
  jobPermissions: defaultJobPermissions,
  timezone: "Asia/Ho_Chi_Minh"
};

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProductionGeneralRoute />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cài đặt chung — KPI close day and Khoán pay policy (PD-032, PD-033)", () => {
  it("shows “Cuối tháng” as the close day and the two Khoán options, ALWAYS selected", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    renderPage();
    const picker = await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    expect(picker.textContent).toContain("Cuối tháng");
    expect(screen.getByText(/chốt cuối tháng\)/)).toBeTruthy();
    const group = screen.getByRole("radiogroup", { name: "Tiền Khoán khi chốt KPI" });
    const options = Array.from(group.querySelectorAll('[role="radio"]'));
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("Luôn trả tiền Khoán (như Excel)"),
      expect.stringContaining("Chỉ trả khi đạt KPI")
    ]);
    expect(options.map((option) => option.getAttribute("aria-checked"))).toEqual(["true", "false"]);
  });

  it("switching to “Chỉ trả khi đạt KPI” and saving sends the policy with the other settings", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    const update = vi
      .spyOn(productionApi, "updateSettings")
      .mockImplementation((input) => Promise.resolve({ ...settings, ...input } as ProductionSettings));
    renderPage();
    fireEvent.click(await screen.findByRole("radio", { name: /Chỉ trả khi đạt KPI/ }));
    expect(screen.getByRole("radio", { name: /Chỉ trả khi đạt KPI/ }).getAttribute("aria-checked")).toBe(
      "true"
    );
    expect(screen.getByText("Bạn có thay đổi chưa lưu.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0]).toMatchObject({ kpiCloseDay: 31, khoanPayPolicy: "IF_KPI" });
  });
});
