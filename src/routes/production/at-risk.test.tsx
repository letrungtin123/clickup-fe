// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProductionMe } from "@/contracts/production-catalog";
import type { RiskHistory } from "@/contracts/production-overview";
import { productionApi } from "@/features/production/api";
import { overviewApi } from "@/features/production/overview/queries";
import { fid, LEADER, projectAxp, TZ } from "@/features/production/overview/test-fixtures";

import { ProductionAtRiskRoute } from "./at-risk";

// PD-080 — "Lịch sử At risk" (superadmin / Director). Obviously fake ids, codes and names (public repository).

const meWith = (roles: string[]) =>
  ({
    roles,
    isAdmin: roles.includes("ADMIN"),
    teamId: null,
    jobPermissions: { view: "all", create: "all", update: "all", delete: "none" },
    taskCreate: "all",
    features: [],
    settings: { timezone: TZ, kpiCloseDay: 25, kpiCloseDays: [{ fromPeriod: null, closeDay: 25 }] }
  }) as unknown as ProductionMe;

const history: RiskHistory = {
  from: "2026-08-31",
  to: "2026-10-22",
  totals: { jobs: 3, clientLate: 1, episodes: 4, open: 1 },
  weeks: [
    { week: "2026-10-12", jobs: 1, clientLate: 0 },
    { week: "2026-10-19", jobs: 2, clientLate: 1 }
  ],
  leaders: [
    { leader: LEADER, jobs: 2, clientLate: 1 },
    { leader: null, jobs: 1, clientLate: 0 }
  ],
  projects: [{ project: projectAxp, jobs: 3, clientLate: 1 }],
  jobs: [
    {
      job: { id: fid(301), code: "AXP-LATE", project: { id: projectAxp.id, code: "AXP" } },
      leader: LEADER,
      reason: "CAPACITY",
      startedAt: "2026-10-20T03:00:00.000Z",
      endedAt: "2026-10-21T10:00:00.000Z",
      endReason: "CLIENT_LATE",
      deadline: "2026-10-21T10:00:00.000Z",
      episodes: 2,
      clientLate: true
    },
    {
      job: { id: fid(302), code: "AXP-OK", project: { id: projectAxp.id, code: "AXP" } },
      leader: null,
      reason: "UNASSIGNED",
      startedAt: "2026-10-22T02:00:00.000Z",
      endedAt: null,
      endReason: null,
      deadline: "2026-10-22T10:00:00.000Z",
      episodes: 1,
      clientLate: false
    }
  ]
};

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

const renderRoute = (entry = "/production/at-risk") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/production/at-risk" element={<ProductionAtRiskRoute />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );

let me: MockInstance<typeof productionApi.me>;
let load: MockInstance<typeof overviewApi.riskHistory>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-22T03:00:00Z"));
  me = vi.spyOn(productionApi, "me").mockResolvedValue(meWith(["ADMIN", "DIRECTOR"]));
  load = vi.spyOn(overviewApi, "riskHistory").mockResolvedValue(history);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("/production/at-risk — Lịch sử At risk (PD-080)", () => {
  it("the superadmin / Director see totals, weeks, Leaders, projects and the jobs (last 8 weeks by default)", async () => {
    renderRoute();
    await screen.findByRole("heading", { name: "Lịch sử At risk" });
    await screen.findByText("Job từng At risk");
    expect(load.mock.calls[0]![0]).toEqual({ from: "2026-08-31", to: "2026-10-22" });
    expect(within(screen.getByRole("region", { name: "Theo tuần" })).getByText("Tuần 19/10")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Theo Leader" })).getByText(LEADER.displayName)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Theo Leader" })).getByText("Chưa có Leader")).toBeTruthy();
    const jobs = screen.getByRole("region", { name: "Job (2)" });
    const late = within(jobs).getByText("AXP-LATE").closest("tr")!;
    expect(within(late).getByText("Đã trễ khách")).toBeTruthy();
    expect(within(late).getByText("Có")).toBeTruthy();
    expect(within(late).getByText(/Không kịp với số người · 2 lần/)).toBeTruthy();
    const open = within(jobs).getByText("AXP-OK").closest("tr")!;
    expect(within(open).getByText(/đang bật/)).toBeTruthy();
    expect(within(open).getByText("Không")).toBeTruthy();
  });

  it("a longer range goes to the URL and the API", async () => {
    renderRoute();
    await screen.findByText("Job từng At risk");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "3 tháng" }));
      await Promise.resolve();
    });
    expect(screen.getByTestId("location").textContent).toBe("/production/at-risk?from=2026-07-27&to=2026-10-22");
    await waitFor(() => expect(load.mock.calls.at(-1)![0]).toEqual({ from: "2026-07-27", to: "2026-10-22" }));
  });

  it("anyone else (a Leader, Quản trị without Director) sees the no-access state; nothing is asked", async () => {
    for (const roles of [["LEADER"], ["ADMIN"], ["ACCOUNT"]]) {
      me.mockResolvedValue(meWith(roles));
      renderRoute();
      await screen.findByText("Không có quyền xem lịch sử At risk");
      cleanup();
    }
    expect(load).not.toHaveBeenCalled();
  });
});
