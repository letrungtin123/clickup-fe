// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionMe } from "@/contracts/production-catalog";
import type {
  MyScores,
  ScoreForecast,
  UserScoreForecast,
  UserScores
} from "@/contracts/production-scores";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { kpiApi } from "@/features/production/kpi/api";
import { scoresApi } from "@/features/production/scores/api";
import { personScoresPath } from "@/features/production/scores/person-link";
import { ApiError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionScoresRoute } from "./scores";
import { ProductionScorePersonRoute } from "./scores-person";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
// The chart (recharts) is not under test and is heavy to load.
vi.mock("@/features/production/scores/components/daily-chart", () => ({
  DailyPointsChart: () => null
}));

// PD-052 — "Điểm cá nhân" for everyone. Obviously fake ids and people (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const meId = id(900);
const otherId = id(901);

const session = {
  user: { id: meId, displayName: "Người Xem", email: "viewer@example.test", avatarUrl: null },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  productionRoles: ["STAFF", "QC"],
  departments: ["PHOTO_RETOUCH"]
} as unknown as SessionContext;

// The retired setting is off: nothing may depend on it any more.
const me = {
  roles: ["STAFF", "QC"],
  isAdmin: false,
  teamId: null,
  jobPermissions: { view: "all", create: "none", update: "own", delete: "none" },
  features: ["qc_queue", "view_others_scores"],
  settings: {
    timezone: "Asia/Ho_Chi_Minh",
    kpiCloseDay: 25,
    kpiCloseDays: [{ fromPeriod: null, closeDay: 25 }],
    khoanPayPolicy: "IF_KPI",
    scoresPublic: false,
    moneyPublic: false,
    chatAttachmentsEnabled: true
  }
} as unknown as ProductionMe;

const userRef = (userId: string, displayName: string) => ({
  id: userId,
  displayName,
  email: null,
  avatarUrl: null
});

const totals = {
  pointsOfficial: 120,
  pointsKhoan: 4,
  moneyKhoanProvisional: null,
  qtyKhoan: 8,
  qcPoints: 0
};
const personScores: UserScores = {
  user: userRef(otherId, "Đồng Nghiệp Thử"),
  teamId: null,
  teamName: "Team Thử",
  moneyVisible: false,
  from: "2026-09-26",
  to: "2026-10-25",
  today: "2026-10-15",
  summary: { ...totals, byDay: [], byProject: [] },
  cards: {
    today: totals,
    week: totals,
    period: { ...totals, period: "2026-10", from: "2026-09-26", to: "2026-10-25" }
  },
  entries: [
    {
      id: id(1),
      role: "WORKER",
      task: { id: id(2), number: 1237, code: "1237a", jobId: id(3), jobCode: "JOB-THU" },
      project: { id: id(4), code: "PRJ" },
      process: { id: id(5), name: "Retouch" },
      shift: { id: id(6), name: "Ca ngày" },
      payMode: "MONEY_IF_KPI",
      kind: "NORMAL",
      qty: 8,
      unitCredits: 0.5,
      credits: 4,
      money: null,
      missingRule: false,
      businessDay: "2026-10-15",
      period: "2026-10",
      adjustsEntryId: null,
      note: null,
      createdAt: "2026-10-15T03:00:00.000Z"
    }
  ],
  truncated: false,
  nextCursor: null
};

const forecast = {
  period: "2026-10",
  from: "2026-09-26",
  to: "2026-10-25",
  closeDay: 25,
  today: "2026-10-15",
  targetBase: null,
  target: null,
  pointsOfficial: 120,
  pointsKhoan: 4,
  moneyKhoanProvisional: null,
  remaining: null,
  daysLeft: 11,
  workingDaysLeft: 9,
  avgPerDayNeeded: null,
  percent: null,
  tone: "NO_TARGET",
  prorateLeave: false,
  leaveDays: null,
  kpi: {
    month: { periodType: "MONTH", periods: ["2026-10"], points: 120, target: null, percent: null },
    quarter: { periodType: "QUARTER", periods: [], points: 120, target: null, percent: null },
    year: { periodType: "YEAR", periods: [], points: 120, target: null, percent: null }
  },
  // PD-066: this person must have a KPI and has none; their money is hidden from the viewer.
  kpiRequired: true,
  ifSettledToday: null
} satisfies UserScoreForecast;

