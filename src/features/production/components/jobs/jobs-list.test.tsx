// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobDetail, JobSummary, ProductionTask } from "@/contracts/production-jobs";
import { SessionValueContext } from "@/features/auth/session-context";
import type { Breakpoint } from "@/hooks/use-breakpoint";
import type { SessionContext } from "@/lib/api/schemas";

import { jobsApi } from "../../jobs-api";
import { productionKeys } from "../../keys";
import { ProcessTotalChips } from "./job-bits";
import { JobsList } from "./jobs-list";

// PD-067 — the job List view (ClickUp-like): month groups, expandable job rows with their tasks, phone cards.
// Obviously fake ids and names (public repository).
const breakpoint = vi.hoisted((): { current: Breakpoint } => ({ current: "desktop" }));
vi.mock("@/hooks/use-breakpoint", () => ({ useBreakpoint: () => breakpoint.current }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
// jsdom has no layout: the table's virtualizer renders every row.
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

const TZ = "Asia/Ho_Chi_Minh";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = { id: id(1), displayName: "Người Xem", email: null, avatarUrl: null };
const WORKER = { id: id(3), displayName: "Thợ Bê", email: null, avatarUrl: null };
const IN_PROGRESS = { id: id(80), code: "IN_PROGRESS", name: "Đang làm", color: "blue" as const };
const DONE = { id: id(81), code: "DONE", name: "Done", color: "green" as const };

const totals = [
  { process: { id: id(41), name: "Normal Retouch" }, qty: 16 },
  { process: { id: id(42), name: "Premium Retouch" }, qty: 15 },
  { process: { id: id(43), name: "Light Retouch" }, qty: 4 },
  { process: { id: id(44), name: "Cắt nền" }, qty: 3 },
  { process: { id: id(45), name: "Ghép nền" }, qty: 2 }
];

const job = (extra: Partial<JobSummary> = {}): JobSummary => ({
  id: id(101),
  number: 1,
  code: "JOB-1",
  name: null,
  project: { id: id(2), code: "AXP", name: "Axon", clientName: null },
  leader: null,
  // 1 October 00:30 in Ho Chi Minh City (still 30 September in UTC).
  receivedAt: "2026-09-30T17:30:00.000Z",
  deadline: "2099-10-12T10:00:00.000Z",
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
  taskCount: 2,
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
  archived: false,
  ...extra
});

const caps = (
  transitions: ProductionTask["capabilities"]["transitions"] = []
): ProductionTask["capabilities"] => ({
  transitions,
  canEdit: false,
  canAssign: false,
  canChangeAssignee: false,
  canEditQty: false,
  canEditQtyAssigned: false,
  canRequestQty: false,
  canDecideQtyRequest: false,
  canCreateSubtask: false,
  canDelete: false
});

const task = (n: number, extra: Partial<ProductionTask> = {}): ProductionTask => ({
  id: id(500 + n),
  number: n,
  code: String(n),
  jobId: id(101),
  jobCode: "JOB-1",
  project: { id: id(2), code: "AXP", name: "Axon" },
  assignee: WORKER,
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
  status: IN_PROGRESS,
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
  capabilities: caps(),
  ...extra
});

const move = {
  toStatusId: DONE.id,
  requiresNote: false,
  asksQty: true,
  asksOtHours: false,
  override: false
};
const line = task(12, { capabilities: caps([move]), note: "Ghi chú dài cho task" });
const subtask = task(13, {
  code: "12a",
  isSubtask: true,
  parentTaskId: line.id,
  splitReason: "Phần nền",
  qtyAssigned: null
});
const plainLine = task(14, {
  shift: { id: id(31), name: "OT", payMode: "MONEY_IF_KPI", requiresOtHours: true }
});

const detailOf = (
  summary: JobSummary,
  caps: Partial<JobDetail["capabilities"]> = {}
): JobDetail => ({
  ...summary,
  tasks: [line, subtask, plainLine],
  feedbacks: [],
  capabilities: {
    canEdit: false,
    canChangeLeader: false,
    canSplit: true,
    splitOwnOnly: false,
    canDelete: false,
    canFeedback: false,
    canCloseFeedback: false,
    canArchive: false,
    canChangeStatus: false,
    bulkActions: [],
    ...caps
  }
});

const status = (
  value: { id: string; code: string; name: string; color: string },
  sortOrder: number
) => ({
  ...value,
  sortOrder,
  countsDone: value.code === "DONE",
  countsChecked: false,
  isTerminal: false,
  isInitial: false,
  setByRoles: [],
  active: true
});

const LocationProbe = () => <output data-testid="location">{useLocation().search}</output>;

const renderList = (
  jobs: JobSummary[],
  options: {
    update?: "none" | "own" | "all";
    monthCounts?: Map<string, number>;
    person?: { id: string; displayName: string } | null;
    onCreateJob?: (month: string) => void;
    client?: QueryClient;
  } = {}
) => {
  const client =
    options.client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false }
      }
    });
  client.setQueryData(productionKeys.tags(), { items: [] });
  client.setQueryData(productionKeys.jobStatuses(), { items: [] });
  client.setQueryData(productionKeys.workflow(), {
    statuses: [status(IN_PROGRESS, 1), status(DONE, 2)],
    transitions: []
  });
  client.setQueryData(productionKeys.me(), {
    roles: ["LEADER"],
    isAdmin: false,
    teamId: null,
    jobPermissions: {
      view: "all",
      create: "all",
      update: options.update ?? "none",
      delete: "none"
    },
    settings: { timezone: TZ }
  });
  const session = {
    user: { ...ME, email: "viewer@example.test" },
    productionRoles: ["LEADER"]
  } as unknown as SessionContext;
  const ui = (list: JobSummary[]): ReactNode => (
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter>
          <JobsList
            jobs={list}
            isPending={false}
            error={null}
            onRetry={() => undefined}
            hasNextPage={false}
            isFetchingNextPage={false}
            fetchNextPage={() => undefined}
            timeZone={TZ}
            filtering={false}
            empty={null}
            monthCounts={options.monthCounts}
            person={options.person ?? null}
            onCreateJob={options.onCreateJob}
          />
          <LocationProbe />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
  const view = render(ui(jobs));
  return { ...view, client, rerenderWith: (list: JobSummary[]) => view.rerender(ui(list)) };
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
};

