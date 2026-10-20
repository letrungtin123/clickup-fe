// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionMe } from "@/contracts/production-catalog";
import type { MyScores, ScoreBoard, ScoreForecast } from "@/contracts/production-scores";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { scoresApi } from "@/features/production/scores/api";
import {
  searchTeamRows,
  sortTeamRows,
  teamSummary,
  toTeamRow
} from "@/features/production/scores/team-board";
import type { Breakpoint } from "@/hooks/use-breakpoint";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionScoresRoute } from "./scores";
import { ProductionScoreBoardRoute } from "./scores-board";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
// The chart (recharts) is not under test and is heavy to load.
vi.mock("@/features/production/scores/components/daily-chart", () => ({
  DailyPointsChart: () => null
}));
const breakpoint = vi.hoisted((): { current: Breakpoint } => ({ current: "desktop" }));
vi.mock("@/hooks/use-breakpoint", () => ({ useBreakpoint: () => breakpoint.current }));

// PD-069 — "Bảng điểm → Toàn đội". Obviously fake ids and people (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const meId = id(900);
const otherId = id(901);
const freeId = id(902);
const teamId = id(950);

const session = {
  user: { id: meId, displayName: "Người Xem", email: "viewer@example.test", avatarUrl: null },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  productionRoles: ["STAFF"],
  departments: ["PHOTO_RETOUCH"]
} as unknown as SessionContext;

const me = {
  roles: ["STAFF"],
  isAdmin: false,
  teamId: null,
  jobPermissions: { view: "all", create: "none", update: "own", delete: "none" },
  features: ["view_others_scores"],
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

/** Me: KPI 2600 (98,1 %); a colleague above me without the KPI they must have; someone who needs none. */
const board: ScoreBoard = {
  period: "2026-10",
  from: "2026-09-26",
  to: "2026-10-25",
  moneyVisible: false,
  items: [
    {
      rank: 1,
      user: userRef(otherId, "Đồng Nghiệp Thử"),
      teamId,
      teamName: "Team Thử",
      pointsOfficial: 2700.5,
      pointsKhoan: 40,
      qtyKhoan: 80,
      money: null,
      kpiTarget: null,
      kpiRequired: true
    },
    {
      rank: 2,
      user: userRef(meId, "Người Xem"),
      teamId: null,
      teamName: null,
      pointsOfficial: 2550,
      pointsKhoan: 200,
      qtyKhoan: 400,
      money: 1_000_000,
      kpiTarget: 2600,
      kpiRequired: true
    },
    {
      rank: 3,
      user: userRef(freeId, "An Bình"),
      teamId,
      teamName: "Team Thử",
      pointsOfficial: 120,
      pointsKhoan: 0,
      qtyKhoan: 0,
      money: null,
      kpiTarget: null,
      kpiRequired: false
    }
  ]
};

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const Where = () => {
  const location = useLocation();
  return <span data-testid="where">{`${location.pathname}${location.search}`}</span>;
};

const wrap = (children: ReactNode, path: string) => (
  <QueryClientProvider client={client()}>
    <SessionValueContext value={session}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </SessionValueContext>
  </QueryClientProvider>
);

const renderScores = (search = "?tab=team") =>
  render(
    wrap(
      <Routes>
        <Route
          path="/production/scores"
          element={
            <>
              <ProductionScoresRoute />
              <Where />
            </>
          }
        />
      </Routes>,
      `/production/scores${search}`
    )
  );

const namesInOrder = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getByRole("img").getAttribute("aria-label"));

