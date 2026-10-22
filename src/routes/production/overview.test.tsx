// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProductionMe } from "@/contracts/production-catalog";
import type { JobDetail } from "@/contracts/production-jobs";
import type { ProductionOverview } from "@/contracts/production-overview";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { jobsApi } from "@/features/production/jobs-api";
import { overviewApi } from "@/features/production/overview/queries";
import {
  fid,
  job,
  overviewOf,
  projectAxp,
  projectBrx,
  task,
  TZ
} from "@/features/production/overview/test-fixtures";
import { teamLoadApi } from "@/features/production/team-load";
import { ApiError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionOverviewRoute } from "./overview";

// PD-080 — /production "Tổng quan" (Overview V2). Obviously fake ids, codes and names (public repository).
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));

const myId = fid(900);

const meWith = (roles: string[], extra: { taskCreate?: "none" | "own" | "all"; view?: "none" | "own" | "all" } = {}) =>
  ({
    roles,
    isAdmin: roles.includes("ADMIN"),
    teamId: null,
    jobPermissions: { view: extra.view ?? "all", create: "all", update: "all", delete: "none" },
    taskCreate: extra.taskCreate ?? "all",
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

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

const renderRoute = (entry = "/production") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/production" element={<ProductionOverviewRoute />} />
              <Route path="/production/my-overview" element={<p>Trang Tổng quan của tôi</p>} />
              <Route path="/production/jobs/:jobId" element={<p>Trang Job</p>} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </TooltipProvider>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

const location = () => screen.getByTestId("location").textContent ?? "";
let get: MockInstance<typeof overviewApi.get>;
let me: MockInstance<typeof productionApi.me>;

// A day of a Leader: one AXP job in progress (a line waiting for QC too long, an overdue line), one AXP Job Code without
// tasks, a BRX job ready to complete and at risk.
const waiting = task("WAITING_QC", { images: 20, qcWait: { since: "2026-10-21T08:00:00.000Z", minutes: 150, alert: true } });
const doing = task("PROCESSING", { images: 8, overdue: true, deadline: "2026-10-22T01:00:00.000Z" });
const checked = task("CHECKED", { images: 12, note: "Ghi chú thử" });
const jobInProgress = job({ code: "AXP-JOB-1", tasks: [waiting, doing, checked], stale: { minutes: 140, reason: "IDLE" } });
const jobNoTasks = job({
  code: "AXP-JOB-2",
  tasks: [],
  noTasks: true,
  totalImages: 60,
  people: [],
  images: { done: 0, inProgress: 0, unassigned: 60, total: 60 },
  deadline: "2026-10-22T09:00:00.000Z"
});
const jobReady = job({
  code: "BRX-JOB-1",
  project: projectBrx,
  tasks: [task("CHECKED", { images: 5 })],
  phase: "READY",
  deadline: "2026-10-21T13:00:00.000Z",
  clientLate: true,
  risk: null
});
const jobRisk = job({
  code: "BRX-JOB-2",
  project: projectBrx,
  tasks: [task("ASSIGNED", { images: 30 })],
  deadline: "2026-10-22T08:00:00.000Z",
  risk: { reason: "CAPACITY", since: "2026-10-22T02:00:00.000Z", workHours: 12, capacityHours: 6.5, hoursLeft: 4, people: 1, evaluatedAt: "2026-10-22T02:45:00.000Z" }
});

const leaderOverview = (extra: Partial<ProductionOverview> = {}) =>
  overviewOf([jobInProgress, jobNoTasks, jobReady, jobRisk], {
    cards: {
      total: { tasks: 5, images: 75, jobs: 4 },
      unassigned: { jobs: 1, images: 60 },
      inProgress: { tasks: 3, images: 58 },
      done: { tasks: 2, images: 17 },
      overdue: { tasks: 1, clientJobs: 1, images: 8 }
    },
    leaderNeeds: { atRisk: 1, unassignedJobs: 1, qcWaitImages: 20, feedbackJobs: 0, readyJobs: 1, staleJobs: 1 },
    ...extra
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-22T03:00:00Z"));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined, configurable: true });
  }
  me = vi.spyOn(productionApi, "me").mockResolvedValue(meWith(["LEADER"]));
  vi.spyOn(productionApi, "customFields").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "members").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "projects").mockResolvedValue({ items: [], canCreate: false, ownerPick: null });
  vi.spyOn(productionApi, "processes").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "shifts").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "tags").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "creditMatrix").mockResolvedValue({ at: "2026-10-22", projects: [], processes: [], rules: [] });
  vi.spyOn(teamLoadApi, "get").mockResolvedValue({ today: "2026-10-22", generatedAt: "2026-10-22T03:00:00.000Z", members: [] });
  get = vi.spyOn(overviewApi, "get").mockResolvedValue(leaderOverview());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const click = async (element: Element) => {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
};