/** "Bảng điểm của tôi" (PD-066): own Khoán money, a KPI of 2600 and 50 points short — topped up from Khoán. */
const ownTotals = {
  pointsOfficial: 2550,
  pointsKhoan: 200,
  moneyKhoanProvisional: 1_000_000,
  qtyKhoan: 400,
  qcPoints: 0
};
const ownScores: MyScores = {
  from: "2026-09-26",
  to: "2026-10-25",
  today: "2026-10-15",
  summary: { ...ownTotals, byDay: [], byProject: [] },
  cards: {
    today: ownTotals,
    week: ownTotals,
    period: { ...ownTotals, period: "2026-10", from: "2026-09-26", to: "2026-10-25" }
  },
  entries: [
    {
      ...personScores.entries[0]!,
      qty: 400,
      unitCredits: 0.5,
      credits: 200,
      money: 1_000_000
    }
  ],
  truncated: false,
  nextCursor: null
};
const ownForecast: ScoreForecast = {
  ...forecast,
  targetBase: 2600,
  target: 2600,
  pointsOfficial: 2550,
  pointsKhoan: 200,
  moneyKhoanProvisional: 1_000_000,
  remaining: 50,
  avgPerDayNeeded: 4.55,
  percent: 98.08,
  tone: "ON_TRACK",
  kpiRequired: true,
  ifSettledToday: {
    shortfall: 50,
    khoanPointsConverted: 50,
    khoanMoneyEarned: 1_000_000,
    khoanMoneyPaid: 750_000,
    met: true
  }
};

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const wrap = (children: ReactNode, path: string) => (
  <QueryClientProvider client={client()}>
    <SessionValueContext value={session}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </SessionValueContext>
  </QueryClientProvider>
);

const Where = () => <span data-testid="where">{useLocation().pathname}</span>;

const renderPerson = (userId: string, search = "") =>
  render(
    wrap(
      <Routes>
        <Route path="/production/scores/person/:userId" element={<ProductionScorePersonRoute />} />
        <Route path="/production/scores" element={<Where />} />
      </Routes>,
      `/production/scores/person/${userId}${search}`
    )
  );

