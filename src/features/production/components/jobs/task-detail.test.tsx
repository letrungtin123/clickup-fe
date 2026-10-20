// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionTask } from "@/contracts/production-jobs";
import { SessionValueContext } from "@/features/auth/session-context";
import type { SessionContext } from "@/lib/api/schemas";

import { productionKeys } from "../../keys";
import { TaskDetailView } from "./task-detail";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// PD-044 / PD-047 task page smoke test. Obviously fake ids and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Asia/Ho_Chi_Minh";
const WORKER = { id: id(2), displayName: "Người B", email: null, avatarUrl: null };
const QC = { id: id(3), displayName: "Người C", email: null, avatarUrl: null };
const REWORK = { id: id(81), code: "REWORK", name: "Cần sửa lại", color: "red" as const };
const IN_PROGRESS = { id: id(82), code: "IN_PROGRESS", name: "Đang làm", color: "blue" as const };

const caps = (overrides: Partial<ProductionTask["capabilities"]> = {}): ProductionTask["capabilities"] => ({
  transitions: [],
  canEdit: false,
  canAssign: false,
  canChangeAssignee: false,
  canEditQty: false,
  canEditQtyAssigned: false,
  canRequestQty: false,
  canDecideQtyRequest: false,
  canCreateSubtask: false,
  canDelete: false,
  ...overrides
});

const task = (overrides: Partial<ProductionTask> = {}): ProductionTask =>
  ({
    id: id(50),
    number: 3,
    code: "3",
    jobId: id(60),
    jobCode: "VD JOB-1",
    project: { id: id(70), code: "VD", name: "Dự án thử" },
    assignee: WORKER,
    qc: QC,
    process: { id: id(20), name: "Retouch", isQc: false },
    shift: { id: id(30), name: "Ca ngày", payMode: "POINTS", requiresOtHours: false },
    qtyAssigned: 7,
    qtyDone: null,
    errorQty: null,
    otHours: null,
    assignedAt: "2026-10-01T00:00:00+07:00",
    deadline: "2099-10-05T23:59:00+07:00",
    doneAt: null,
    checkedAt: null,
    status: REWORK,
    kind: "NORMAL",
    parentTaskId: null,
    isSubtask: false,
    splitReason: null,
    subtasks: [],
    allocatedQty: 7,
    pendingQtyRequest: null,
    feedbackId: null,
    note: null,
    workLink: null,
    isLate: false,
    jobArchived: false,
    qcFailCount: 1,
    customValues: {},
    tagIds: [],
    myCredits: [],
    points: null,
    lastQcFail: { note: "Còn bụi ở 2 tấm", at: "2026-10-02T15:00:00+07:00", by: QC },
    createdAt: "2026-10-01T08:00:00+07:00",
    updatedAt: "2026-10-01T08:00:00+07:00",
    capabilities: caps(),
    ...overrides
  });

const renderDetail = (
  shown: ProductionTask,
  extra: ProductionTask[] = [],
  variant: "sheet" | "page" = "page"
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } }
  });
  client.setQueryData(productionKeys.me(), {
    roles: ["STAFF"],
    isAdmin: false,
    teamId: null,
    jobPermissions: { view: "own", create: "own", update: "own", delete: "none" },
    settings: { timezone: TZ }
  });
  client.setQueryData(productionKeys.workflow(), {
    statuses: [REWORK, IN_PROGRESS].map((status, index) => ({
      ...status,
      sortOrder: index,
      countsDone: false,
      countsChecked: false,
      isTerminal: false,
      isInitial: false,
      setByRoles: [],
      active: true
    })),
    transitions: []
  });
  client.setQueryData(productionKeys.processes(), { items: [] });
  client.setQueryData(productionKeys.shifts(), { items: [] });
  client.setQueryData(productionKeys.tags(), { items: [] });
  client.setQueryData(productionKeys.customFields(), { items: [] });
  for (const item of [shown, ...extra]) {
    client.setQueryData(productionKeys.task(item.id), item);
    client.setQueryData(productionKeys.timeline("tasks", item.id), {
      pages: [{ items: [], pageInfo: { hasMore: false, nextCursor: null } }],
      pageParams: [undefined]
    });
  }
  const session = {
    user: { id: WORKER.id, displayName: WORKER.displayName, email: "worker@example.test", avatarUrl: null },
    productionRoles: ["STAFF"]
  } as unknown as SessionContext;
  return render(
    <QueryClientProvider client={client}>
      <SessionValueContext value={session}>
        <MemoryRouter>
          <TaskDetailView taskId={shown.id} variant={variant} onOpenTask={() => undefined} />
        </MemoryRouter>
      </SessionValueContext>
    </QueryClientProvider>
  );
};

afterEach(cleanup);