describe("/production — Tổng quan V2 (PD-080)", () => {
  it("Staff and QC are sent to Tổng quan của tôi (PD-081); nothing is asked", async () => {
    for (const roles of [["STAFF"], ["QC"], ["STAFF", "QC"]]) {
      me.mockResolvedValue(meWith(roles));
      renderRoute();
      await screen.findByText("Trang Tổng quan của tôi");
      expect(location()).toBe("/production/my-overview");
      cleanup();
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("a Leader lands on Project của tôi for today: the URL is written and the API asked with it", async () => {
    renderRoute();
    await screen.findByRole("heading", { name: "Tổng quan" });
    await waitFor(() => expect(location()).toBe("/production?scope=mine"));
    expect(get.mock.calls.at(-1)![0]).toEqual({ from: "2026-10-22", to: "2026-10-22", scope: "mine" });
    await screen.findByText(/Hôm nay, 22\/10 · đến hạn hôm nay \+ trễ từ trước · 4 Job Code · 2 Project · cập nhật 10:00/);
    const scope = screen.getByRole("group", { name: "Phạm vi" });
    expect(within(scope).getByRole("button", { name: /Project của tôi/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(scope).getByRole("button", { name: /Tất cả/ }).textContent).toContain("7");
    expect(screen.queryByText(/Bạn đang xem/)).toBeNull();
    // The PD-076 charts are gone.
    for (const gone of ["Task nhận và xong theo ngày", "Task theo trạng thái", "Khối lượng theo Project"]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it("Quản trị lands on Tất cả with the reminder strip; Account and Director have no switch (always Tất cả)", async () => {
    me.mockResolvedValue(meWith(["ADMIN"]));
    get.mockResolvedValue(leaderOverview({ scope: "all", viewer: { scopeSwitch: true, defaultScope: "all", leaderNeeds: true, accountNeeds: false, canAssign: true, riskHistory: false } }));
    renderRoute();
    await screen.findByText(/Bạn đang xem/);
    await waitFor(() => expect(location()).toBe("/production?scope=all"));
    expect(get.mock.calls.at(-1)![0]).toMatchObject({ scope: "all" });
    cleanup();

    for (const roles of [["ACCOUNT"], ["DIRECTOR"]]) {
      me.mockResolvedValue(meWith(roles, { taskCreate: "none" }));
      get.mockResolvedValue(
        leaderOverview({ scope: "all", viewer: { scopeSwitch: false, defaultScope: "all", leaderNeeds: false, accountNeeds: true, canAssign: false, riskHistory: false } })
      );
      renderRoute();
      await screen.findByRole("heading", { name: "Tổng quan" });
      await waitFor(() => expect(get.mock.calls.at(-1)![0]).toMatchObject({ scope: "all" }));
      expect(location()).toBe("/production");
      expect(screen.queryByRole("group", { name: "Phạm vi" })).toBeNull();
      expect(screen.queryByText(/Bạn đang xem/)).toBeNull();
      cleanup();
    }
  });

  it("the time control goes to the URL and the API (Tuần này Mon–Sun)", async () => {
    renderRoute("/production?scope=mine");
    await screen.findByRole("heading", { name: "Tổng quan" });
    await click(within(screen.getByRole("group", { name: "Thời gian" })).getByRole("button", { name: "Tuần này" }));
    expect(location()).toBe("/production?scope=mine&from=2026-10-19&to=2026-10-25");
    await waitFor(() => expect(get.mock.calls.at(-1)![0]).toEqual({ from: "2026-10-19", to: "2026-10-25", scope: "mine" }));
  });

  it("five cards with their sub-lines; a card filters the table, again = back to Tổng; the dropdown counts", async () => {
    renderRoute("/production?scope=mine");
    const cards = await screen.findByRole("region", { name: "Số liệu" });
    const card = (name: string) => within(cards).getByRole("button", { name: new RegExp(`^${name}`) });
    expect(card("Tổng task").textContent).toContain("75 tấm trong task · 4 job");
    expect(card("Chưa chia").textContent).toContain("1Job Code");
    expect(card("Chưa chia").textContent).toContain("60 tấm chưa có task");
    expect(card("Đang làm").textContent).toContain("58 tấm · 60% tổng task");
    expect(card("Trễ").textContent).toContain("job trễ khách");
    // PD-082: the definitions are folded under "Cách tính số liệu"; "Tổng task" selected by default is not "Đang lọc".
    expect(card("Tổng task").getAttribute("aria-pressed")).toBe("true");
    expect(within(card("Tổng task")).queryByText("Đang lọc")).toBeNull();
    expect(screen.queryByText("Job Code chưa có task nào")).toBeNull();
    const howTo = within(cards).getByRole("button", { name: /Cách tính số liệu/ });
    await click(howTo);
    expect(howTo.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Job Code chưa có task nào")).toBeTruthy();
    expect(screen.getByText(/tính trong giờ lõi 09:30–16:30, cảnh báo sau 2h/)).toBeTruthy();

    await click(card("Đang làm"));
    expect(location()).toBe("/production?scope=mine&card=inProgress");
    expect(card("Đang làm").getAttribute("aria-pressed")).toBe("true");
    expect(within(card("Đang làm")).getByText("Đang lọc")).toBeTruthy();
    // Task mode: the matching lines under each job, column titles changed.
    const table = screen.getByRole("table", { name: "Job theo Project" });
    expect(within(table).getByText("Job Code / task")).toBeTruthy();
    expect(within(table).getByRole("row", { name: `Task #${waiting.code}` })).toBeTruthy();
    expect(within(table).queryByRole("row", { name: `Task #${checked.code}` })).toBeNull();
    // The dropdown with counts.
    expect(screen.getByRole("combobox", { name: "Trạng thái task" }).textContent).toContain("Tất cả (3)");

    await click(card("Đang làm"));
    expect(location()).toBe("/production?scope=mine");
    expect(screen.queryByRole("combobox", { name: "Trạng thái task" })).toBeNull();
  });

  it("job rows: deadline + time left, At risk chip, stale line, 'Đang kẹt ở đâu', status; project rows grouped most urgent first", async () => {
    renderRoute("/production?scope=mine");
    const table = await screen.findByRole("table", { name: "Job theo Project" });
    const groups = within(table).getAllByRole("rowgroup");
    // BRX holds the client-late job: first.
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Project BRX", "Project AXP"]);
    const risky = within(table).getByRole("row", { name: "Job BRX-JOB-2" });
    // PD-082: At risk is a flag chip ("At risk", the estimate in its tooltip and for screen readers).
    expect(within(risky).getByText("At risk · cần ~12h, còn 6,5h (1 người)")).toBeTruthy();
    expect(within(risky).getByText("Còn 5h")).toBeTruthy();
    const late = within(table).getByRole("row", { name: "Job BRX-JOB-1" });
    expect(within(late).getByText("Trễ 14h")).toBeTruthy();
    expect(within(late).getByText("Trễ 14h").closest("[title]")?.getAttribute("title")).toBe("Trễ deadline khách 14h");
    expect(within(late).getByText("Đã check đủ, chờ Complete")).toBeTruthy();
    const busy = within(table).getByRole("row", { name: "Job AXP-JOB-1" });
    // "Không cập nhật" is a warning chip now (no more third line under the Job Code).
    expect(within(busy).getByText("Không cập nhật 2h+")).toBeTruthy();
    expect(within(busy).getByText(/Trưởng Nhóm Bốn/).closest("[title]")?.getAttribute("title")).toMatch(
      /^Leader Trưởng Nhóm Bốn · nhận 21\/10 · cập nhật 30 phút trước/
    );
    expect(within(busy).getByText("20 tấm ở QC · chờ 2h 30m")).toBeTruthy();
    expect(within(busy).getByText("1 task trễ")).toBeTruthy();
    expect(within(busy).getByRole("link", { name: "AXP-JOB-1" }).getAttribute("data-to")).toBe(`/production/jobs/${jobInProgress.id}`);
    const empty = within(table).getByRole("row", { name: "Job AXP-JOB-2" });
    expect(within(empty).getByText("Chưa chia · 60 tấm")).toBeTruthy();
    expect(within(groups[1]!).getByText("1 Job Code chưa chia")).toBeTruthy();
  });

  it("PD-082: a job already handed to the client is never shown late; one grid for every row; a project folds away", async () => {
    const delivered = job({
      code: "AXP-JOB-9",
      phase: "DELIVERED",
      status: { id: fid(75), name: "Đã giao khách", color: "green", kind: "DELIVERED" },
      deadline: "2026-10-18T01:00:00.000Z",
      tasks: [task("COMPLETE", { images: 20 })]
    });
    const delivering = job({
      code: "AXP-JOB-8",
      phase: "DELIVERING",
      status: { id: fid(74), name: "Đang giao client", color: "cyan", kind: "DELIVERING" },
      deadline: "2026-10-22T01:00:00.000Z"
    });
    get.mockResolvedValue(leaderOverview({ jobs: [jobInProgress, jobNoTasks, jobReady, jobRisk, delivered, delivering] }));
    renderRoute("/production?scope=mine");
    const table = await screen.findByRole("table", { name: "Job theo Project" });
    const shipped = within(table).getByRole("row", { name: "Job AXP-JOB-9" });
    expect(within(shipped).getByText("Đã giao")).toBeTruthy();
    expect(within(shipped).queryByText(/^Trễ/)).toBeNull();
    expect(within(within(table).getByRole("row", { name: "Job AXP-JOB-8" })).getByText("Đang giao")).toBeTruthy();
    // The same column template on every row; the header names each column once (Tiến độ spans bar + numbers).
    const cols = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.getAttribute("data-col"));
    expect(cols).toEqual(["job", "deadline", "bar", "flags", "people", "status", "open"]);
    const axp = within(table).getAllByRole("rowgroup")[1]!;
    // Open jobs first (soonest deadline), the ones already with the client after them.
    expect(within(axp).getAllByRole("row").map((row) => row.getAttribute("aria-label"))).toEqual([
      "Project AXP — Dự án Axon",
      "Job AXP-JOB-2",
      "Job AXP-JOB-1",
      "Job AXP-JOB-9",
      "Job AXP-JOB-8"
    ]);
    const fold = within(axp).getByRole("button", { expanded: true });
    await click(fold);
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(within(axp).getAllByRole("row").map((row) => row.getAttribute("aria-label"))).toEqual(["Project AXP — Dự án Axon"]);
    await click(screen.getByRole("button", { name: "Thu gọn tất cả" }));
    expect(within(table).getAllByRole("row").filter((row) => row.getAttribute("aria-label")?.startsWith("Job "))).toHaveLength(0);
    await click(screen.getByRole("button", { name: "Mở tất cả" }));
    expect(within(table).getAllByRole("row").filter((row) => row.getAttribute("aria-label")?.startsWith("Job "))).toHaveLength(6);
  });

  it("PD-082: phones get cards grouped under project headers (no table), same information", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));
    renderRoute("/production?scope=mine");
    const brx = await screen.findByRole("region", { name: "Project BRX" });
    expect(screen.queryByRole("table")).toBeNull();
    const card = within(brx).getByRole("listitem", { name: "Job BRX-JOB-1" });
    expect(within(card).getByText("Trễ 14h")).toBeTruthy();
    expect(within(card).getByText("Đã check đủ, chờ Complete")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "BRX-JOB-1" }).getAttribute("data-to")).toBe(`/production/jobs/${jobReady.id}`);
    const axp = screen.getByRole("region", { name: "Project AXP" });
    expect(within(axp).getByRole("button", { name: "Chia task cho Project AXP" })).toBeTruthy();
    await click(within(axp).getByRole("button", { expanded: true }));
    expect(within(axp).queryByRole("listitem")).toBeNull();
  });

  it("PD-082: a click anywhere on a job row opens the job (not on its controls)", async () => {
    renderRoute("/production?scope=mine");
    const table = await screen.findByRole("table", { name: "Job theo Project" });
    await click(within(within(table).getByRole("row", { name: "Job BRX-JOB-2" })).getByText("Còn 5h"));
    await screen.findByText("Trang Job");
    expect(location()).toBe(`/production/jobs/${jobRisk.id}`);
  });

  it("Cần bạn xử lý (Leader): zero items hidden; an item filters the table, again clears it", async () => {
    renderRoute("/production?scope=mine");
    const bar = await screen.findByRole("region", { name: "Cần bạn xử lý" });
    const labels = within(bar).getAllByRole("button").map((button) => button.textContent);
    expect(labels).toEqual(["1job At risk", "1Job Code chưa chia task", "20tấm chờ QC quá 2h", "1job sẵn sàng Complete", "1job không cập nhật 2h+"]);
    await click(within(bar).getByRole("button", { name: /chờ QC quá 2h/ }));
    expect(location()).toBe("/production?scope=mine&card=inProgress&sub=qcAlert");
    const table = screen.getByRole("table", { name: "Job theo Project" });
    expect(within(table).getByRole("row", { name: `Task #${waiting.code}` })).toBeTruthy();
    expect(within(table).queryByRole("row", { name: `Task #${doing.code}` })).toBeNull();
    await click(within(bar).getByRole("button", { name: /chờ QC quá 2h/ }));
    expect(location()).toBe("/production?scope=mine");
    await click(within(bar).getByRole("button", { name: /At risk/ }));
    const jobRows = within(screen.getByRole("table", { name: "Job theo Project" }))
      .getAllByRole("row")
      .map((row) => row.getAttribute("aria-label"))
      .filter((label) => label?.startsWith("Job "));
    expect(jobRows).toEqual(["Job BRX-JOB-2"]);
    await click(screen.getByRole("button", { name: "Bỏ lọc" }));
    expect(location()).toBe("/production?scope=mine");
  });

  it("Cần bạn xử lý (Account): its own items; no 'Chia task', no 'Tạo nhanh task'; nothing at all → no bar", async () => {
    me.mockResolvedValue(meWith(["ACCOUNT"], { taskCreate: "none" }));
    get.mockResolvedValue(
      leaderOverview({
        scope: "all",
        viewer: { scopeSwitch: false, defaultScope: "all", leaderNeeds: false, accountNeeds: true, canAssign: false, riskHistory: false },
        leaderNeeds: null,
        accountNeeds: { readyToDeliver: 0, atRisk: 1, clientLate: 1, newNotSplit: 0 }
      })
    );
    renderRoute();
    const bar = await screen.findByRole("region", { name: "Cần bạn xử lý" });
    expect(within(bar).getAllByRole("button").map((button) => button.textContent)).toEqual(["1job At risk", "1job trễ khách"]);
    expect(screen.queryByRole("button", { name: /Chia task/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tạo nhanh task/ })).toBeNull();
    await click(within(bar).getByRole("button", { name: /trễ khách/ }));
    expect(location()).toBe("/production?card=overdue&sub=client");
    cleanup();

    get.mockResolvedValue(
      leaderOverview({
        leaderNeeds: { atRisk: 0, unassignedJobs: 0, qcWaitImages: 0, feedbackJobs: 0, readyJobs: 0, staleJobs: 0 },
        accountNeeds: null
      })
    );
    me.mockResolvedValue(meWith(["LEADER"]));
    renderRoute("/production?scope=mine");
    await screen.findByRole("region", { name: "Số liệu" });
    expect(screen.queryByRole("region", { name: "Cần bạn xử lý" })).toBeNull();
  });

  it("a Leader's 'Chia task' opens the Chia Task form with the project's Job Codes without tasks on top", async () => {
    const detail = {
      id: jobNoTasks.id,
      code: jobNoTasks.code,
      project: projectAxp,
      leader: null,
      receivedAt: "2026-10-22T00:00:00+07:00",
      deadline: jobNoTasks.deadline,
      totalImages: 60,
      totalImagesManual: true,
      tasksWithoutQty: 0,
      tasks: [],
      capabilities: { splitOwnOnly: false }
    } as unknown as JobDetail;
    const load = vi.spyOn(jobsApi, "get").mockResolvedValue(detail);
    renderRoute("/production?scope=mine");
    const table = await screen.findByRole("table", { name: "Job theo Project" });
    // Only AXP has a Job Code without tasks.
    expect(within(table).getAllByRole("button", { name: /Chia task cho Project/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Chia task cho Project AXP"
    ]);
    await click(within(table).getByRole("button", { name: "Chia task cho Project AXP" }));
    await waitFor(() => expect(load).toHaveBeenCalledWith(jobNoTasks.id, expect.anything()));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Chia task · AXP-JOB-2");
    expect(within(dialog).getByText(/Job Code chưa chia task · AXP/)).toBeTruthy();
    expect(within(dialog).getByRole("combobox", { name: /Job Code chưa chia task/ }).textContent).toContain("AXP-JOB-2 — 60 tấm · hạn 22/10 16:00");
  });

  it("job 'view: none' → no overview (the quick task stays); a 403 from the API → the no-access state", async () => {
    me.mockResolvedValue(meWith(["LEADER"], { view: "none" }));
    renderRoute();
    await screen.findByText("Bạn không có quyền xem tổng quan");
    expect(get).not.toHaveBeenCalled();
    cleanup();

    me.mockResolvedValue(meWith(["LEADER"]));
    get.mockRejectedValue(new ApiError({ status: 403, code: "OVERVIEW_FORBIDDEN", message: "Tổng quan dành cho Leader, Account, Quản trị và Director." }));
    renderRoute("/production?scope=mine");
    await screen.findByText("Bạn không có quyền xem tổng quan");
  });

  it("the superadmin / Director get the 'Lịch sử At risk' link", async () => {
    me.mockResolvedValue(meWith(["ADMIN", "DIRECTOR"]));
    get.mockResolvedValue(leaderOverview({ scope: "all", viewer: { scopeSwitch: true, defaultScope: "all", leaderNeeds: true, accountNeeds: false, canAssign: true, riskHistory: true } }));
    renderRoute("/production?scope=all");
    const label = await screen.findByText("Lịch sử At risk");
    expect(label.closest("a")?.getAttribute("data-to")).toBe("/production/at-risk");
  });
});