const headers = () => screen.getAllByRole("columnheader").map((header) => header.textContent);
const cellOf = (row: HTMLElement, label: string) =>
  within(row).getAllByRole("cell")[headers().indexOf(label)]!;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
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

describe("JobsList — month groups (PD-067)", () => {
  it("groups by the month of Ngày nhận in the business timezone, newest first, with the facets' counts", () => {
    breakpoint.current = "desktop";
    renderList(
      [job(), job({ id: id(102), code: "JOB-2", receivedAt: "2026-09-20T00:00:00+07:00" })],
      {
        monthCounts: new Map([["2026-10", 12]])
      }
    );
    const groups = screen.getAllByRole("button", { name: /Tháng \d+ · 2026/ });
    expect(groups.map((button) => button.textContent)).toEqual([
      "Tháng 10 · 2026, thu gọn nhóm",
      "Tháng 9 · 2026, thu gọn nhóm"
    ]);
    // October: every matching job (facets); September: the loaded ones until the facets know.
    expect(screen.getByTitle("12 job").textContent).toBe("12");
    expect(screen.getByTitle("1 job").textContent).toBe("1");
    const rows = screen.getAllByRole("row").map((row) => row.getAttribute("aria-label"));
    expect(rows.indexOf("JOB-1")).toBeLessThan(rows.indexOf("JOB-2"));
  });

  it("a month folds away and stays folded (remembered per user)", async () => {
    breakpoint.current = "desktop";
    const view = renderList([job()]);
    await click(screen.getByRole("button", { name: /Tháng 10 · 2026/ }));
    expect(screen.queryByRole("row", { name: "JOB-1" })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Tháng 10 · 2026/ }).getAttribute("aria-expanded")
    ).toBe("false");
    view.unmount();
    renderList([job()]);
    expect(screen.queryByRole("row", { name: "JOB-1" })).toBeNull();
  });

  it("“+ Tạo job” closes each month for whoever may create jobs, with that month", () => {
    breakpoint.current = "desktop";
    const create = vi.fn();
    renderList([job()], { onCreateJob: create });
    fireEvent.click(screen.getByRole("button", { name: "Tạo job" }));
    expect(create).toHaveBeenCalledWith("2026-10");
  });
});

