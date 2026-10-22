// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type { ProductionMe } from "@/contracts/production-catalog";
import type { ProductionOverview } from "@/contracts/production-overview";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { overviewApi } from "@/features/production/overview/queries";
import { ApiError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionOverviewRoute } from "./overview";

// PD-076 — /production "Tổng quan" is the dashboard only. Obviously fake ids, codes and names (public repository).
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Asia/Ho_Chi_Minh";
const myId = id(900);

const meWith = (roles: string[], jobPermissions = { view: "all", create: "all", update: "all", delete: "none" }) =>
  ({
    roles,
    isAdmin: false,
    teamId: null,
    jobPermissions,
    // PD-079: tasks follow "create" here (no Account-only member in these tests).
    taskCreate: jobPermissions.create,
    features: [],
    settings: { timezone: TZ, kpiCloseDay: 25, kpiCloseDays: [{ fromPeriod: null, closeDay: 25 }] }
  }) as unknown as ProductionMe;

const session = {
  user: { id: myId, displayName: "Người Thử", email: "viewer@example.test", avatarUrl: null },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  productionRoles: ["LEADER"],
  departments: ["PHOTO_RETOUCH"]
} as unknown as SessionContext;

const status = (code: string, name: string, color: "slate" | "blue" | "green") => ({ id: id(code.length * 7), code, name, color });

const overview = (overrides: Partial<ProductionOverview> = {}): ProductionOverview => ({
  today: "2026-10-21",
  timeZone: TZ,
  generatedAt: "2026-10-21T03:05:00.000Z",
  range: { from: "2026-10-21", to: "2026-10-21" },
  leaderTabs: { all: 42, mine: 17 },
  stats: { total: 17, notStarted: 4, inProgress: 6, done: 7, overdue: 3 },
  previous: { from: "2026-10-20", to: "2026-10-20", total: 10, done: 5 },
  byStatus: [
    { status: status("ASSIGNED", "Mới giao", "slate"), count: 4, overdue: 2 },
    { status: status("PROCESSING", "Đang làm", "blue"), count: 6, overdue: 1 },
    { status: status("CHECKED", "Đã check", "green"), count: 7, overdue: 0 }
  ],
  daily: {
    from: "2026-10-15",
    to: "2026-10-21",
    days: ["15", "16", "17", "18", "19", "20", "21"].map((day, index) => ({
      day: `2026-10-${day}`,
      received: index,
      done: index % 2
    }))
  },
  volume: {
    totalQty: 1500,
    withoutQty: 2,
    slices: [
      { project: { id: id(2), code: "AXP", name: "Dự án Axon" }, projectCount: 1, qty: 1000, lines: 9 },
      { project: { id: id(3), code: "BRX", name: "Dự án Brix" }, projectCount: 1, qty: 500, lines: 8 }
    ]
  },
  projects: [
    {
      project: { id: id(2), code: "AXP", name: "Dự án Axon" },
      openJobs: 3,
      lateJobs: 1,
      imagesTotal: 3000,
      imagesDone: 1240,
      imagesChecked: 800
    }
  ],
  dueToday: {
    from: "2026-10-21",
    to: "2026-10-21",
    total: 1,
    items: [
      {
        id: id(500),
        code: "1286",
        jobId: id(100),
        jobCode: "Batch 07",
        project: { id: id(2), code: "AXP", name: "Dự án Axon" },
        process: { id: id(40), name: "Normal Retouch" },
        assignee: { id: id(901), displayName: "Nhân Viên Một", email: null, avatarUrl: null },
        status: status("PROCESSING", "Đang làm", "blue"),
        deadline: "2026-10-21T02:00:00.000Z",
        overdue: true,
        qtyAssigned: 40
      }
    ]
  },
  dueThisWeek: { from: "2026-10-19", to: "2026-10-25", total: 0, items: [] },
  ...overrides
});

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

