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
  projects: [
    { projectId: id(2), code: "AXP", name: "Axon", active: true, count: 18 },
    { projectId: id(3), code: "BRX", name: "Brix", active: true, count: 12 }
  ]
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
  vi.spyOn(productionApi, "projects").mockResolvedValue({ items: [] });
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
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc theo Leader" }));
      await Promise.resolve();
    });
    expect(screen.getByTestId("location").textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Bỏ lọc theo Leader" })).toBeNull();
  });

  it("the project sidebar lists the facets' projects with counts; a click filters through ?project=", async () => {
    breakpoint.current = "desktop";
    renderRoute();
    const sidebar = await screen.findByRole("complementary", { name: "Dự án" });
    await waitFor(() => expect(within(sidebar).getByRole("button", { name: /^BRX/ })).toBeTruthy());
    expect(within(sidebar).getByRole("button", { name: /^Tất cả/ }).textContent).toBe("Tất cả30");
    expect(within(sidebar).getByRole("button", { name: /^AXP/ }).textContent).toContain("18");
    // The total of every matching job and the month counts come from the facets.
    expect(screen.getByText("30 job")).toBeTruthy();
    expect(screen.getByTitle("21 job").textContent).toBe("21");

    await act(async () => {
      fireEvent.click(within(sidebar).getByRole("button", { name: /^BRX/ }));
      await Promise.resolve();
    });
    expect(screen.getByTestId("location").textContent).toBe(`?project=${id(3)}`);
    await waitFor(() =>
      expect(list.mock.calls.some(([query]) => query.projectId === id(3))).toBe(true)
    );
    expect(within(sidebar).getByRole("button", { name: /^BRX/ }).getAttribute("aria-current")).toBe(
      "true"
    );
    // The project control left the filter bar (the sidebar owns it).
    expect(screen.queryByRole("combobox", { name: "Lọc theo dự án" })).toBeNull();
  });

  it("the sidebar folds away (remembered) and comes back", async () => {
    breakpoint.current = "desktop";
    renderRoute();
    const sidebar = await screen.findByRole("complementary", { name: "Dự án" });
    fireEvent.click(within(sidebar).getByRole("button", { name: "Ẩn danh sách dự án" }));
    expect(screen.queryByRole("complementary", { name: "Dự án" })).toBeNull();
    cleanup();
    renderRoute();
    await screen.findByRole("row", { name: "JOB-1" });
    expect(screen.queryByRole("complementary", { name: "Dự án" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dự án" }));
    expect(screen.getByRole("complementary", { name: "Dự án" })).toBeTruthy();
  });

  it("tablets start with the sidebar folded (room for the table) until the user opens it", async () => {
    breakpoint.current = "tablet";
    renderRoute();
    await screen.findByRole("row", { name: "JOB-1" });
    expect(screen.queryByRole("complementary", { name: "Dự án" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dự án" }));
    expect(screen.getByRole("complementary", { name: "Dự án" })).toBeTruthy();
  });

  it("phones: no sidebar, a project select above the grouped cards", async () => {
    breakpoint.current = "mobile";
    renderRoute();
    await screen.findByRole("article", { name: "JOB-1" });
    expect(screen.queryByRole("complementary", { name: "Dự án" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Lọc job theo dự án" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tháng 10 · 2026/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tháng 9 · 2026/ })).toBeTruthy();
  });
});