describe("JobsList — columns (PD-067, ClickUp order)", () => {
  it("Tên · Người làm · Ngày nhận · Ngày giao · Ca · Trạng thái · QC · Dự án · Công đoạn · Số lượng · Điểm · Tiến độ · Người tạo · Ghi chú · Tag", () => {
    breakpoint.current = "desktop";
    renderList([job()]);
    expect(headers()).toEqual([
      "Tên",
      "Người làm",
      "Ngày nhận",
      "Ngày giao",
      "Ca",
      "Trạng thái",
      "QC",
      "Dự án",
      "Công đoạn",
      "Số lượng",
      "Điểm",
      "Tiến độ",
      "Người tạo",
      "Ghi chú",
      "Tag"
    ]);
  });

  it("a job row: project prefix and chip, creator, Tổng tấm with “N chưa có SL”, one process chip then +N", () => {
    breakpoint.current = "desktop";
    const creator = { id: id(77), displayName: "Người Tạo Thử", email: null, avatarUrl: null };
    renderList([job({ createdBy: creator, totalImages: 120, tasksWithoutQty: 2 })]);
    const row = screen.getByRole("row", { name: "JOB-1" });
    expect(within(cellOf(row, "Tên")).getByText("AXP ·")).toBeTruthy();
    expect(within(cellOf(row, "Tên")).getByRole("link", { name: "JOB-1" })).toBeTruthy();
    expect(cellOf(row, "Dự án").textContent).toBe("AXP");
    expect(within(cellOf(row, "Người tạo")).getByText("Người Tạo Thử")).toBeTruthy();
    const qty = cellOf(row, "Số lượng");
    expect(qty.textContent).toContain("120");
    expect(within(qty).getByText("2 chưa có SL")).toBeTruthy();
    const process = cellOf(row, "Công đoạn");
    expect(within(process).getByText("Normal Retouch")).toBeTruthy();
    expect(within(process).queryByText("Premium Retouch")).toBeNull();
    expect(within(process).getByText("+4")).toBeTruthy();
  });

  it("the job status is the job page's menu where the viewer may change it, else a plain chip", () => {
    breakpoint.current = "desktop";
    renderList([job()], { update: "all" });
    expect(
      screen.getByRole("button", { name: /Trạng thái job: Mới nhận\. Đổi trạng thái/ })
    ).toBeTruthy();
    cleanup();
    renderList([job()], { update: "none" });
    expect(screen.queryByRole("button", { name: /Trạng thái job/ })).toBeNull();
    expect(screen.getByTitle("Mới nhận")).toBeTruthy();
  });

  it("per-person view: Công đoạn / Số lượng / Tiến độ are the person's (“của …” under the label)", () => {
    breakpoint.current = "desktop";
    renderList(
      [
        job({
          personShare: {
            processes: ["Retouch"],
            taskCount: 1,
            qtyAssigned: 25,
            qtyDone: 5,
            qtyChecked: 0
          }
        })
      ],
      { person: { id: WORKER.id, displayName: "Thợ Bê" } }
    );
    expect(screen.getByTitle("Số lượng của Thợ Bê").textContent).toBe("Số lượngcủa Bê");
    const row = screen.getByRole("row", { name: "JOB-1" });
    const cells = within(row).getAllByRole("cell");
    const index = screen
      .getAllByRole("columnheader")
      .findIndex((header) => header.getAttribute("title") === "Số lượng của Thợ Bê");
    expect(cells[index]!.textContent).toBe("25");
    expect(within(row).getByText("Retouch")).toBeTruthy();
  });
});

