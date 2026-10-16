// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobSummary } from "@/contracts/production-jobs";
import type { Breakpoint } from "@/hooks/use-breakpoint";

import { productionKeys } from "../../keys";
import { ProcessTotalChips } from "./job-bits";
import { JobsList } from "./jobs-list";

// PD-048 "Tổng tấm" per process in the jobs list (table and phone cards). Obviously fake ids and names (public
// repository).
const breakpoint = vi.hoisted((): { current: Breakpoint } => ({ current: "mobile" }));
vi.mock("@/hooks/use-breakpoint", () => ({ useBreakpoint: () => breakpoint.current }));
// jsdom has no layout: the table's virtualizer renders every row.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number;
    estimateSize: (index: number) => number;
    getItemKey: (index: number) => string | number;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: options.getItemKey(index),
        start: index * options.estimateSize(index),
        size: options.estimateSize(index)
      })),
    getTotalSize: () => options.count * options.estimateSize(0)
  })
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const totals = [
  { process: { id: id(41), name: "Normal Retouch" }, qty: 16 },
  { process: { id: id(42), name: "Premium Retouch" }, qty: 15 },
  { process: { id: id(43), name: "Light Retouch" }, qty: 4 },
  { process: { id: id(44), name: "Cắt nền" }, qty: 3 },
  { process: { id: id(45), name: "Ghép nền" }, qty: 2 }
];

const job = (extra: Partial<JobSummary> = {}): JobSummary => ({
  id: id(1),
  number: 1,
  code: "JOB-1",
  name: null,
  project: { id: id(2), code: "P", name: "Dự án", clientName: null },
  leader: null,
  receivedAt: "2026-10-10T10:00:00.000Z",
  deadline: "2026-10-12T10:00:00.000Z",
  totalImages: 40,
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
  processTotals: totals,
  qtyAssigned: 40,
  qtyDone: 0,
  qtyChecked: 0,
  taskCount: 5,
  tasksWithoutQty: 0,
  lateTaskCount: 0,
  openFeedbackCount: 0,
  people: { workers: [], qc: [] },
  personShare: null,
  customValues: {},
  tagIds: [],
  createdBy: null,
  createdAt: "2026-10-01T01:00:00.000Z",
  archived: false,
  ...extra
});

const renderList = (jobs: JobSummary[]) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  });
  client.setQueryData(productionKeys.tags(), { items: [] });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <JobsList
          jobs={jobs}
          isPending={false}
          error={null}
          onRetry={() => undefined}
          hasNextPage={false}
          isFetchingNextPage={false}
          fetchNextPage={() => undefined}
          timeZone="Asia/Ho_Chi_Minh"
          filtering={false}
          empty={null}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProcessTotalChips", () => {
  it("shows at most `max` chips, then +N with the rest as its tooltip; the whole list for screen readers", () => {
    render(<ProcessTotalChips totals={totals} max={2} />);
    expect(screen.getByText("Normal Retouch")).toBeTruthy();
    expect(screen.getByText("Premium Retouch")).toBeTruthy();
    expect(screen.queryByText("Light Retouch")).toBeNull();
    expect(screen.getByText("+3").getAttribute("title")).toBe(
      "Light Retouch 4 · Cắt nền 3 · Ghép nền 2"
    );
    expect(
      screen.getByText(
        "Tổng tấm theo công đoạn: Normal Retouch 16 · Premium Retouch 15 · Light Retouch 4 · Cắt nền 3 · Ghép nền 2"
      )
    ).toBeTruthy();
  });

  it("renders nothing without processes", () => {
    const { container } = render(<ProcessTotalChips totals={[]} />);
    expect(container.textContent).toBe("");
  });
});

describe("JobsList — Tổng tấm per process (PD-048)", () => {
  it("phone cards show up to four processes, then +N", () => {
    breakpoint.current = "mobile";
    renderList([job()]);
    const card = screen.getByRole("link", { name: /JOB-1/ });
    expect(within(card).getByText("Normal Retouch")).toBeTruthy();
    expect(within(card).getByText("Cắt nền")).toBeTruthy();
    expect(within(card).queryByText("Ghép nền")).toBeNull();
    expect(within(card).getByText("+1").getAttribute("title")).toBe("Ghép nền 2");
  });

  it("a job without tasks shows no breakdown on its card", () => {
    breakpoint.current = "mobile";
    renderList([job({ processTotals: [] })]);
    expect(screen.queryByText(/Tổng tấm theo công đoạn/)).toBeNull();
  });

  it("the table has a “Công đoạn” column after “Tổng tấm”: two processes at most, then +N", () => {
    breakpoint.current = "desktop";
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    renderList([job()]);
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers.indexOf("Công đoạn")).toBe(headers.indexOf("Tổng tấm") + 1);
    const row = screen.getByRole("row", { name: /JOB-1/ });
    const cell = within(row).getAllByRole("cell")[headers.indexOf("Công đoạn")]!;
    expect(within(cell).getByText("Normal Retouch")).toBeTruthy();
    expect(within(cell).getByText("Premium Retouch")).toBeTruthy();
    expect(within(cell).queryByText("Light Retouch")).toBeNull();
    expect(within(cell).getByText("+3").getAttribute("title")).toBe(
      "Light Retouch 4 · Cắt nền 3 · Ghép nền 2"
    );
  });
});

describe("JobsList — tasks without a quantity (PD-058)", () => {
  it("phone cards say how many tasks the “Giao” number leaves out", () => {
    breakpoint.current = "mobile";
    renderList([job({ qtyAssigned: 120, tasksWithoutQty: 2 })]);
    const card = screen.getByRole("link", { name: /JOB-1/ });
    expect(within(card).getByText("2 task chưa có số lượng")).toBeTruthy();
  });

  it("the table's “Đã giao” cell adds “2 chưa có SL” under its bar (full sentence as tooltip)", () => {
    breakpoint.current = "desktop";
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    renderList([job({ qtyAssigned: 120, tasksWithoutQty: 2 }), job({ id: "x", code: "JOB-2" })]);
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    const row = screen.getByRole("row", { name: /JOB-1/ });
    const cell = within(row).getAllByRole("cell")[headers.indexOf("Đã giao")]!;
    expect(cell.textContent).toContain("120");
    expect(within(cell).getByText("2 chưa có SL")).toBeTruthy();
    expect(within(cell).getByTitle("2 task chưa có số lượng")).toBeTruthy();
    // Every task has a number: nothing added.
    expect(within(screen.getByRole("row", { name: /JOB-2/ })).queryByText(/chưa có SL/)).toBeNull();
  });
});

describe("JobsList — Người tạo (owner, 2026-10-16)", () => {
  const creator = { id: id(77), displayName: "Người Tạo Thử", email: null, avatarUrl: null };

  it("the table has a “Người tạo” column after “Người làm” with the creator's name", () => {
    breakpoint.current = "desktop";
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    renderList([job({ createdBy: creator })]);
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers.indexOf("Người tạo")).toBe(headers.indexOf("Người làm") + 1);
    const row = screen.getByRole("row", { name: /JOB-1/ });
    expect(within(within(row).getAllByRole("cell")[headers.indexOf("Người tạo")]!).getByText("Người Tạo Thử")).toBeTruthy();
  });

  it("phone cards say who created the job", () => {
    breakpoint.current = "mobile";
    renderList([job({ createdBy: creator })]);
    expect(within(screen.getByRole("link", { name: /JOB-1/ })).getByText("Tạo bởi Người Tạo Thử")).toBeTruthy();
  });
});
