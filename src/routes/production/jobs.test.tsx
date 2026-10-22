// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type { ProductionMe } from "@/contracts/production-catalog";
import type { JobFacets, JobPage, JobSummary } from "@/contracts/production-jobs";
import { SessionValueContext } from "@/features/auth/session-context";
import { productionApi } from "@/features/production/api";
import { jobsApi } from "@/features/production/jobs-api";
import type { Breakpoint } from "@/hooks/use-breakpoint";
import type { SessionContext } from "@/lib/api/schemas";

import { ProductionJobsRoute } from "./jobs";

// PD-067 — /production/jobs as ClickUp's List view: project sidebar from the facets, month groups, `?project=`.
// Obviously fake ids and names (public repository).
const breakpoint = vi.hoisted((): { current: Breakpoint } => ({ current: "desktop" }));
vi.mock("@/hooks/use-breakpoint", () => ({ useBreakpoint: () => breakpoint.current }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number;
    estimateSize: (index: number) => number;
    getItemKey: (index: number) => string | number;
  }) => {
    const items = Array.from({ length: options.count }, (_, index) => ({
      index,
      key: options.getItemKey(index),
      start: index * 40,
      size: options.estimateSize(index)
    }));
    return { getVirtualItems: () => items, getTotalSize: () => options.count * 40 };
  }
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Asia/Ho_Chi_Minh";

const me = {
  roles: ["LEADER"],
  isAdmin: false,
  teamId: null,
  jobPermissions: { view: "all", create: "all", update: "all", delete: "none" },
  taskCreate: "all",
  features: [],
  settings: { timezone: TZ }
} as unknown as ProductionMe;

const session = {
  user: { id: id(900), displayName: "Người Thử", email: "viewer@example.test", avatarUrl: null },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  productionRoles: ["LEADER"],
  departments: ["PHOTO_RETOUCH"]
} as unknown as SessionContext;

const job = (
  n: number,
  receivedAt: string,
  project = { id: id(2), code: "AXP", name: "Axon", clientName: null }
): JobSummary => ({
  id: id(100 + n),
  number: n,
  code: `JOB-${n}`,
  name: null,
  project,
  leader: null,
  receivedAt,
  deadline: "2099-10-12T10:00:00.000Z",
  totalImages: 10,
  totalImagesManual: false,
  driveLink: null,
  channelId: null,
  jobStatus: {
    id: id(90),
    name: "Mới nhận",
    color: "slate",
    isClosed: false,
    requiresAllChecked: false
  },
  status: null,
  uncheckedTaskCount: 0,
  processTotals: [],
  qtyAssigned: 0,
  qtyDone: 0,
  qtyChecked: 0,
  taskCount: 0,
  tasksWithoutQty: 0,
  lateTaskCount: 0,
  openFeedbackCount: 0,
  people: { workers: [], qc: [] },
  personShare: null,
  pointsOfficial: null,
  customValues: {},
  tagIds: [],
  createdBy: null,
  createdAt: "2026-10-01T01:00:00.000Z",
  archived: false
});

const page: JobPage = {
  items: [job(1, "2026-10-15T00:00:00+07:00"), job(2, "2026-09-03T00:00:00+07:00")],
  pageInfo: { hasMore: false, nextCursor: null },
  personTotals: null
};
const facets: JobFacets = {
  months: [
    { month: "2026-10", count: 21 },
    { month: "2026-09", count: 9 }
  ],
  // PD-078: every Project (0 included), the viewer's own (AXP) crowned, inactive ones folded.
  projects: [
    { projectId: id(2), code: "AXP", name: "Axon", active: true, count: 18, ownerId: id(900), ownerIds: [id(900)] },
    { projectId: id(3), code: "BRX", name: "Brix", active: true, count: 12, ownerId: id(901), ownerIds: [id(901)] },
    { projectId: id(4), code: "CAT", name: "Cát", active: true, count: 0, ownerId: null, ownerIds: [] },
    { projectId: id(5), code: "DRX", name: "Drix", active: false, count: 0, ownerId: null, ownerIds: [] }
  ],
  leaderTabs: { all: 30, mine: 12 }
};

const LocationProbe = () => <output data-testid="location">{useLocation().search}</output>;

const renderRoute = (entry = "/production/jobs") => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter initialEntries={[entry]}>
          <ProductionJobsRoute />
          <LocationProbe />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

