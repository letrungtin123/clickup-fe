// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProductionTask } from "@/contracts/production-jobs";
import type { Breakpoint } from "@/hooks/use-breakpoint";

import { productionKeys } from "../../keys";
import { JobTasks } from "./job-tasks";
import { TaskCard } from "./task-card";

// PD-058: "Chưa có SL" wherever a quantity shows. Obviously fake ids and names (the repository is public).
const breakpoint = vi.hoisted((): { current: Breakpoint } => ({ current: "desktop" }));
vi.mock("@/hooks/use-breakpoint", () => ({ useBreakpoint: () => breakpoint.current }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Asia/Ho_Chi_Minh";
const WORKER = { id: id(2), displayName: "Người B", email: null, avatarUrl: null };

const subtask = (n: number, qtyAssigned: number | null) => ({
  id: id(100 + n),
  number: n,
  code: `1286${String.fromCharCode(96 + n)}`,
  process: { id: id(21), name: "Cắt nền" },
  qtyAssigned,
  qtyDone: null,
  reason: null,
  createdBy: null,
  createdAt: "2026-10-02T09:00:00+07:00"
});

const line = (overrides: Partial<ProductionTask> = {}) =>
  ({
    id: id(50),
    number: 1286,
    code: "1286",
    jobId: id(60),
    jobCode: "VD JOB-1",
    project: { id: id(70), code: "VD", name: "Dự án thử" },
    assignee: WORKER,
    qc: null,
    process: { id: id(20), name: "Retouch", isQc: false },
    shift: { id: id(30), name: "Ca ngày", payMode: "POINTS", requiresOtHours: false },
    qtyAssigned: null,
    qtyDone: null,
    errorQty: null,
    otHours: null,
    assignedAt: "2026-10-01T00:00:00+07:00",
    deadline: "2099-10-05T23:59:00+07:00",
    doneAt: null,
    checkedAt: null,
    status: { id: id(80), code: "IN_PROGRESS", name: "Đang làm", color: "blue" },
    kind: "NORMAL",
    parentTaskId: null,
    isSubtask: false,
    splitReason: null,
    subtasks: [],
    allocatedQty: 0,
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
    lastQcFail: null,
    createdAt: "2026-10-01T08:00:00+07:00",
    updatedAt: "2026-10-01T08:00:00+07:00",
    capabilities: { transitions: [] },
    ...overrides
  }) as unknown as ProductionTask;

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(productionKeys.workflow(), { statuses: [], transitions: [] });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>{ui}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const table = (tasks: ProductionTask[]) =>
  wrap(
    <JobTasks
      tasks={tasks}
      timeZone={TZ}
      onOpen={() => undefined}
      onMove={() => undefined}
      busyTaskId={null}
    />
  );

afterEach(cleanup);

describe("JobTasks — no quantity yet (PD-058)", () => {
  it("the table's “Xong / giao” shows the chip for the line and its subtask; no total until every part has one", () => {
    breakpoint.current = "desktop";
    table([line({ subtasks: [subtask(1, null), subtask(2, 3)], allocatedQty: 3 })]);
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    const column = headers.indexOf("Xong / giao");
    const [lineRow, emptySub, knownSub] = screen.getAllByRole("row").slice(1);
    const qtyOf = (row: HTMLElement) => within(row).getAllByRole("cell")[column]!;
    expect(within(qtyOf(lineRow!)).getByText("Chưa có SL")).toBeTruthy();
    expect(qtyOf(lineRow!).textContent).toContain("tổng chưa đủ SL");
    expect(within(qtyOf(emptySub!)).getByText("Chưa có SL")).toBeTruthy();
    expect(emptySub!.getAttribute("aria-label")).toContain("chưa có số lượng");
    expect(qtyOf(knownSub!).textContent?.replace(/\s+/g, " ")).toBe("— / 3");
  });

  it("phone cards show the chip too", () => {
    breakpoint.current = "mobile";
    table([line({ subtasks: [subtask(1, null)] })]);
    expect(screen.getAllByText("Chưa có SL")).toHaveLength(2);
    expect(screen.queryByText(/tấm/)).toBeNull();
  });
});

describe("TaskCard — no quantity yet (PD-058)", () => {
  it("shows “Chưa có SL” instead of “N tấm”", () => {
    wrap(<TaskCard task={line()} timeZone={TZ} onOpen={() => undefined} />);
    expect(screen.getByText("Chưa có SL")).toBeTruthy();
    expect(screen.queryByText(/ tấm$/)).toBeNull();
  });
});
