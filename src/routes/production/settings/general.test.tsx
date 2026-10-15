// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultJobPermissions, type ProductionSettings } from "@/contracts/production-catalog";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import type { SessionContext } from "@/lib/api/schemas";

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

/** PD-050: only the organization superadmin edits; a production Admin reads the page. */
const renderPage = ({ superadmin = true }: { superadmin?: boolean } = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const session = { hasFullOrganizationAuthority: superadmin } as unknown as SessionContext;
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter>
          <ProductionGeneralRoute />
        </MemoryRouter>
      </SessionValueContext>
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

describe("Cài đặt chung — read-only for everyone but the superadmin (PD-050)", () => {
  it("the superadmin edits: picker, inputs and switches, no read-only note", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    renderPage();
    await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    expect(screen.getByRole("textbox", { name: "KPI mặc định – Nhân viên" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Công khai tiền công/ })).toBeTruthy();
    expect(screen.queryByText(/chế độ chỉ đọc/)).toBeNull();
  });

  it("a production Admin reads every value as text and cannot change or save anything", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue({ ...settings, kpiDefaultMember: 2610.5 });
    const update = vi.spyOn(productionApi, "updateSettings");
    renderPage({ superadmin: false });
    expect(
      await screen.findByText(
        "Chỉ Siêu quản trị chỉnh sửa Cấu hình Photo Retouch. Bạn đang xem ở chế độ chỉ đọc."
      )
    ).toBeTruthy();
    await screen.findByText("Ngày chốt KPI");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    // Values as text: the close day, the targets (Vietnamese decimals) and the switches.
    expect(screen.getByText("Cuối tháng")).toBeTruthy();
    expect(screen.getByText("2610,5")).toBeTruthy();
    expect(screen.getByText("80")).toBeTruthy();
    expect(screen.getAllByText("Bật")).toHaveLength(1); // chatAttachmentsEnabled
    expect(screen.getAllByText("Tắt")).toHaveLength(2); // kpiProrateLeave, moneyPublic
    expect(screen.getByText("Luôn bật")).toBeTruthy(); // scoresPublic, retired (PD-052)
    // The Khoán cards stay readable, the saved one checked, but cannot be picked.
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(radios.every((radio) => (radio as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(radios[1]!);
    expect(radios[1]!.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("Bạn có thay đổi chưa lưu.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Lưu cài đặt" })).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("Cài đặt chung — “Công khai bảng điểm” is retired (PD-052)", () => {
  it("shows it as “Luôn bật” text, never a switch, even for the superadmin", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue({ ...settings, scoresPublic: false });
    renderPage();
    await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    expect(screen.getByText("Công khai bảng điểm")).toBeTruthy();
    expect(screen.getByText("Luôn bật")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /Công khai bảng điểm/ })).toBeNull();
    // The remaining switches: KPI theo ngày nghỉ, tiền công, tệp trong chat.
    expect(screen.getAllByRole("switch")).toHaveLength(3);
  });

  it("saving other fields sends the stored value back unchanged", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue({ ...settings, scoresPublic: false });
    const update = vi
      .spyOn(productionApi, "updateSettings")
      .mockImplementation((input) => Promise.resolve({ ...settings, ...input } as ProductionSettings));
    renderPage();
    fireEvent.click(await screen.findByRole("switch", { name: /Công khai tiền công/ }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0]).toMatchObject({ moneyPublic: true, scoresPublic: false });
  });
});
