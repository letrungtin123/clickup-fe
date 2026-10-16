// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";
import { SessionValueContext } from "@/features/auth/session-context";
import { ApiError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";

import { jobsApi } from "../../jobs-api";
import { productionKeys } from "../../keys";
import { DoneQtyDialog, type DoneQtyExtras } from "./done-qty-dialog";
import { useTaskMover } from "./use-task-mover";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() })
}));

// PD-058 "Nhập số lượng để chuyển Done". Obviously fake ids and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const status = (n: number, code: string, name: string, countsDone: boolean) =>
  ({
    id: id(n),
    code,
    name,
    color: "blue",
    sortOrder: n,
    countsDone,
    countsChecked: false,
    isTerminal: false,
    isInitial: n === 1,
    setByRoles: [],
    active: true
  }) as ProductionStatus;
const WORKING = status(1, "IN_PROGRESS", "Đang làm", false);
const DONE = status(2, "DONE", "Done", true);

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

const toDone: TaskTransitionOption = {
  toStatusId: DONE.id,
  requiresNote: false,
  asksQty: true,
  asksOtHours: false,
  override: false
};

const task = (overrides: Partial<ProductionTask> = {}) =>
  ({
    id: id(50),
    number: 1286,
    code: "1286",
    jobId: id(60),
    jobCode: "VD JOB-1",
    assignee: { id: id(10), displayName: "Người A", email: null, avatarUrl: null },
    qc: null,
    process: { id: id(20), name: "Retouch", isQc: false },
    status: { id: WORKING.id, code: WORKING.code, name: WORKING.name, color: "blue" },
    qtyAssigned: null,
    qtyDone: null,
    doneAt: null,
    isSubtask: false,
    parentTaskId: null,
    subtasks: [],
    allocatedQty: 0,
    capabilities: { transitions: [toDone] },
    ...overrides
  }) as unknown as ProductionTask;

beforeAll(() => {
  // FormAlert scrolls itself into view (jsdom has no layout).
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const submit = async (name = "Xác nhận") => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
  });
};

