// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KpiTargetCell, KpiTargetMatrix } from "@/contracts/production-scores";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { kpiApi } from "@/features/production/kpi/api";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionKpiTargetsRoute } from "./kpi";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Obviously fake ids and people (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const worker = { id: id(10), displayName: "Nhân viên Thử", email: "worker@example.test", avatarUrl: null };

const emptyCell = (period: string): KpiTargetCell => ({
  period,
  targetPoints: null,
  targetId: null,
  effectiveFrom: null,
  explicit: false
});

/** One person with a 2400-point monthly target from January of the year asked for. */
const matrix = (year: number): KpiTargetMatrix => {
  const periods = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
  const from = `${year}-01`;
  return {
    year,
    periods,
    rows: [
      {
        user: worker,
        teamId: null,
        roles: ["STAFF"],
        months: periods.map((period) => ({
          period,
          targetPoints: 2400,
          targetId: id(50),
          effectiveFrom: from,
          explicit: period === from
        })),
        quarters: ["01", "04", "07", "10"].map((month) => emptyCell(`${year}-${month}`)),
        year: emptyCell(from)
      }
    ],
    history: [
      {
        id: id(50),
        userId: worker.id,
        periodType: "MONTH",
        targetPoints: 2400,
        effectiveFrom: from,
        note: null,
        updatedBy: null,
        createdAt: "2026-01-02T03:00:00.000Z",
        updatedAt: "2026-01-02T03:00:00.000Z"
      }
    ]
  };
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
          <ProductionKpiTargetsRoute />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

/** Opens the January cell of the test person. */
const openJanuary = async () => {
  const cell = await screen.findByRole("button", { name: /^Nhân viên Thử, Kỳ 01\// });
  await act(async () => {
    fireEvent.click(cell);
    await Promise.resolve();
  });
};

beforeEach(() => {
  // Settings (timezone, close days) and the team filter load in the background.
  vi.spyOn(productionApi, "me").mockReturnValue(new Promise<never>(() => undefined));
  vi.spyOn(productionApi, "teams").mockReturnValue(new Promise<never>(() => undefined));
  vi.spyOn(kpiApi, "matrix").mockImplementation((year: number) => Promise.resolve(matrix(year)));
  // PD-066: nobody is missing a KPI unless a test says so.
  vi.spyOn(kpiApi, "missingTargets").mockImplementation((period?: string) =>
    Promise.resolve({ period: period ?? "2026-10", requiredCount: 1, items: [] })
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Cấu hình → KPI nhân viên (PD-050)", () => {
  it("the superadmin imports, applies defaults and sets a target from a cell", async () => {
    renderPage();
    await openJanuary();
    expect(screen.getByRole("button", { name: "Nhập CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Áp KPI mặc định theo role" })).toBeTruthy();
    expect(screen.queryByText(/chế độ chỉ đọc/)).toBeNull();
    expect(await screen.findByRole("button", { name: "Lưu KPI" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Chỉ tiêu (điểm)" })).toBeTruthy();
  });

  it("a production Admin browses the matrix; a cell shows its history only", async () => {
    const put = vi.spyOn(kpiApi, "putTargets");
    renderPage({ superadmin: false });
    await openJanuary();
    expect(
      screen.getByText(
        "Chỉ Siêu quản trị chỉnh sửa Cấu hình Photo Retouch. Bạn đang xem ở chế độ chỉ đọc."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nhập CSV" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Áp KPI mặc định theo role" })).toBeNull();
    // Viewing stays: year switch, search and team filter.
    expect(screen.getByRole("button", { name: "Năm trước" })).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Tìm thành viên" })).toBeTruthy();

    const history = await screen.findByRole("list", { name: "Lịch sử KPI" });
    expect(history.textContent).toContain("2.400");
    expect(screen.getByText("Lịch sử (1)")).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Chế độ" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Chỉ tiêu (điểm)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lưu KPI" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Xóa phiên bản/ })).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });
});

describe("Cấu hình → KPI nhân viên — KPI is mandatory (PD-066)", () => {
  const someone = { id: id(11), displayName: "Người Chưa KPI", email: null, avatarUrl: null };

  it("lists who has no KPI for the current period and filters the grid to them", async () => {
    vi.mocked(kpiApi.missingTargets).mockResolvedValue({
      period: "2026-10",
      requiredCount: 2,
      items: [{ user: someone, teamId: null, teamName: "Team Thử", roles: ["QC", "STAFF"] }]
    });
    renderPage();
    expect(await screen.findByText(/^Còn 1 người chưa có KPI/)).toBeTruthy();
    const list = screen.getByRole("list", { name: "Danh sách người chưa có KPI" });
    expect(list.textContent).toContain("Người Chưa KPI");
    // The test person of the grid has a KPI: filtering to the missing ones hides them.
    expect(await screen.findByRole("button", { name: /^Nhân viên Thử, Kỳ 01\// })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Chỉ hiện những người này" }));
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /^Nhân viên Thử, Kỳ 01\// })).toBeNull();
    expect(screen.getByRole("button", { name: "Hiện tất cả" })).toBeTruthy();
  });

  it("no banner once everyone has a KPI", async () => {
    renderPage();
    await openJanuary();
    expect(screen.queryByText(/chưa có KPI/)).toBeNull();
  });
});