describe("JobsList — a job row unfolds into its tasks (PD-067)", () => {
  it("loads the job's tasks on expand (skeleton first), nests subtasks, and keeps the job page's status dropdown", async () => {
    breakpoint.current = "desktop";
    let resolve: (value: JobDetail) => void = () => undefined;
    const get = vi
      .spyOn(jobsApi, "get")
      .mockImplementation(() => new Promise<JobDetail>((done) => (resolve = done)));
    renderList([job()]);
    expect(screen.queryByRole("row", { name: /Task #12/ })).toBeNull();
    await click(screen.getByRole("button", { name: "Mở task của job JOB-1" }));
    expect(get).toHaveBeenCalledWith(id(101), expect.anything());
    expect(document.querySelectorAll("[role=row][aria-busy=true]")).toHaveLength(2);
    await act(async () => {
      resolve(detailOf(job()));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole("row", { name: "Task #12 Retouch" })).toBeTruthy());

    // A line with moves: the status chip is the dropdown; without moves a plain chip.
    const lineRow = screen.getByRole("row", { name: "Task #12 Retouch" });
    expect(
      within(lineRow).getByRole("button", { name: "Trạng thái #12: Đang làm — đổi trạng thái" })
    ).toBeTruthy();
    expect(within(cellOf(lineRow, "Ca")).getByText("Chính thức")).toBeTruthy();
    expect(within(cellOf(lineRow, "Ghi chú")).getByTitle("Ghi chú dài cho task")).toBeTruthy();
    const plain = screen.getByRole("row", { name: "Task #14 Retouch" });
    expect(within(plain).queryByRole("button", { name: /đổi trạng thái/ })).toBeNull();
    expect(within(cellOf(plain, "Ca")).getByTitle("OT — khoán")).toBeTruthy();

    // The subtask sits right under its line; its status follows the line; "Chưa có SL" for its quantity.
    const rows = screen.getAllByRole("row").map((row) => row.getAttribute("aria-label"));
    expect(rows.indexOf("Subtask #12a Retouch")).toBe(rows.indexOf("Task #12 Retouch") + 1);
    const sub = screen.getByRole("row", { name: "Subtask #12a Retouch" });
    expect(within(sub).getByTitle("Theo task #12")).toBeTruthy();
    expect(within(sub).getByText("Chưa có SL")).toBeTruthy();
    expect(within(sub).getByTitle("Lý do: Phần nền")).toBeTruthy();

    // "+ Chia task" under the job (canSplit).
    expect(screen.getByRole("button", { name: "Chia task" })).toBeTruthy();
    // Opening a task: the task sheet (?ptask=); a subtask opens its line.
    fireEvent.click(within(plain).getByRole("button", { name: /#14/ }));
    expect(screen.getByTestId("location").textContent).toBe(`?ptask=${plainLine.id}`);
    fireEvent.click(within(sub).getByRole("button", { name: /#12a/ }));
    expect(screen.getByTestId("location").textContent).toBe(`?ptask=${line.id}`);
  });

  it("uses the cached job detail, offers “Nhập Task” with create: own, and folds back", async () => {
    breakpoint.current = "desktop";
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } }
    });
    client.setQueryData(productionKeys.job(id(101)), detailOf(job(), { splitOwnOnly: true }));
    const get = vi.spyOn(jobsApi, "get");
    renderList([job()], { client });
    await click(screen.getByRole("button", { name: "Mở task của job JOB-1" }));
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByRole("row", { name: "Task #12 Retouch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nhập Task" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Chia task" })).toBeNull();
    await click(screen.getByRole("button", { name: "Thu gọn task của job JOB-1" }));
    expect(screen.queryByRole("row", { name: "Task #12 Retouch" })).toBeNull();
  });

  it("an archived job's tasks are read-only (no status dropdown, no Chia task)", async () => {
    breakpoint.current = "desktop";
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } }
    });
    client.setQueryData(productionKeys.job(id(101)), {
      ...detailOf(job({ archived: true })),
      archived: true
    });
    renderList([job({ archived: true })], { client });
    await click(screen.getByRole("button", { name: "Mở task của job JOB-1" }));
    expect(screen.getByRole("row", { name: "Task #12 Retouch" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /đổi trạng thái/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Chia task" })).toBeNull();
  });
});

describe("JobsList — phones (PD-067)", () => {
  it("month groups with job cards (no table); a card unfolds into task cards with the status dropdown", async () => {
    breakpoint.current = "mobile";
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } }
    });
    client.setQueryData(productionKeys.job(id(101)), detailOf(job()));
    renderList([job({ tasksWithoutQty: 2 })], { client, monthCounts: new Map([["2026-10", 3]]) });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: /Tháng 10 · 2026/ })).toBeTruthy();
    expect(screen.getByText("3 job")).toBeTruthy();
    const card = screen.getByRole("article", { name: "JOB-1" });
    expect(within(card).getByRole("link", { name: "JOB-1" })).toBeTruthy();
    expect(within(card).getByText("2 task chưa có số lượng")).toBeTruthy();
    expect(within(card).getByText("Normal Retouch")).toBeTruthy();
    await click(within(card).getByRole("button", { name: "Mở task của job JOB-1" }));
    const tasks = screen.getByRole("list", { name: "Task của job JOB-1" });
    const first = within(tasks).getByRole("button", { name: "Task #12 Retouch" });
    expect(
      within(first).getByRole("button", { name: "Trạng thái #12: Đang làm — đổi trạng thái" })
    ).toBeTruthy();
    expect(within(tasks).getByRole("button", { name: "Subtask #12a Retouch" })).toBeTruthy();
    expect(within(tasks).getByRole("button", { name: "Chia task" })).toBeTruthy();
  });
});

