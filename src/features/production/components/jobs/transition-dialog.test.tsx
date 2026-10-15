// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionStatus } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";

import { TransitionDialog, type Extras } from "./transition-dialog";

// PD-044 move dialog. Obviously fake ids and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const status = (n: number, code: string, name: string) =>
  ({ id: id(n), code, name, color: "blue" }) as unknown as ProductionStatus;
const DONE = status(4, "DONE", "Done");
const REWORK = status(2, "REWORK", "Cần sửa lại");

const subtask = (n: number, qtyAssigned: number) => ({
  id: id(100 + n),
  number: n,
  // PD-045: shown by code, the line number + a letter.
  code: `3${String.fromCharCode(96 + n - 3)}`,
  process: { id: id(21), name: "Cắt nền" },
  qtyAssigned,
  qtyDone: null,
  reason: "Lý do thử",
  createdBy: null,
  createdAt: "2026-10-02T09:00:00+07:00"
});

const task = (overrides: Partial<ProductionTask> = {}) =>
  ({
    id: id(1),
    number: 3,
    code: "3",
    jobCode: "VD JOB-1",
    assignee: { id: id(10), displayName: "Người A", email: null, avatarUrl: null },
    process: { id: id(20), name: "Retouch", isQc: false },
    status: { id: id(3), code: "IN_PROGRESS", name: "Đang làm", color: "blue" },
    qtyAssigned: 7,
    qtyDone: null,
    otHours: null,
    doneAt: null,
    subtasks: [subtask(4, 2), subtask(5, 1)],
    ...overrides
  }) as unknown as ProductionTask;

const option = (overrides: Partial<TaskTransitionOption> = {}): TaskTransitionOption => ({
  toStatusId: DONE.id,
  requiresNote: false,
  asksQty: true,
  asksOtHours: false,
  override: false,
  ...overrides
});

afterEach(cleanup);

const renderDialog = (pendingTask: ProductionTask, move: TaskTransitionOption, target: ProductionStatus) => {
  const onSubmit = vi.fn((_extras: Extras) => Promise.resolve(true));
  render(
    <TransitionDialog
      pending={{ task: pendingTask, option: move }}
      target={target}
      onClose={() => undefined}
      onSubmit={onSubmit}
    />
  );
  return onSubmit;
};

const submit = async (name: RegExp | string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
  });
};

describe("TransitionDialog — ADMIN override into Done", () => {
  // Owner 2026-10-15: Done itself never opens the dialog (needsInput); an override still asks only its reason.
  it("asks only the reason — no quantity fields — and sends it", async () => {
    const onSubmit = renderDialog(task(), option({ override: true, requiresNote: true }), DONE);
    expect(screen.queryByLabelText(/Số tấm hoàn thành/)).toBeNull();
    expect(screen.queryByText(/subtask/i)).toBeNull();
    await submit("Chuyển sang Done");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Nhập lý do chuyển ngoài luồng.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Lý do"), { target: { value: "Sửa số liệu cũ" } });
    await submit("Chuyển sang Done");
    expect(onSubmit).toHaveBeenCalledWith({ note: "Sửa số liệu cũ" });
  });
});

describe("TransitionDialog — QC sends the line back (Cần sửa lại)", () => {
  for (const [code, name] of [
    ["WAITING_QC", "Chờ QC"],
    ["QC_CHECKING", "Đang check"]
  ] as const) {
    it(`from ${name}: the reason is required and worded for the worker`, async () => {
      const onSubmit = renderDialog(
        task({ status: { id: id(6), code, name, color: "amber" }, doneAt: "2026-10-03T10:00:00+07:00" }),
        option({ toStatusId: REWORK.id, requiresNote: true, asksQty: false }),
        REWORK
      );
      expect(screen.getByText("Cần sửa lại · #3")).toBeTruthy();
      const note = screen.getByLabelText<HTMLTextAreaElement>("Cần sửa lại — lý do");
      expect(note.placeholder).toContain("Ví dụ: 3 tấm còn bóng đổ");
      await submit("Trả về người làm");
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText("Nhập lý do cần sửa để người làm biết phải sửa gì.")).toBeTruthy();
      fireEvent.change(note, { target: { value: "Còn bụi ở 2 tấm" } });
      await submit("Trả về người làm");
      expect(onSubmit).toHaveBeenCalledWith({ note: "Còn bụi ở 2 tấm" });
    });
  }
});