const renderRoute = (entry = "/production") => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/production" element={<ProductionOverviewRoute />} />
            <Route path="/production/jobs" element={<p>Trang Job</p>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

const location = () => screen.getByTestId("location").textContent ?? "";
let get: MockInstance<typeof overviewApi.get>;
let me: MockInstance<typeof productionApi.me>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-21T03:00:00Z"));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  me = vi.spyOn(productionApi, "me").mockResolvedValue(meWith(["LEADER"]));
  vi.spyOn(productionApi, "customFields").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "members").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "projects").mockResolvedValue({ items: [], canCreate: false, ownerPick: null });
  vi.spyOn(productionApi, "processes").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "shifts").mockResolvedValue({ items: [] });
  get = vi.spyOn(overviewApi, "get").mockResolvedValue(overview());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("/production — Tổng quan dashboard (PD-076)", () => {
  it("a Leader lands on 'Tôi quản lý' for today: tabs with counts, stats, the old page content gone", async () => {
    renderRoute();
    await screen.findByText("Tổng task");
    await waitFor(() => expect(location()).toBe("/production?scope=mine"));
    expect(get.mock.calls[0]![0]).toEqual({ from: "2026-10-21", to: "2026-10-21", scope: "mine" });
    const tabs = screen.getByRole("tablist", { name: "Phạm vi" });
    expect(within(tabs).getByRole("tab", { name: /Tôi quản lý/ }).getAttribute("aria-selected")).toBe("true");
    expect(within(tabs).getByRole("tab", { name: /Tất cả/ }).textContent).toContain("42");
    const stats = screen.getByRole("list", { name: "Số liệu nhanh" });
    for (const label of ["Tổng task", "Đang làm", "Đã xong", "Quá hạn"]) {
      expect(within(stats).getByText(label)).toBeTruthy();
    }
    expect(within(stats).getByText("+70%")).toBeTruthy();
    expect(within(stats).getAllByText("so với hôm qua")).toHaveLength(2);
    expect(within(stats).getByText("4 chưa bắt đầu")).toBeTruthy();
    // Nothing else: no agenda, points card, rules or quick links.
    for (const gone of ["Việc cần làm", "Điểm của tôi", "Quy định đang áp dụng", "Lối tắt", "Vai trò của bạn"]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.getByRole("button", { name: /Tạo nhanh task/ })).toBeTruthy();
  });

  it("'Tất cả' stays explicit in the URL (?scope=all) and asks without the scope", async () => {
    renderRoute();
    await screen.findByText("Tổng task");
    await waitFor(() => expect(location()).toBe("/production?scope=mine"));
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Tất cả/ }));
      await Promise.resolve();
    });
    expect(location()).toBe("/production?scope=all");
    await waitFor(() => expect(get.mock.calls.at(-1)![0]).toEqual({ from: "2026-10-21", to: "2026-10-21" }));
  });

  it("time presets, the KPI period (26th → 25th) and the custom range go to the URL and the API", async () => {
    renderRoute("/production?scope=all");
    await screen.findByText("Tổng task");
    const presets = screen.getByRole("group", { name: "Thời gian" });
    expect(within(presets).getByRole("button", { name: "Hôm nay" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      fireEvent.click(within(presets).getByRole("button", { name: "Tuần này" }));
      await Promise.resolve();
    });
    expect(location()).toBe("/production?scope=all&from=2026-10-19&to=2026-10-25");
    await waitFor(() => expect(get.mock.calls.at(-1)![0]).toEqual({ from: "2026-10-19", to: "2026-10-25" }));
    await act(async () => {
      fireEvent.click(within(presets).getByRole("button", { name: /Kỳ KPI/ }));
      await Promise.resolve();
    });
    expect(location()).toBe("/production?scope=all&period=2026-10");
    await waitFor(() => expect(get.mock.calls.at(-1)![0]).toEqual({ from: "2026-09-26", to: "2026-10-25" }));
    expect(screen.getByRole("combobox", { name: "Chọn kỳ KPI" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(presets).getByRole("button", { name: "Hôm nay" }));
      await Promise.resolve();
    });
    expect(location()).toBe("/production?scope=all");
  });

  it("PD-078: an Admin without LEADER gets the tabs and lands on 'Tất cả'; a PD-076 ?leader= link is read once", async () => {
    me.mockResolvedValue(meWith(["ADMIN"]));
    renderRoute();
    await screen.findByText("Tổng task");
    await waitFor(() => expect(location()).toBe("/production?scope=all"));
    expect(get.mock.calls[0]![0]).toEqual({ from: "2026-10-21", to: "2026-10-21" });
    expect(within(screen.getByRole("tablist", { name: "Phạm vi" })).getByRole("tab", { name: /Tất cả/ }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    get.mockClear();
    renderRoute(`/production?leader=${myId}&from=2026-10-01&to=2026-10-31`);
    await screen.findByText("Tổng task");
    await waitFor(() => expect(location()).toBe("/production?from=2026-10-01&to=2026-10-31&scope=mine"));
    expect(get.mock.calls[0]![0]).toEqual({ from: "2026-10-01", to: "2026-10-31", scope: "mine" });
  });

  it("a staff member: no tabs, no scope, no quick action without 'create'", async () => {
    me.mockResolvedValue(meWith(["STAFF"], { view: "all", create: "none", update: "own", delete: "none" }));
    get.mockResolvedValue(overview({ leaderTabs: null }));
    renderRoute("/production?scope=mine");
    await screen.findByText("Tổng task");
    expect(screen.queryByRole("tablist", { name: "Phạm vi" })).toBeNull();
    expect(get.mock.calls[0]![0]).toEqual({ from: "2026-10-21", to: "2026-10-21" });
    expect(screen.queryByRole("button", { name: /Tạo nhanh task/ })).toBeNull();
  });

  it("PD-079: an Account (creates Job Codes, no task) gets no 'Tạo nhanh task'", async () => {
    me.mockResolvedValue({
      ...meWith(["ACCOUNT"], { view: "all", create: "all", update: "all", delete: "all" }),
      taskCreate: "none"
    } as unknown as ProductionMe);
    get.mockResolvedValue(overview({ leaderTabs: null }));
    renderRoute();
    await screen.findByText("Tổng task");
    expect(screen.queryByRole("button", { name: /Tạo nhanh task/ })).toBeNull();
  });

  it("whoever may enter work gets 'Tạo nhanh task' (create: own), not only Leaders", async () => {
    me.mockResolvedValue(meWith(["QC"], { view: "own", create: "own", update: "own", delete: "none" }));
    get.mockResolvedValue(overview({ leaderTabs: null }));
    renderRoute();
    await screen.findByText("Tổng task");
    expect(screen.getByRole("button", { name: /Tạo nhanh task/ })).toBeTruthy();
    expect(screen.getByText(/Các job bạn tham gia/)).toBeTruthy();
  });

  it("project progress opens the project's Job list in the same tab; a due task opens its sheet", async () => {
    renderRoute();
    await screen.findByText("Tổng task");
    await waitFor(() => expect(location()).toBe("/production?scope=mine"));
    const project = screen.getByRole("link", { name: /AXP — Dự án Axon: 41%/ });
    expect(within(project).getByText("1 job trễ")).toBeTruthy();
    const due = screen.getByRole("button", { name: /#1286 Normal Retouch/ });
    expect(within(due).getByText(/^trễ/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(due);
      await Promise.resolve();
    });
    expect(location()).toBe(`/production?scope=mine&ptask=${id(500)}`);
    await act(async () => {
      fireEvent.click(project);
      await Promise.resolve();
    });
    expect(location()).toBe(`/production/jobs?project=${id(2)}&scope=mine`);
  });

  it("empty range and empty due lists say so", async () => {
    get.mockResolvedValue(
      overview({
        stats: { total: 0, notStarted: 0, inProgress: 0, done: 0, overdue: 0 },
        byStatus: [],
        volume: { totalQty: 0, withoutQty: 0, slices: [] },
        projects: [],
        dueToday: { from: "2026-10-21", to: "2026-10-21", total: 0, items: [] }
      })
    );
    renderRoute("/production?scope=all");
    await screen.findByText("Tổng task");
    expect(screen.getAllByText("Không có task nào nhận trong khoảng này.")).toHaveLength(2);
    expect(screen.getByText("Không có task nào đến hạn hôm nay")).toBeTruthy();
    expect(screen.getByText("Chưa có job nào đang mở")).toBeTruthy();
  });

  it("an error offers 'Thử lại'; view 'none' explains and keeps the quick action", async () => {
    get.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL", message: "Lỗi máy chủ" }));
    renderRoute();
    expect(await screen.findByRole("button", { name: /Thử lại/ })).toBeTruthy();
    cleanup();

    me.mockResolvedValue(meWith(["STAFF"], { view: "none", create: "own", update: "none", delete: "none" }));
    get.mockClear();
    renderRoute();
    expect(await screen.findByText("Bạn không có quyền xem tổng quan")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tạo nhanh task/ })).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
