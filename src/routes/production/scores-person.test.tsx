// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionMe } from "@/contracts/production-catalog";
import type {
  ScoreBoard,
  ScoreForecast,
  UserScoreForecast,
  UserScores
} from "@/contracts/production-scores";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { useProductionNavEntries } from "@/features/production/hooks";
import { kpiApi } from "@/features/production/kpi/api";
import { scoresApi } from "@/features/production/scores/api";
import { personScoresPath } from "@/features/production/scores/person-link";
import { ApiError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionScoreBoardRoute } from "./scores-board";
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
    khoanPayPolicy: "ALWAYS",
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

const board: ScoreBoard = {
  period: "2026-10",
  from: "2026-09-26",
  to: "2026-10-25",
  moneyVisible: false,
  items: [
    {
      rank: 1,
      user: userRef(otherId, "Đồng Nghiệp Thử"),
      teamId: null,
      teamName: "Team Thử",
      pointsOfficial: 120,
      pointsKhoan: 4,
      qtyKhoan: 8,
      money: null
    },
    {
      rank: 2,
      user: userRef(meId, "Người Xem"),
      teamId: null,
      teamName: null,
      pointsOfficial: 80,
      pointsKhoan: 0,
      qtyKhoan: 0,
      money: 0
    }
  ]
};

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
  }
} satisfies UserScoreForecast;

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
  vi.spyOn(scoresApi, "board").mockResolvedValue(board);
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

describe("PD-052 — the ranking (hidden from the menu, owner 2026-10-16)", () => {
  it("the menu has Bảng điểm but no Xếp hạng; the route still works by URL", async () => {
    const { result } = renderHook(() => useProductionNavEntries(), {
      wrapper: ({ children }) => wrap(children, "/production")
    });
    await waitFor(() =>
      expect(result.current.map((entry) => entry.to)).toContain("/production/scores")
    );
    expect(result.current.map((entry) => entry.to)).not.toContain("/production/scores/board");
    render(wrap(<ProductionScoreBoardRoute />, "/production/scores/board"));
    expect(await screen.findByRole("table")).toBeTruthy();
  });

  it("needs “Xem điểm người khác” (PD-065)", async () => {
    vi.mocked(productionApi.me).mockResolvedValue({ ...me, features: ["qc_queue"] });
    render(wrap(<ProductionScoreBoardRoute />, "/production/scores/board"));
    expect(await screen.findByText("Bạn không có quyền xem trang này")).toBeTruthy();
    expect(screen.getByText(/Xem điểm người khác/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("each board row opens that person's Điểm cá nhân; your own row opens Bảng điểm của tôi", async () => {
    render(wrap(<ProductionScoreBoardRoute />, "/production/scores/board"));
    const table = await screen.findByRole("table");
    const other = [...table.querySelectorAll("a")].find((link) =>
      link.textContent.includes("Đồng Nghiệp Thử")
    );
    const own = [...table.querySelectorAll("a")].find((link) =>
      link.textContent.includes("Người Xem")
    );
    expect(other?.getAttribute("data-to")).toBe(`/production/scores/person/${otherId}`);
    expect(own?.getAttribute("data-to")).toBe("/production/scores");
    expect(screen.queryByText(/riêng tư/i)).toBeNull();
  });

  it("links keep a past period", () => {
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
    // Money is someone else's: no money card or column, the Khoán work instead.
    expect(screen.getByText("Khoán trong kỳ")).toBeTruthy();
    expect(screen.queryByText("Tiền Khoán tạm tính")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Tiền" })).toBeNull();
    // The ranking is hidden: the way back is Bảng điểm, and no second "Bảng điểm của tôi" button.
    expect(screen.getByText("Bảng điểm").closest("a")?.getAttribute("data-to")).toBe(
      "/production/scores"
    );
    expect(screen.queryByText("Xếp hạng")).toBeNull();
    expect(screen.queryByText("Bảng điểm của tôi")).toBeNull();
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
    expect(screen.getByText("Về Bảng điểm").closest("a")?.getAttribute("data-to")).toBe(
      "/production/scores"
    );
  });

  it("your own id goes to Bảng điểm của tôi", async () => {
    renderPerson(meId);
    expect((await screen.findByTestId("where")).textContent).toBe("/production/scores");
    expect(scoresApi.user).not.toHaveBeenCalled();
  });
});
