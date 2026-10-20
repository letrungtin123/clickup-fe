// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type { ProductionMe } from "@/contracts/production-catalog";
import type { ProductionTask, ProductionTaskPage } from "@/contracts/production-jobs";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { jobsApi } from "@/features/production/jobs-api";
import type { Breakpoint } from "@/hooks/use-breakpoint";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionMyTasksRoute } from "./my-tasks";

// PD-068 — "Việc của tôi": finished work on by default, search and date range in the URL, "Xóa bộ lọc".
// Obviously fake ids and names (public repository).
const breakpoint = vi.hoisted((): { current: Breakpoint } => ({ current: "desktop" }));
vi.mock("@/hooks/use-breakpoint", () => ({ useBreakpoint: () => breakpoint.current }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Asia/Ho_Chi_Minh";
const ME = { id: id(1), displayName: "Người Thử", email: null, avatarUrl: null };

const me = {
  roles: ["STAFF"],
  isAdmin: false,
  teamId: null,
  jobPermissions: { view: "own", create: "none", update: "own", delete: "none" },
  features: [],
  settings: { timezone: TZ }
} as unknown as ProductionMe;
const session = {
  user: { ...ME, email: "viewer@example.test" },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  productionRoles: ["STAFF"],
  departments: ["PHOTO_RETOUCH"]
} as unknown as SessionContext;

const PROCESSING = { id: id(80), code: "PROCESSING", name: "Đang làm", color: "blue" as const };
const statusRow = (sortOrder: number) => ({
  ...PROCESSING,
  sortOrder,
  countsDone: false,
  countsChecked: false,
  isTerminal: false,
  isInitial: false,
  setByRoles: [],
  active: true
});

const task = (n: number): ProductionTask => ({
  id: id(500 + n),
  number: n,
  code: String(1280 + n),
  jobId: id(101),
  jobCode: "JOB-1",
  project: { id: id(2), code: "AXP", name: "Axon" },
  assignee: ME,
  qc: null,
  process: { id: id(20), name: "Retouch", isQc: false },
  shift: { id: id(30), name: "Chính thức", payMode: "POINTS", requiresOtHours: false },
  qtyAssigned: 10,
  qtyDone: null,
  errorQty: null,
  otHours: null,
  assignedAt: "2026-10-01T00:00:00+07:00",
  deadline: "2099-10-05T23:59:00+07:00",
  doneAt: null,
  checkedAt: null,
  status: PROCESSING,
  kind: "NORMAL",
  parentTaskId: null,
  isSubtask: false,
  splitReason: null,
  subtasks: [],
  allocatedQty: 10,
  pendingQtyRequest: null,
  feedbackId: null,
  note: null,
  workLink: null,
  isLate: false,
  jobArchived: false,
  qcFailCount: 0,
  customValues: {},
  tagIds: [],
  myCredits: [],
  points: null,
  lastQcFail: null,
  createdAt: "2026-10-01T08:00:00+07:00",
  updatedAt: "2026-10-01T08:00:00+07:00",
  capabilities: {
    transitions: [],
    canEdit: false,
    canAssign: false,
    canChangeAssignee: false,
    canEditQty: false,
    canEditQtyAssigned: false,
    canRequestQty: false,
    canDecideQtyRequest: false,
    canCreateSubtask: false,
    canDelete: false
  }
});
const pageOf = (items: ProductionTask[]): ProductionTaskPage => ({
  items,
  pageInfo: { hasMore: false, nextCursor: null }
});

const LocationProbe = () => <output data-testid="location">{useLocation().search}</output>;
const location = () => new URLSearchParams(screen.getByTestId("location").textContent ?? "");

const renderRoute = (entry = "/production/my-tasks") => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter initialEntries={[entry]}>
          <ProductionMyTasksRoute />
          <LocationProbe />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

let myTasks: MockInstance<typeof jobsApi.myTasks>;
let result: ProductionTaskPage;

beforeEach(() => {
  // Monday 19 October 2026, 10:00 in Ho Chi Minh City (only Date is faked; timers stay real).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T03:00:00Z"));
  result = pageOf([task(6)]);
  vi.spyOn(productionApi, "me").mockResolvedValue(me);
  vi.spyOn(productionApi, "customFields").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "tags").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "workflow").mockResolvedValue({
    statuses: [statusRow(1)],
    transitions: []
  });
  vi.spyOn(productionApi, "ledJobs").mockResolvedValue({ items: [] } as never);
  myTasks = vi.spyOn(jobsApi, "myTasks").mockImplementation(() => Promise.resolve(result));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const lastCall = () => myTasks.mock.calls[myTasks.mock.calls.length - 1]!;

describe("Việc của tôi (PD-068)", () => {
  it("shows finished work by default; turning it off lasts for the visit", async () => {
    renderRoute();
    await screen.findByLabelText(/^Task #1286/);
    expect(lastCall()[1]).toBe(true);
    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      fireEvent.click(toggle);
      await Promise.resolve();
    });
    await waitFor(() => expect(lastCall()[1]).toBe(false));
    // A new visit starts with it on again (nothing stored).
    cleanup();
    myTasks.mockClear();
    renderRoute();
    await screen.findByLabelText(/^Task #1286/);
    expect(lastCall()[1]).toBe(true);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("no Tôi làm / Tôi QC / Tất cả switch: always the tasks I do and the ones I check (owner, 2026-10-20)", async () => {
    renderRoute();
    await screen.findByLabelText(/^Task #1286/);
    expect(lastCall()[0]).toBe("all");
    expect(screen.queryByRole("radiogroup", { name: "Vai trò" })).toBeNull();
    expect(screen.queryByText("Tôi QC")).toBeNull();
    expect(screen.queryByText("Tôi làm")).toBeNull();
  });

  it("reads search and date range from the URL and sends them to the API", async () => {
    renderRoute("/production/my-tasks?q=1286a&dateBy=deadline&from=2026-10-02&to=2026-10-05");
    await screen.findByLabelText(/^Task #1286/);
    expect(lastCall()[4]).toMatchObject({
      q: "1286a",
      dateBy: "deadline",
      from: "2026-10-02",
      to: "2026-10-05"
    });
    expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Tìm task" }).value).toBe("1286a");
    expect(screen.getByRole("button", { name: "Lọc theo ngày: Giao 02/10 – 05/10" })).toBeTruthy();
  });

  it("the search box writes ?q= after a pause (accents kept, trimmed)", async () => {
    renderRoute();
    await screen.findByLabelText(/^Task #1286/);
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm task" }), {
      target: { value: "  Cắt nền " }
    });
    await waitFor(() => expect(location().get("q")).toBe("Cắt nền"), { timeout: 2000 });
    await waitFor(() => expect(lastCall()[4]).toMatchObject({ q: "Cắt nền" }));
  });

  it("a date preset fills the range by Ngày nhận; the basis switches to Ngày giao", async () => {
    renderRoute();
    await screen.findByLabelText(/^Task #1286/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lọc theo khoảng ngày" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Tháng này" }));
      await Promise.resolve();
    });
    expect(location().get("from")).toBe("2026-10-01");
    expect(location().get("to")).toBe("2026-10-31");
    expect(location().get("dateBy")).toBeNull();
    await waitFor(() =>
      expect(lastCall()[4]).toMatchObject({
        dateBy: "received",
        from: "2026-10-01",
        to: "2026-10-31"
      })
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Theo Ngày giao" }));
      await Promise.resolve();
    });
    expect(location().get("dateBy")).toBe("deadline");
    await waitFor(() => expect(lastCall()[4]).toMatchObject({ dateBy: "deadline" }));
  });

  it("the filtered empty state clears search, dates, tags and fields at once", async () => {
    result = pageOf([]);
    renderRoute(
      "/production/my-tasks?q=zzz&from=2026-10-01&to=2026-10-31&tag=" + id(9) + "&ptask=" + id(77)
    );
    expect(await screen.findByText("Không có task phù hợp bộ lọc")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
      await Promise.resolve();
    });
    const params = location();
    expect(params.get("q")).toBeNull();
    expect(params.get("from")).toBeNull();
    expect(params.get("to")).toBeNull();
    expect(params.get("tag")).toBeNull();
    // The open task stays open.
    expect(params.get("ptask")).toBe(id(77));
    expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Tìm task" }).value).toBe("");
  });

  it("without filters and with finished work hidden, the empty state offers to show it again", async () => {
    result = pageOf([]);
    renderRoute();
    expect(await screen.findByText("Chưa có task nào")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"));
      await Promise.resolve();
    });
    expect(await screen.findByText("Không còn việc đang mở")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hiện việc đã xong" }));
      await Promise.resolve();
    });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("phones: search, dates and the switch stay in the header", async () => {
    breakpoint.current = "mobile";
    renderRoute();
    await screen.findByLabelText(/^Task #1286/);
    expect(screen.getByRole("searchbox", { name: "Tìm task" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lọc theo khoảng ngày" })).toBeTruthy();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    breakpoint.current = "desktop";
  });
});