describe("DoneQtyDialog", () => {
  const renderDialog = (pendingTask: ProductionTask, option: TaskTransitionOption = toDone) => {
    const onSubmit = vi.fn((_extras: DoneQtyExtras) => Promise.resolve());
    const missing = [
      ...(pendingTask.qtyAssigned === null
        ? [{ taskId: pendingTask.id, code: pendingTask.code, processName: "Retouch", subtask: false }]
        : []),
      ...pendingTask.subtasks
        .filter((item) => item.qtyAssigned === null)
        .map((item) => ({ taskId: item.id, code: item.code, processName: "Cắt nền", subtask: true }))
    ];
    render(
      <DoneQtyDialog
        pending={{ task: pendingTask, option, targets: missing }}
        target={DONE}
        onClose={() => undefined}
        onSubmit={onSubmit}
      />
    );
    return onSubmit;
  };

  it("lists each task without a quantity (code, process), focuses the first and needs a whole number ≥ 1", async () => {
    const onSubmit = renderDialog(task({ subtasks: [subtask(1, null), subtask(2, 4)] }));
    expect(screen.getByRole("heading", { name: "Nhập số lượng để chuyển Done" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "Task chưa có số lượng" });
    const rows = within(list).getAllByRole("listitem");
    // The line and its subtask without a number; the subtask that has one is not asked.
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("#1286");
    expect(rows[0]!.textContent).toContain("Retouch");
    expect(rows[1]!.textContent).toContain("#1286a");
    expect(document.body.textContent).not.toContain("1286b");
    const [line, sub] = within(list).getAllByRole("textbox");
    expect(document.activeElement).toBe(line);

    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("Nhập số tấm nguyên ≥ 1.")).toHaveLength(2);

    fireEvent.change(line!, { target: { value: "12" } });
    fireEvent.change(sub!, { target: { value: "0" } });
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(sub);

    fireEvent.change(sub!, { target: { value: "3" } });
    // Enter in a number submits (the dialog is a form).
    await act(async () => {
      fireEvent.submit(sub!.closest("form")!);
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledWith({
      qtyDone: 12,
      subtaskQtyDone: [{ taskId: id(101), qtyDone: 3 }]
    });
  });

  it("an ADMIN override into Done also asks its reason", async () => {
    const onSubmit = renderDialog(task(), { ...toDone, override: true, requiresNote: true });
    fireEvent.change(screen.getByRole("textbox", { name: /#1286/ }), { target: { value: "5" } });
    await submit();
    expect(screen.getByText("Nhập lý do chuyển ngoài luồng.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Lý do"), { target: { value: "Sửa số liệu" } });
    await submit();
    expect(onSubmit).toHaveBeenCalledWith({ qtyDone: 5, note: "Sửa số liệu" });
  });
});

describe("useTaskMover — Done needs every quantity (PD-058)", () => {
  const Harness = ({ moving }: { moving: ProductionTask }) => {
    const mover = useTaskMover();
    return (
      <>
        <button type="button" onClick={() => mover.start(moving, toDone)}>
          Chuyển Done
        </button>
        {mover.dialog}
      </>
    );
  };

  const renderMover = (moving: ProductionTask) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } }
    });
    client.setQueryData(productionKeys.workflow(), { statuses: [WORKING, DONE], transitions: [] });
    const session = {
      user: { id: id(10), displayName: "Người A", email: "a@example.test", avatarUrl: null },
      productionRoles: ["STAFF"]
    } as unknown as SessionContext;
    render(
      <QueryClientProvider client={client}>
        <SessionValueContext value={session}>
          <Harness moving={moving} />
        </SessionValueContext>
      </QueryClientProvider>
    );
  };

  it("a line whose numbers are all known moves straight to Done (no dialog, PD-046)", async () => {
    const known = task({ qtyAssigned: 7, allocatedQty: 10, subtasks: [subtask(1, 3)] });
    const move = vi.spyOn(jobsApi, "transitionTask").mockResolvedValue(known);
    renderMover(known);
    await submit("Chuyển Done");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(move).toHaveBeenCalledWith(known.id, { toStatusId: DONE.id });
  });

  it("asks the missing numbers first, then sends them with the move", async () => {
    const missing = task({ subtasks: [subtask(1, null)] });
    const move = vi.spyOn(jobsApi, "transitionTask").mockResolvedValue(missing);
    renderMover(missing);
    await submit("Chuyển Done");
    expect(move).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    const [line, sub] = within(dialog).getAllByRole("textbox");
    fireEvent.change(line!, { target: { value: "8" } });
    fireEvent.change(sub!, { target: { value: "2" } });
    await submit();
    await waitFor(() =>
      expect(move).toHaveBeenCalledWith(missing.id, {
        toStatusId: DONE.id,
        qtyDone: 8,
        subtaskQtyDone: [{ taskId: id(101), qtyDone: 2 }]
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("stale data: TASK_QTY_REQUIRED refetches the line and asks for the tasks the API names", async () => {
    // The cached line looked complete, but someone added a subtask without a quantity.
    const cached = task({ qtyAssigned: 7, allocatedQty: 7 });
    const fresh = task({ qtyAssigned: 7, allocatedQty: 7, subtasks: [subtask(1, null)] });
    const move = vi
      .spyOn(jobsApi, "transitionTask")
      .mockRejectedValueOnce(
        new ApiError({
          status: 400,
          code: "TASK_QTY_REQUIRED",
          message: "Nhập số lượng trước khi chuyển Done.",
          details: { taskIds: [id(101)] }
        })
      )
      .mockResolvedValueOnce(fresh);
    const refetch = vi.spyOn(jobsApi, "task").mockResolvedValue(fresh);
    renderMover(cached);
    await submit("Chuyển Done");
    expect(move).toHaveBeenCalledWith(cached.id, { toStatusId: DONE.id });
    const dialog = await screen.findByRole("dialog");
    expect(refetch).toHaveBeenCalledWith(cached.id, expect.anything());
    expect(within(dialog).getByText("Nhập số lượng trước khi chuyển Done.")).toBeTruthy();
    const rows = within(dialog).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain("#1286a");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "4" } });
    await submit();
    await waitFor(() =>
      expect(move).toHaveBeenLastCalledWith(fresh.id, {
        toStatusId: DONE.id,
        subtaskQtyDone: [{ taskId: id(101), qtyDone: 4 }]
      })
    );
  });
});