let list: MockInstance<typeof jobsApi.list>;
let facetCalls: MockInstance<typeof jobsApi.facets>;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(productionApi, "me").mockResolvedValue(me);
  vi.spyOn(productionApi, "customFields").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "tags").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "jobStatuses").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "members").mockResolvedValue({ items: [] });
  vi.spyOn(productionApi, "projects").mockResolvedValue({ items: [], canCreate: true, ownerPick: "self" });
  vi.spyOn(productionApi, "workflow").mockResolvedValue({ statuses: [], transitions: [] });
  list = vi.spyOn(jobsApi, "list").mockResolvedValue(page);
  facetCalls = vi.spyOn(jobsApi, "facets").mockResolvedValue(facets);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("/production/jobs — PD-079: an Account creates Job Codes, no task", () => {
  it("an Account gets “Tạo job” but no “Nhập Task”; a Leader gets both", async () => {
    breakpoint.current = "desktop";
    vi.spyOn(productionApi, "me").mockResolvedValue({ ...me, roles: ["ACCOUNT"], taskCreate: "none" } as unknown as ProductionMe);
    facetCalls.mockResolvedValue({ ...facets, leaderTabs: null });
    renderRoute();
    await screen.findByRole("row", { name: "JOB-1" });
    expect(screen.getAllByRole("button", { name: /Tạo job/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Nhập Task/ })).toBeNull();
    cleanup();
    vi.spyOn(productionApi, "me").mockResolvedValue(me);
    renderRoute();
    await screen.findByRole("row", { name: "JOB-1" });
    expect(screen.getByRole("button", { name: /Nhập Task/ })).toBeTruthy();
  });
});

