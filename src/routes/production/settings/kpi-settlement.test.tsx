// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { kpiApi } from "@/features/production/kpi/api";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionKpiSettlementRoute } from "./kpi-settlement";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const pending = () => new Promise<never>(() => undefined);

/** PD-050: only the organization superadmin runs a settlement; a production Admin reads the page. */
const renderPage = ({ superadmin = true }: { superadmin?: boolean } = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const session = { hasFullOrganizationAuthority: superadmin } as unknown as SessionContext;
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter>
          <ProductionKpiSettlementRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  // The report and its filters load in the background; the run history is empty.
  vi.spyOn(productionApi, "me").mockReturnValue(pending());
  vi.spyOn(productionApi, "teams").mockReturnValue(pending());
  vi.spyOn(productionApi, "customFields").mockReturnValue(pending());
  vi.spyOn(productionApi, "tags").mockReturnValue(pending());
  vi.spyOn(kpiApi, "report").mockReturnValue(pending());
  vi.spyOn(kpiApi, "runs").mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → Chốt KPI & báo cáo (PD-050)", () => {
  it("the superadmin runs (or re-runs) a period with a reason", async () => {
    renderPage();
    expect(await screen.findByText("Chưa chạy chốt lần nào")).toBeTruthy();
    expect(screen.getByText("Chạy chốt KPI")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Lý do chạy lại (bắt buộc)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Chạy chốt / })).toBeTruthy();
    expect(screen.queryByText(/chế độ chỉ đọc/)).toBeNull();
  });

  it("a production Admin keeps the schedule, the history and the report, without the run form", async () => {
    const run = vi.spyOn(kpiApi, "runSettlement");
    renderPage({ superadmin: false });
    expect(await screen.findByText("Chưa chạy chốt lần nào")).toBeTruthy();
    expect(
      screen.getByText(
        "Chỉ Siêu quản trị chỉnh sửa Cấu hình Photo Retouch. Bạn đang xem ở chế độ chỉ đọc."
      )
    ).toBeTruthy();
    expect(screen.getByText("Chốt KPI")).toBeTruthy();
    expect(screen.getByText(/^Hệ thống tự chốt lúc 23:59/)).toBeTruthy();
    expect(screen.getByText(/^Tiền Khoán:/)).toBeTruthy();
    expect(screen.queryByText("Chạy chốt KPI")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Lý do chạy lại (bắt buộc)" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Chạy chốt / })).toBeNull();
    expect(screen.getByText("Lịch sử chạy chốt")).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  });
});