beforeEach(() => {
  breakpoint.current = "desktop";
  vi.spyOn(productionApi, "me").mockResolvedValue(me);
  vi.spyOn(productionApi, "teams").mockResolvedValue({ items: [] });
  vi.spyOn(scoresApi, "board").mockResolvedValue(board);
  // "Tổng quan" (when the tab falls back): never resolves — not under test here.
  vi.spyOn(scoresApi, "me").mockReturnValue(new Promise<MyScores>(() => undefined));
  vi.spyOn(scoresApi, "forecast").mockReturnValue(new Promise<ScoreForecast>(() => undefined));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PD-069 — Bảng điểm → Toàn đội", () => {
  it("everyone's official points, KPI and % đạt; no money column without “Xem tiền Khoán người khác”; not a ranking", async () => {
    renderScores();
    const table = await screen.findByRole("table");
    expect(screen.getByRole("heading", { level: 1, name: "Điểm toàn đội" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Toàn đội" }).getAttribute("aria-selected")).toBe(
      "true"
    );
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual(["Họ tên", "Điểm chính thức", "KPI", "% đạt"]);
    expect(within(table).queryByText("Team Thử")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Tiền Khoán|Hạng|Xếp hạng|điểm Khoán/);
    expect(document.querySelector('[aria-label^="Hạng"]')).toBeNull();

    // Highest official points first.
    expect(namesInOrder(table)).toEqual(["Đồng Nghiệp Thử", "Người Xem", "An Bình"]);
    const [other, own, free] = within(table).getAllByRole("row").slice(1);
    expect(within(other!).getByText("Chưa có KPI")).toBeTruthy();
    expect(within(own!).getByText("2.600,00")).toBeTruthy();
    expect(within(own!).getByText("98,1%")).toBeTruthy();
    expect(within(own!).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("98");
    expect(within(free!).queryByText("Chưa có KPI")).toBeNull();
    expect(within(free!).getAllByText("—").length).toBeGreaterThan(0);

    // Each person opens their Điểm cá nhân; your own row opens Bảng điểm của tôi.
    expect(within(other!).getByRole("link").getAttribute("data-to")).toBe(
      `/production/scores/person/${otherId}`
    );
    expect(within(own!).getByRole("link").getAttribute("data-to")).toBe("/production/scores");

    const summary = screen.getByRole("list", { name: "Tóm tắt toàn đội" });
    expect(
      within(summary)
        .getAllByRole("listitem")
        .map((item) => item.textContent.replace(/\s+/g, " "))
    ).toEqual(["3 người", "Tổng 5.370,50 điểm chính thức", "0/1 đạt KPI", "1 chưa có KPI"]);
    const [query] = vi.mocked(scoresApi.board).mock.calls[0] ?? [];
    expect(query?.period).toMatch(/^\d{4}-\d{2}$/);
    expect(screen.getByRole("button", { name: /Xuất Excel/ })).toBeTruthy();
  });

  it("no Tiền Khoán column, even for whoever sees everyone's money (owner, 2026-10-20)", async () => {
    vi.mocked(scoresApi.board).mockResolvedValue({
      ...board,
      moneyVisible: true,
      items: board.items.map((item, index) => ({ ...item, money: [30_000, 1_000_000, 0][index]! }))
    });
    renderScores();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").at(-1)?.textContent).toBe("% đạt");
    expect(document.body.textContent).not.toMatch(/Tiền Khoán|1\.000\.000/);
  });

  it("the tab is hidden without “Xem điểm người khác”: ?tab=team falls back to Tổng quan, nothing of others is read", async () => {
    vi.mocked(productionApi.me).mockResolvedValue({ ...me, features: [] });
    renderScores();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Bảng điểm của tôi" })
    ).toBeTruthy();
    await waitFor(() => expect(scoresApi.forecast).toHaveBeenCalled());
    expect(screen.queryByRole("tab", { name: "Toàn đội" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Tổng quan" }).getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(scoresApi.board).not.toHaveBeenCalled();
  });

  it("opens from the Toàn đội tab (?tab=team, the period shared); no team filter, an old ?team= is ignored", async () => {
    renderScores(`?period=2026-09&team=${teamId}`);
    fireEvent.click(await screen.findByRole("tab", { name: "Toàn đội" }));
    await screen.findByRole("table");
    expect(screen.getByTestId("where").textContent).toBe(
      `/production/scores?period=2026-09&team=${teamId}&tab=team`
    );
    expect(vi.mocked(scoresApi.board).mock.calls.at(-1)?.[0]).toEqual({
      period: "2026-09",
      teamId: undefined
    });
    expect(screen.queryByRole("combobox", { name: /team/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Tất cả team/);
    fireEvent.click(screen.getByRole("tab", { name: "Tổng quan" }));
    expect(screen.getByTestId("where").textContent).toBe("/production/scores?period=2026-09");
  });

  it("sortable headers and search by name (accents ignored)", async () => {
    renderScores();
    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByRole("button", { name: "Sắp xếp theo Họ tên" }));
    expect(namesInOrder(table)).toEqual(["An Bình", "Đồng Nghiệp Thử", "Người Xem"]);
    expect(within(table).getAllByRole("columnheader")[0]?.getAttribute("aria-sort")).toBe(
      "ascending"
    );
    fireEvent.click(within(table).getByRole("button", { name: "Sắp xếp theo Họ tên" }));
    expect(namesInOrder(table)).toEqual(["Người Xem", "Đồng Nghiệp Thử", "An Bình"]);
    // % đạt: people without a KPI last whatever the direction.
    fireEvent.click(within(table).getByRole("button", { name: "Sắp xếp theo % đạt" }));
    expect(namesInOrder(table)[0]).toBe("Người Xem");

    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm người" }), {
      target: { value: "dong nghiep" }
    });
    expect(namesInOrder(screen.getByRole("table"))).toEqual(["Đồng Nghiệp Thử"]);
    expect(screen.getByRole("list", { name: "Tóm tắt toàn đội" }).textContent).toMatch(/^1 người/);
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm người" }), {
      target: { value: "không ai" }
    });
    expect(await screen.findByText("Không tìm thấy ai")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xóa tìm kiếm" }));
    expect(namesInOrder(screen.getByRole("table"))).toHaveLength(3);
  });

  it("phones: cards instead of the table, KPI chip, no money", async () => {
    breakpoint.current = "mobile";
    renderScores();
    const list = await screen.findByRole("list", { name: "Điểm toàn đội" });
    expect(screen.queryByRole("table")).toBeNull();
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]!).getByText("Chưa có KPI")).toBeTruthy();
    expect(within(cards[1]!).getByText("98,1%")).toBeTruthy();
    expect(within(cards[2]!).getByText("Không bắt buộc KPI")).toBeTruthy();
    expect(within(cards[0]!).getByRole("link").getAttribute("data-to")).toBe(
      `/production/scores/person/${otherId}`
    );
    expect(document.body.textContent).not.toMatch(/Tiền Khoán/);
    expect(screen.getByRole("combobox", { name: "Sắp xếp" })).toBeTruthy();
  });

  it("the old /production/scores/board redirects to the tab, keeping period and team", async () => {
    render(
      wrap(
        <Routes>
          <Route path="/production/scores/board" element={<ProductionScoreBoardRoute />} />
          <Route path="/production/scores" element={<Where />} />
        </Routes>,
        `/production/scores/board?period=2026-09&team=${teamId}&junk=1`
      )
    );
    expect((await screen.findByTestId("where")).textContent).toBe(
      `/production/scores?tab=team&period=2026-09&team=${teamId}`
    );
  });
});