describe("TaskDetailView (PD-044 / PD-047)", () => {
  it("the status is a move dropdown, QC's request reads 'QC yêu cầu sửa lại', fields are edited by clicking them (no “Sửa dòng”)", () => {
    renderDetail(
      task({
        capabilities: caps({
          canEdit: true,
          canRequestQty: true,
          transitions: [
            { toStatusId: IN_PROGRESS.id, requiresNote: false, asksQty: false, asksOtHours: false, override: false }
          ]
        })
      })
    );
    expect(screen.getByRole("button", { name: "Trạng thái #3: Cần sửa lại — đổi trạng thái" })).toBeTruthy();
    expect(screen.getByText("QC yêu cầu sửa lại")).toBeTruthy();
    expect(screen.getByText("Còn bụi ở 2 tấm")).toBeTruthy();
    expect(screen.getByText("QC yêu cầu sửa lại 1 lần")).toBeTruthy();
    for (const name of ["Sửa dòng", "Sửa số tấm đã xong", "Đổi người làm / QC", "Đổi QC"])
      expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.getByRole("button", { name: "Sửa Công đoạn" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đề nghị sửa Số lượng giao" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sửa Ghi chú" })).toBeTruthy();
  });

  it("a subtask names its line, follows its status and edits only its own fields", () => {
    const parent = task({ id: id(40), number: 3, status: IN_PROGRESS, lastQcFail: null, qcFailCount: 0 });
    renderDetail(
      task({
        id: id(51),
        number: 4,
        code: "3a",
        status: IN_PROGRESS,
        isSubtask: true,
        parentTaskId: parent.id,
        splitReason: "Phần nền cần cắt riêng",
        lastQcFail: null,
        qcFailCount: 0,
        capabilities: caps({ canEdit: true, canEditQtyAssigned: true, canDelete: true })
      }),
      [parent]
    );
    expect(screen.getByText("Subtask của")).toBeTruthy();
    expect(screen.getByRole("button", { name: "task #3" })).toBeTruthy();
    expect(screen.getByText("— trạng thái đi theo task gốc")).toBeTruthy();
    expect(screen.getByText("Phần nền cần cắt riêng")).toBeTruthy();
    // Plain chip: a subtask has no moves of its own.
    expect(screen.queryByRole("button", { name: /Trạng thái #3a/ })).toBeNull();
    expect(screen.getByTitle("Trạng thái theo task gốc")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sửa Số lượng giao" })).toBeTruthy();
    for (const name of ["Sửa Ca", "Sửa Ngày giao", "Sửa Link chia việc", "Sửa Nhân viên thực hiện"])
      expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.queryByText(/Tách một phần số tấm/)).toBeNull();
    expect(screen.getByRole("button", { name: "Xoá subtask" })).toBeTruthy();
  });

  it("staff see no “Xoá task” on a task the Leader split; with the delete right it says “Xoá task” (PD-047)", () => {
    const shown = task({
      lastQcFail: null,
      qcFailCount: 0,
      capabilities: caps({ canEdit: true, canCreateSubtask: true, canDelete: false })
    });
    const { unmount } = renderDetail(shown);
    expect(screen.queryByRole("button", { name: /^Xoá (task|dòng)$/ })).toBeNull();
    // The worker still manages subtasks (create here; delete on each subtask row).
    expect(screen.getByRole("button", { name: "Thêm subtask" })).toBeTruthy();
    unmount();
    renderDetail({ ...shown, capabilities: caps({ canEdit: true, canDelete: true }) });
    expect(screen.getByRole("button", { name: "Xoá task" })).toBeTruthy();
  });

  it("the side sheet offers “Mở trang riêng” at the top, in the header beside the job and project; the page does not", () => {
    const shown = task({
      lastQcFail: null,
      qcFailCount: 0,
      capabilities: caps({ canEdit: true, canDelete: true })
    });
    const { unmount } = renderDetail(shown, [], "sheet");
    // A router link drawn as a ghost button (Base UI gives it the button role, like every Button-rendered link).
    const open = screen.getByRole("button", { name: "Mở trang riêng" });
    expect(open.tagName).toBe("A");
    expect(open.getAttribute("data-to")).toBe(`/production/tasks/${shown.id}`);
    const header = open.closest("header");
    expect(header).toBeTruthy();
    // Same row as the job link, before the title; the bottom keeps only “Xoá task”.
    expect(open.parentElement).toBe(screen.getByRole("link", { name: "VD JOB-1" }).parentElement);
    const title = screen.getByRole("heading", { name: "#3 · Retouch" });
    expect(open.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header?.contains(screen.getByRole("button", { name: "Xoá task" }))).toBe(false);
    unmount();
    renderDetail(shown);
    expect(screen.queryByText("Mở trang riêng")).toBeNull();
  });

  it("asking the Leader to change “Số lượng giao” opens in place — no dialog (PD-047)", async () => {
    renderDetail(task({ capabilities: caps({ canEdit: true, canRequestQty: true }) }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Đề nghị sửa Số lượng giao" }));
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("group", { name: "Đề nghị sửa Số lượng giao" })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Số lượng mới").value).toBe("7");
    expect(screen.getByRole("button", { name: "Gửi đề nghị" })).toBeTruthy();
  });
});