describe("/production/jobs — List view (PD-067)", () => {
  it("asks for the rows newest Ngày nhận first and the facets with the same filters", async () => {
    breakpoint.current = "desktop";
    renderRoute("/production/jobs?q=abc");
    await screen.findByRole("row", { name: "JOB-1" });
    expect(list.mock.calls[0]![0]).toMatchObject({ q: "abc", sort: "received" });
    expect(facetCalls.mock.calls[0]![0]).toMatchObject({ q: "abc" });
    expect(facetCalls.mock.calls[0]![0]).not.toHaveProperty("sort");
  });

  it("no Leader picker; a ?leader= link still filters, as a chip that removes it (owner, 2026-10-20)", async () => {
    breakpoint.current = "desktop";
    renderRoute();
    await screen.findByRole("row", { name: "JOB-1" });
    expect(screen.queryByRole("combobox", { name: "Lọc theo Leader" })).toBeNull();
    expect(screen.queryByText("Mọi Leader")).toBeNull();
    cleanup();

    renderRoute(`/production/jobs?leader=${id(9)}`);
    await screen.findByRole("row", { name: "JOB-1" });
    expect(list.mock.calls.at(-1)![0]).toMatchObject({ leaderId: id(9) });
    // PD-078: a ?leader= link opens a Leader's list on "Tất cả" (every Project); the chip says what it filters.
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(`?leader=${id(9)}&scope=all`));
    expect(screen.getByRole("tab", { name: /^Tất cả/ }).getAttribute("aria-selected")).toBe("true");
    expect(list.mock.calls.find(([query]) => query.leaderId === id(9))![0].scope).toBeUndefined();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc theo Leader" }));
      await Promise.resolve();
    });
    expect(screen.getByTestId("location").textContent).toBe("?scope=all");
    expect(screen.queryByRole("button", { name: "Bỏ lọc theo Leader" })).toBeNull();
  });

  it("the project sidebar lists the facets' projects with counts; a click filters through ?project=", async () => {
    breakpoint.current = "desktop";
    // PD-073's ?leader=all reads as "Tất cả" and becomes ?scope=all.
    renderRoute("/production/jobs?leader=all");
    const sidebar = await screen.findByRole("complementary", { name: "Project" });
    await waitFor(() => expect(within(sidebar).getByRole("button", { name: /^BRX/ })).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("?scope=all"));
    expect(within(sidebar).getByRole("button", { name: /^Tất cả/ }).textContent).toBe("Tất cả30");
    expect(within(sidebar).getByRole("button", { name: /^AXP/ }).textContent).toContain("18");
    // PD-078: every Project, also without jobs; mine crowned; the inactive ones folded.
    expect(within(sidebar).getByRole("button", { name: /^CAT/ }).textContent).toContain("0");
    expect(within(within(sidebar).getByRole("button", { name: /^AXP/ })).getByLabelText("Bạn phụ trách")).toBeTruthy();
    expect(within(sidebar).queryByRole("button", { name: /^DRX/ })).toBeNull();
    expect(within(sidebar).getByRole("button", { name: /Ngừng hoạt động \(1\)/ })).toBeTruthy();
    // The total of every matching job and the month counts come from the facets.
    expect(screen.getByText("30 job")).toBeTruthy();
    expect(screen.getByTitle("21 job").textContent).toBe("21");

    await act(async () => {
      fireEvent.click(within(sidebar).getByRole("button", { name: /^BRX/ }));
      await Promise.resolve();
    });
    // A Leader's explicit "Tất cả" (?scope=all) stays while other filters change.
    expect(screen.getByTestId("location").textContent).toBe(`?project=${id(3)}&scope=all`);
    await waitFor(() =>
      expect(list.mock.calls.some(([query]) => query.projectId === id(3))).toBe(true)
    );
    expect(within(sidebar).getByRole("button", { name: /^BRX/ }).getAttribute("aria-current")).toBe(
      "true"
    );
    // The project control left the filter bar (the sidebar owns it).
    expect(screen.queryByRole("combobox", { name: "Lọc theo Project" })).toBeNull();
  });

  it("the sidebar folds away (remembered) and comes back", async () => {
    breakpoint.current = "desktop";
    renderRoute();
    const sidebar = await screen.findByRole("complementary", { name: "Project" });
    fireEvent.click(within(sidebar).getByRole("button", { name: "Ẩn danh sách Project" }));
    expect(screen.queryByRole("complementary", { name: "Project" })).toBeNull();
    cleanup();
    renderRoute();
    await screen.findByRole("row", { name: "JOB-1" });
    expect(screen.queryByRole("complementary", { name: "Project" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Project" }));
    expect(screen.getByRole("complementary", { name: "Project" })).toBeTruthy();
  });

  it("tablets start with the sidebar folded (room for the table) until the user opens it", async () => {
    breakpoint.current = "tablet";
    renderRoute();
    await screen.findByRole("row", { name: "JOB-1" });
    expect(screen.queryByRole("complementary", { name: "Project" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Project" }));
    expect(screen.getByRole("complementary", { name: "Project" })).toBeTruthy();
  });

  it("phones: no sidebar, a project select above the grouped cards", async () => {
    breakpoint.current = "mobile";
    renderRoute();
    await screen.findByRole("article", { name: "JOB-1" });
    expect(screen.queryByRole("complementary", { name: "Project" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Lọc job theo Project" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tháng 10 · 2026/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tháng 9 · 2026/ })).toBeTruthy();
  });
});

describe("/production/jobs — Tất cả / Tôi quản lý = the Projects I own (PD-073, PD-078)", () => {
  const myId = id(900);
  const tab = (name: RegExp) => screen.getByRole("tab", { name });
  const selected = (element: HTMLElement) => element.getAttribute("aria-selected") === "true";
  const location = () => screen.getByTestId("location").textContent;

  it("Leaders get both tabs with their counts and land on Tôi quản lý (?scope=mine)", async () => {
    breakpoint.current = "desktop";
    renderRoute();
    await screen.findByRole("row", { name: "JOB-1" });
    expect(screen.getByRole("tablist", { name: "Phạm vi" })).toBeTruthy();
    await waitFor(() => expect(tab(/^Tất cả/).textContent).toBe("Tất cả 30"));
    expect(tab(/^Tôi quản lý/).textContent).toBe("Tôi quản lý 12");
    expect(selected(tab(/^Tôi quản lý/))).toBe(true);
    expect(selected(tab(/^Tất cả/))).toBe(false);
    await waitFor(() => expect(location()).toBe("?scope=mine"));
    // The very first requests already ask for my Projects' jobs (no "all" round trip first), not for a Leader.
    expect(list.mock.calls[0]![0]).toMatchObject({ scope: "mine" });
    expect(list.mock.calls[0]![0].leaderId).toBeUndefined();
    expect(facetCalls.mock.calls[0]![0]).toMatchObject({ scope: "mine" });
  });

  it("Tất cả is kept as ?scope=all, so it stays chosen while other filters change", async () => {
    breakpoint.current = "desktop";
    renderRoute();
    await screen.findByRole("row", { name: "JOB-1" });
    await act(async () => {
      fireEvent.click(tab(/^Tất cả/));
      await Promise.resolve();
    });
    expect(location()).toBe("?scope=all");
    await waitFor(() => expect(list.mock.calls.at(-1)![0].scope).toBeUndefined());
    expect(selected(tab(/^Tất cả/))).toBe(true);
    fireEvent.click(screen.getByRole("switch", { name: /Có task trễ/ }));
    expect(location()).toBe("?scope=all&late=1");
    expect(selected(tab(/^Tất cả/))).toBe(true);
  });

  it("Tôi quản lý is a tab, not a filter: no chip, not counted, kept by Xóa lọc; the facets follow it", async () => {
    breakpoint.current = "desktop";
    renderRoute("/production/jobs?scope=all&late=1");
    await screen.findByRole("row", { name: "JOB-1" });
    await act(async () => {
      fireEvent.click(tab(/^Tôi quản lý/));
      await Promise.resolve();
    });
    expect(location()).toBe("?scope=mine&late=1");
    await waitFor(() => expect(facetCalls.mock.calls.some(([query]) => query.scope === "mine")).toBe(true));
    expect(screen.queryByRole("button", { name: "Bỏ lọc theo Leader" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Xóa lọc (1)" }));
      await Promise.resolve();
    });
    expect(location()).toBe("?scope=mine");
  });

  it("a ?leader=<me> link (Job tôi phụ trách → Xem tất cả) is a chip on Tất cả; Xóa lọc drops it, keeps the tab", async () => {
    breakpoint.current = "desktop";
    renderRoute(`/production/jobs?scope=all&leader=${myId}`);
    await screen.findByRole("row", { name: "JOB-1" });
    expect(selected(tab(/^Tất cả/))).toBe(true);
    expect(list.mock.calls[0]![0]).toMatchObject({ leaderId: myId });
    expect(screen.getByRole("button", { name: "Bỏ lọc theo Leader" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Xóa lọc (1)" }));
      await Promise.resolve();
    });
    expect(location()).toBe("?scope=all");
  });

  it("an empty Tôi quản lý says so and offers Tất cả", async () => {
    breakpoint.current = "desktop";
    list.mockResolvedValue({ ...page, items: [] });
    renderRoute("/production/jobs?scope=mine");
    expect(await screen.findByText("Chưa có job trong Project bạn phụ trách")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Xem tất cả" }));
      await Promise.resolve();
    });
    expect(location()).toBe("?scope=all");
  });

  it("phones get the tabs too", async () => {
    breakpoint.current = "mobile";
    renderRoute();
    await screen.findByRole("article", { name: "JOB-1" });
    expect(screen.getByRole("tablist", { name: "Phạm vi" })).toBeTruthy();
    expect(tab(/^Tôi quản lý/)).toBeTruthy();
  });

  it("an Admin without LEADER gets the tabs and lands on Tất cả", async () => {
    breakpoint.current = "desktop";
    vi.spyOn(productionApi, "me").mockResolvedValue({ ...me, roles: ["ADMIN"] } as unknown as ProductionMe);
    renderRoute();
    await screen.findByRole("row", { name: "JOB-1" });
    await waitFor(() => expect(location()).toBe("?scope=all"));
    expect(selected(tab(/^Tất cả/))).toBe(true);
    expect(list.mock.calls[0]![0].scope).toBeUndefined();
  });

  it("no tabs for anyone holding neither LEADER nor ADMIN (Account): ?scope= ignored, ?leader= stays a chip", async () => {
    breakpoint.current = "desktop";
    vi.spyOn(productionApi, "me").mockResolvedValue({ ...me, roles: ["ACCOUNT"] } as unknown as ProductionMe);
    facetCalls.mockResolvedValue({ ...facets, leaderTabs: null });
    renderRoute(`/production/jobs?scope=mine&leader=${myId}`);
    await screen.findByRole("row", { name: "JOB-1" });
    expect(screen.queryByRole("tablist", { name: "Phạm vi" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("button", { name: "Bỏ lọc theo Leader" })).toBeTruthy();
    expect(list.mock.calls[0]![0].scope).toBeUndefined();
  });
});