beforeEach(() => {
  vi.spyOn(productionApi, "me").mockResolvedValue(me);
  vi.spyOn(productionApi, "teams").mockResolvedValue({ items: [] });
  vi.spyOn(scoresApi, "user").mockResolvedValue(personScores);
  vi.spyOn(scoresApi, "userForecast").mockResolvedValue(forecast);
  vi.spyOn(scoresApi, "forecast").mockResolvedValue(forecast as unknown as ScoreForecast);
  vi.spyOn(kpiApi, "settlements").mockResolvedValue({ period: "2026-09", run: null, items: [] });
  vi.spyOn(kpiApi, "report").mockResolvedValue({
    from: "2025-11",
    to: "2026-10",
    periods: [],
    users: [],
    rows: [],
    rollups: [],
    totals: []
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PD-052 — links to Điểm cá nhân", () => {
  it("keep a past period; your own row opens Bảng điểm của tôi", () => {
    expect(personScoresPath(otherId, meId, "2026-09")).toBe(
      `/production/scores/person/${otherId}?period=2026-09`
    );
    expect(personScoresPath(meId, meId)).toBe("/production/scores");
  });
});

describe("PD-052 — Điểm cá nhân", () => {
  it("shows the person's name, their ledger with task codes, and hides their money", async () => {
    renderPerson(otherId);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Điểm cá nhân · Đồng Nghiệp Thử" })
    ).toBeTruthy();
    const [askedFor, range] = vi.mocked(scoresApi.user).mock.calls[0] ?? [];
    expect(askedFor).toBe(otherId);
    // The current KPI period (close day 25): 26th of the previous month … the 25th.
    expect(range?.from).toMatch(/^\d{4}-\d{2}-26$/);
    expect(range?.to).toMatch(/^\d{4}-\d{2}-25$/);
    expect(await screen.findByText("#1237a")).toBeTruthy();
    // Money is someone else's: no money card, the Khoán images instead; the Khoán row says "Khoán", never points.
    expect(screen.getByText("Khoán trong kỳ")).toBeTruthy();
    expect(screen.queryByText("Tiền Khoán tạm tính")).toBeNull();
    expect(screen.queryByText(/Nếu chốt hôm nay/)).toBeNull();
    expect(
      screen.getByTitle("Tiền Khoán chỉ chính chủ và người có quyền xem mới thấy.").textContent
    ).toBe("Khoán");
    expect(document.body.textContent).not.toMatch(/điểm Khoán/i);
    // PD-066: KPI is mandatory — this person has none.
    expect(screen.getByText("Chưa có KPI kỳ này — liên hệ Quản trị.")).toBeTruthy();
    // PD-069: the way back is "Toàn đội" (where the person was opened); "Bảng điểm của tôi" beside it; no ranking.
    expect(screen.getByText("Toàn đội").closest("a")?.getAttribute("data-to")).toBe(
      "/production/scores?tab=team"
    );
    expect(screen.getByText("Bảng điểm của tôi").closest("a")?.getAttribute("data-to")).toBe(
      "/production/scores"
    );
    expect(screen.queryByText("Xếp hạng")).toBeNull();
  });

  it("another person's scores need “Xem điểm người khác” (PD-065)", async () => {
    vi.mocked(productionApi.me).mockResolvedValue({ ...me, features: [] });
    renderPerson(otherId);
    expect(await screen.findByText("Bạn không có quyền xem trang này")).toBeTruthy();
    expect(scoresApi.user).not.toHaveBeenCalled();
  });

  it("Kết quả chốt asks the KPI API for that person only", async () => {
    renderPerson(otherId, "?tab=settled");
    expect(await screen.findByText("Chưa có kỳ nào được chốt")).toBeTruthy();
    expect(screen.getByText(/chưa có kết quả cho người này/)).toBeTruthy();
    expect(kpiApi.settlements).toHaveBeenCalledWith(undefined, expect.anything(), otherId);
    expect(kpiApi.report).toHaveBeenCalledWith(
      expect.objectContaining({ userId: otherId }),
      expect.anything(),
      expect.anything()
    );
  });

  it("someone outside Photo Retouch: not-found state", async () => {
    vi.mocked(scoresApi.user).mockRejectedValue(
      new ApiError({ status: 404, code: "SCORE_USER_NOT_FOUND", message: "Không tìm thấy." })
    );
    renderPerson(otherId);
    expect(await screen.findByText("Không tìm thấy nhân viên")).toBeTruthy();
    expect(screen.getByText("Về Toàn đội").closest("a")?.getAttribute("data-to")).toBe(
      "/production/scores?tab=team"
    );
  });

  it("PD-066 — Bảng điểm của tôi: Khoán as money, “Nếu chốt hôm nay” with the top-up, official points only", async () => {
    vi.spyOn(scoresApi, "me").mockResolvedValue(ownScores);
    vi.mocked(scoresApi.forecast).mockResolvedValue(ownForecast);
    render(wrap(<ProductionScoresRoute />, "/production/scores"));
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === "SPAN" &&
          element.textContent.replace(/\s/g, " ") ===
            "Nếu chốt hôm nay: nhận 750.000 ₫ (bù 50 điểm từ Khoán để đủ KPI)."
      )
    ).toBeTruthy();
    expect(screen.getByText("Tiền Khoán tạm tính")).toBeTruthy();
    // The Khoán ledger row shows its money (and money per image), not points.
    expect(await screen.findByText("#1237a")).toBeTruthy();
    const moneyCells = screen.getAllByText((text) => text.replace(/\s/g, " ") === "1.000.000 ₫");
    expect(moneyCells.length).toBeGreaterThan(0);
    expect(screen.getByText((text) => text.replace(/\s/g, " ") === "2.500 ₫")).toBeTruthy();
    expect(screen.queryByText("200,00")).toBeNull();
    expect(document.body.textContent).not.toMatch(/điểm Khoán/i);
    expect(screen.queryByText(/Chưa có KPI kỳ này/)).toBeNull();
  });

  it("your own id goes to Bảng điểm của tôi", async () => {
    renderPerson(meId);
    expect((await screen.findByTestId("where")).textContent).toBe("/production/scores");
    expect(scoresApi.user).not.toHaveBeenCalled();
  });
});