describe("JobsList — Điểm (PD-070: official-shift points, never money)", () => {
  const recorded = task(21, { points: { credits: 12.5, expected: false, missing: null } });
  const expectedSub = task(22, {
    code: "21a",
    isSubtask: true,
    parentTaskId: recorded.id,
    process: { id: id(21), name: "Cắt nền", isQc: false },
    qtyAssigned: 4,
    points: { credits: 3, expected: true, missing: null }
  });
  const khoan = task(23, {
    shift: { id: id(31), name: "Ca khoán", payMode: "MONEY_IF_KPI", requiresOtHours: false },
    points: null
  });
  const noRule = task(24, {
    process: { id: id(22), name: "Light Retouch", isQc: false },
    points: { credits: null, expected: true, missing: "RULE" }
  });
  const noQty = task(25, {
    qtyAssigned: null,
    points: { credits: null, expected: true, missing: "QTY" }
  });
  const hidden = task(26, { points: null });
  const pointsJob = job({ pointsOfficial: { credits: 15.5, expected: true } });
  const pointsDetail = (): JobDetail => ({
    ...detailOf(pointsJob),
    tasks: [recorded, expectedSub, khoan, noRule, noQty, hidden]
  });
  const clientWith = () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } }
    });
    client.setQueryData(productionKeys.job(id(101)), pointsDetail());
    return client;
  };

  it("task rows: recorded, expected (muted), “—” for Khoán / no quantity / no price / hidden; the job's total", async () => {
    breakpoint.current = "desktop";
    renderList([pointsJob], { client: clientWith() });
    const jobCell = cellOf(screen.getByRole("row", { name: "JOB-1" }), "Điểm");
    const total = within(jobCell).getByTitle(
      "Tổng điểm ca chính thức — gồm điểm dự kiến của task chưa Done"
    );
    expect(total.textContent).toContain("15,50");
    expect(total.className).toContain("text-foreground-muted");
    await click(screen.getByRole("button", { name: "Mở task của job JOB-1" }));

    const points = (name: string) => cellOf(screen.getByRole("row", { name }), "Điểm");
    const own = within(points("Task #21 Retouch")).getByTitle("Điểm đã ghi nhận");
    expect(own.textContent).toContain("12,50");
    expect(own.className).not.toContain("text-foreground-muted");
    const sub = within(points("Subtask #21a Cắt nền")).getByTitle(
      "Điểm dự kiến theo Bảng đơn giá — ghi nhận khi task Done"
    );
    expect(sub.textContent).toContain("3,00");
    expect(sub.className).toContain("text-foreground-muted");

    const dash = (name: string) => within(points(name)).getByText("—");
    expect(dash("Task #23 Retouch").getAttribute("title")).toBe("Ca khoán — không tính điểm");
    expect(points("Task #23 Retouch").textContent).not.toMatch(/\d/);
    expect(dash("Task #24 Light Retouch").getAttribute("title")).toBe(
      "Chưa có đơn giá cho công đoạn này"
    );
    expect(dash("Task #25 Retouch").getAttribute("title")).toBe("Chưa có số lượng");
    expect(dash("Task #26 Retouch").getAttribute("title")).toBe(
      "Bạn không có quyền xem điểm của người khác"
    );
  });

  it("a job without official points shows “—”; recorded totals are not muted", () => {
    breakpoint.current = "desktop";
    renderList([
      job({ pointsOfficial: null }),
      job({
        id: id(102),
        code: "JOB-2",
        pointsOfficial: { credits: 1234.5, expected: false }
      })
    ]);
    const none = cellOf(screen.getByRole("row", { name: "JOB-1" }), "Điểm");
    expect(within(none).getByText("—").getAttribute("title")).toBe("Chưa có điểm ca chính thức");
    const done = within(cellOf(screen.getByRole("row", { name: "JOB-2" }), "Điểm")).getByTitle(
      "Tổng điểm ca chính thức đã ghi nhận"
    );
    expect(done.textContent).toContain("1.234,50");
    expect(done.className).not.toContain("text-foreground-muted");
  });

  it("per-person view: the column is the person's (“của …”)", () => {
    breakpoint.current = "desktop";
    renderList(
      [
        job({
          personShare: {
            processes: ["Retouch"],
            taskCount: 1,
            qtyAssigned: 10,
            qtyDone: 10,
            qtyChecked: 0
          },
          pointsOfficial: { credits: 7.25, expected: false }
        })
      ],
      { person: { id: WORKER.id, displayName: "Thợ Bê" } }
    );
    const index = screen
      .getAllByRole("columnheader")
      .findIndex((header) => header.getAttribute("title") === "Điểm của Thợ Bê");
    expect(index).toBeGreaterThan(-1);
    const row = screen.getByRole("row", { name: "JOB-1" });
    expect(within(row).getAllByRole("cell")[index]!.textContent).toContain("7,25");
  });

  it("phones: a small “N điểm” line on the job card and the task cards (expected: “≈ … dự kiến”), none for Khoán", async () => {
    breakpoint.current = "mobile";
    renderList([pointsJob], { client: clientWith() });
    const card = screen.getByRole("article", { name: "JOB-1" });
    expect(within(card).getByText(/điểm/).textContent).toBe("≈ 15,50 điểm dự kiến");
    await click(within(card).getByRole("button", { name: "Mở task của job JOB-1" }));
    const tasks = screen.getByRole("list", { name: "Task của job JOB-1" });
    const line = within(tasks).getByRole("button", { name: "Task #21 Retouch" });
    expect(within(line).getByTitle("Điểm đã ghi nhận").textContent).toBe("12,50 điểm");
    const sub = within(tasks).getByRole("button", { name: "Subtask #21a Cắt nền" });
    expect(within(sub).getByTitle(/Điểm dự kiến/).textContent).toBe("≈ 3,00 điểm dự kiến");
    const khoanCard = within(tasks).getByRole("button", { name: "Task #23 Retouch" });
    expect(within(khoanCard).queryByText(/điểm/)).toBeNull();
    expect(khoanCard.textContent).not.toContain("₫");
  });
});