describe("PD-069 — team board model", () => {
  const rows = board.items.map(toTeamRow);

  it("percent, KPI state and the summary", () => {
    expect(rows.map((row) => [row.kpiState, row.percent, row.met])).toEqual([
      ["missing", null, false],
      ["set", 98.08, false],
      ["none", null, false]
    ]);
    expect(teamSummary(rows)).toEqual({
      people: 3,
      points: 5370.5,
      met: 0,
      withKpi: 1,
      missingKpi: 1
    });
    const met = toTeamRow({ ...board.items[1]!, pointsOfficial: 2600 });
    expect([met.met, met.percent]).toEqual([true, 100]);
  });

  it("sorts with empty values last in both directions; ties by name", () => {
    const byKpi = (direction: "asc" | "desc") =>
      sortTeamRows(rows, { key: "kpi", direction }).map((row) => row.item.user.displayName);
    expect(byKpi("desc")).toEqual(["Người Xem", "An Bình", "Đồng Nghiệp Thử"]);
    expect(byKpi("asc")).toEqual(["Người Xem", "An Bình", "Đồng Nghiệp Thử"]);
    expect(
      sortTeamRows(rows, { key: "team", direction: "asc" }).map((row) => row.item.user.displayName)
    ).toEqual(["An Bình", "Đồng Nghiệp Thử", "Người Xem"]);
  });

  it("searches names and teams without accents", () => {
    expect(searchTeamRows(rows, "BINH").map((row) => row.item.user.id)).toEqual([freeId]);
    expect(searchTeamRows(rows, "team thu")).toHaveLength(2);
    expect(searchTeamRows(rows, "  ")).toHaveLength(3);
  });
});
