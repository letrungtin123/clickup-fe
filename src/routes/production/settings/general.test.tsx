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
import { ApiError } from "@/lib/api/errors";
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
  // PD-080 defaults.
  coreWindowStart: "09:30",
  coreWindowEnd: "16:30",
  alertAfterHours: 2,
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

describe("Cài đặt chung — Tổng quan: khung giờ lõi và cảnh báo (PD-080)", () => {
  const field = (name: string) => screen.getByLabelText<HTMLInputElement>(name);
  const mockUpdate = () =>
    vi
      .spyOn(productionApi, "updateSettings")
      .mockImplementation((input) =>
        Promise.resolve({ ...settings, ...input } as ProductionSettings)
      );

  it("shows the core window and the alert threshold with the worked example", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    renderPage();
    await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    expect(screen.getByRole("heading", { name: "Tổng quan" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Khung giờ lõi" })).toBeTruthy();
    expect(field("Bắt đầu khung lõi").value).toBe("09:30");
    expect(field("Kết thúc khung lõi").value).toBe("16:30");
    expect(field("Cảnh báo sau (giờ)").value).toBe("2");
    const hint = screen.getByText(/chỉ chạy trong khung/);
    expect(hint.textContent).toContain("thứ 2 – thứ 7");
    expect(hint.textContent).toContain("tạm dừng");
    expect(hint.textContent).toContain(
      "vào Chờ QC lúc 16:00 → hôm đó tính 30 phút, chạy tiếp từ 09:30 ngày làm việc sau → cảnh báo lúc 11:00"
    );
    expect(hint.textContent).toContain("Sức chứa At risk cũng chỉ tính giờ trong khung");
  });

  it("the worked example follows the values being typed", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    renderPage();
    await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    fireEvent.change(field("Bắt đầu khung lõi"), { target: { value: "08:00" } });
    fireEvent.change(field("Kết thúc khung lõi"), { target: { value: "17:00" } });
    fireEvent.change(field("Cảnh báo sau (giờ)"), { target: { value: "1,5" } });
    await waitFor(() =>
      expect(screen.getByText(/chỉ chạy trong khung/).textContent).toContain(
        "Ví dụ (08:00 – 17:00, cảnh báo sau 1,5 giờ): vào Chờ QC lúc 16:30 → hôm đó tính 30 phút, chạy tiếp từ 08:00 ngày làm việc sau → cảnh báo lúc 09:00"
      )
    );
  });

  it("refuses a start that is not before the end (the API's message), without saving", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    const update = mockUpdate();
    renderPage();
    await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    fireEvent.change(field("Bắt đầu khung lõi"), { target: { value: "16:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Giờ bắt đầu khung lõi phải trước giờ kết thúc."
    );
    expect(field("Kết thúc khung lõi").getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(field("Bắt đầu khung lõi"), { target: { value: "17:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Giờ bắt đầu khung lõi phải trước giờ kết thúc."
      )
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses an alert threshold outside 0,25 – 24 or off the 0,25 step", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    const update = mockUpdate();
    renderPage();
    await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    for (const value of ["0", "25", "1,3"]) {
      fireEvent.change(field("Cảnh báo sau (giờ)"), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toBe(
          "Từ 0,25 đến 24 giờ, bước 0,25 (vd 2 hoặc 1,5)."
        )
      );
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("saving sends coreWindowStart, coreWindowEnd and alertAfterHours", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    const update = mockUpdate();
    renderPage();
    await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    fireEvent.change(field("Bắt đầu khung lõi"), { target: { value: "08:00" } });
    fireEvent.change(field("Kết thúc khung lõi"), { target: { value: "17:30" } });
    fireEvent.change(field("Cảnh báo sau (giờ)"), { target: { value: "0,75" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      coreWindowStart: "08:00",
      coreWindowEnd: "17:30",
      alertAfterHours: 0.75
    });
  });

  it("puts the API's CORE_WINDOW_INVALID under the core window", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue(settings);
    vi.spyOn(productionApi, "updateSettings").mockRejectedValue(
      new ApiError({
        status: 400,
        code: "CORE_WINDOW_INVALID",
        message: "Giờ bắt đầu khung lõi phải trước giờ kết thúc."
      })
    );
    renderPage();
    await screen.findByRole("combobox", { name: "Ngày chốt KPI" });
    fireEvent.change(field("Kết thúc khung lõi"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    await waitFor(() =>
      expect(field("Kết thúc khung lõi").getAttribute("aria-invalid")).toBe("true")
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Giờ bắt đầu khung lõi phải trước giờ kết thúc."
    );
  });

  it("a production Admin reads the core window and the threshold as text", async () => {
    vi.spyOn(productionApi, "settings").mockResolvedValue({ ...settings, alertAfterHours: 1.5 });
    renderPage({ superadmin: false });
    await screen.findByText("Khung giờ lõi");
    expect(screen.getByText("09:30 – 16:30")).toBeTruthy();
    expect(screen.getByText("1,5")).toBeTruthy();
    expect(screen.queryByLabelText("Bắt đầu khung lõi")).toBeNull();
    // The example follows the stored values.
    expect(screen.getByText(/chỉ chạy trong khung/).textContent).toContain("cảnh báo lúc 10:30");
  });
});
