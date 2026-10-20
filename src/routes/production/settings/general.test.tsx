// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultFeaturePermissions,
  defaultJobPermissions,
  type ProductionSettings
} from "@/contracts/production-catalog";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionGeneralRoute } from "./general";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const settings: ProductionSettings = {
  kpiCloseDay: 31,
  kpiCloseDays: [{ fromPeriod: null, closeDay: 31 }],
  scoresPublic: true,
  kpiProrateLeave: false,
  anomalyFailRate: 0.15,
  dueSoonHours: 2,
  kpiDefaultMember: 100,
  kpiDefaultLeader: 80,
  chatAttachmentsEnabled: true,
  jobPermissions: defaultJobPermissions,
  featurePermissions: defaultFeaturePermissions,
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

describe("Cài đặt chung — KPI close day; Khoán rule fixed (PD-032, PD-066)", () => {
  it("shows “Cuối tháng” as the close day and the one Khoán rule as text — no choice, no money switch", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    renderPage();
    const picker = await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    expect(picker.textContent).toContain("Cuối tháng");
    expect(screen.getByText(/chốt cuối tháng\)/)).toBeTruthy();
    expect(screen.getByText("Tiền Khoán khi chốt KPI")).toBeTruthy();
    expect(screen.getByText("Bù KPI từ Khoán")).toBeTruthy();
    expect(screen.getByText(/bù bấy nhiêu/)).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/Công khai tiền công/)).toBeNull();
    expect(screen.queryByText(/Luôn trả tiền Khoán/)).toBeNull();
  });

  it("saving sends neither khoanPayPolicy nor moneyPublic (the API refuses them)", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    const update = vi
      .spyOn(productionApi, "updateSettings")
      .mockImplementation((input) =>
        Promise.resolve({ ...settings, ...input } as ProductionSettings)
      );
    renderPage();
    fireEvent.click(await screen.findByRole("switch", { name: /Tính KPI theo ngày nghỉ/ }));
    expect(screen.getByText("Bạn có thay đổi chưa lưu.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const sent = update.mock.calls[0]?.[0] ?? {};
    expect(sent).toMatchObject({ kpiCloseDay: 31, kpiProrateLeave: true });
    expect("khoanPayPolicy" in sent || "moneyPublic" in sent).toBe(false);
  });
});

describe("Cài đặt chung — read-only for everyone but the superadmin (PD-050)", () => {
  it("the superadmin edits: picker, inputs and switches, no read-only note", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    renderPage();
    await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    expect(screen.getByRole("textbox", { name: "KPI mặc định – Nhân viên" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Tính KPI theo ngày nghỉ/ })).toBeTruthy();
    expect(screen.queryByText(/chế độ chỉ đọc/)).toBeNull();
  });

  it("a production Admin reads every value as text and cannot change or save anything", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue({
      ...settings,
      kpiDefaultMember: 2610.5
    });
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
    expect(screen.getAllByText("Tắt")).toHaveLength(1); // kpiProrateLeave
    // scoresPublic (PD-052, PD-065) and others' money (PD-066) follow the permissions.
    expect(screen.getAllByText("Theo phân quyền")).toHaveLength(2);
    expect(screen.getByText("Bù KPI từ Khoán")).toBeTruthy();
    expect(screen.queryByText("Bạn có thay đổi chưa lưu.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Lưu cài đặt" })).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("Cài đặt chung — “Công khai bảng điểm” is retired (PD-052, PD-065)", () => {
  it("shows it as “Theo phân quyền” text, never a switch, even for the superadmin", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue({ ...settings, scoresPublic: false });
    renderPage();
    await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    expect(screen.getByText("Công khai bảng điểm")).toBeTruthy();
    expect(screen.getAllByText("Theo phân quyền")).toHaveLength(2);
    expect(screen.queryByRole("switch", { name: /Công khai bảng điểm/ })).toBeNull();
    // The remaining switches: KPI theo ngày nghỉ, tệp trong chat (PD-066: no "Công khai tiền công").
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("saving other fields sends the stored value back unchanged", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue({ ...settings, scoresPublic: false });
    const update = vi
      .spyOn(productionApi, "updateSettings")
      .mockImplementation((input) =>
        Promise.resolve({ ...settings, ...input } as ProductionSettings)
      );
    renderPage();
    fireEvent.click(await screen.findByRole("switch", { name: /Cho phép gửi tệp trong chat/ }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      chatAttachmentsEnabled: false,
      scoresPublic: false
    });
  });
});
