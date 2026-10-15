// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskLog } from "@/contracts/production-jobs";

import { JobLogList } from "./job-log";

// Obviously fake ids, names and numbers (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VN = "Asia/Ho_Chi_Minh";
const NOW = new Date("2026-10-14T10:00:00.000Z");
const LINE = id(1);
const SUBTASK = id(11);

const names = {
  user: (value: string) => ({ [id(2)]: "Nhân Viên A" })[value],
  process: (value: string) => (value === id(80) ? "Retouch" : undefined),
  shift: () => undefined,
  timeZone: VN
};
const statuses = new Map([
  [id(41), { color: "amber" as const }],
  [id(42), { color: "red" as const }]
]);
const lineOf = new Map([[SUBTASK, LINE]]);

const log = (n: number, extra: Partial<TaskLog>): TaskLog => ({
  id: id(100 + n),
  taskId: LINE,
  taskNumber: 1210,
  taskCode: "1210",
  user: { id: id(3), displayName: "Kiểm Tra B", email: null, avatarUrl: null },
  action: "STATUS",
  fromValue: null,
  toValue: null,
  note: null,
  createdAt: "2026-10-14T09:30:00.000Z",
  ...extra
});

const renderList = (logs: TaskLog[], onOpenTask = vi.fn()) => {
  render(
    <JobLogList
      logs={logs}
      names={names}
      statuses={statuses}
      lineOf={lineOf}
      onOpenTask={onOpenTask}
      now={NOW}
    />
  );
  return onOpenTask;
};

afterEach(cleanup);

describe("JobLogList (job page Nhật ký, PD-044)", () => {
  it("shows who moved which line from → to with status chips and the QC's reason", () => {
    const onOpen = renderList([
      log(1, {
        fromValue: { statusId: id(41), code: "WAITING_QC", name: "Chờ QC" },
        toValue: { statusId: id(42), code: "REWORK", name: "Cần sửa lại", qcFail: true },
        note: "Viền tóc chưa sạch"
      })
    ]);
    const row = screen.getByRole("listitem");
    expect(row.textContent).toContain("Kiểm Tra B yêu cầu sửa lại #1210");
    expect(row.textContent).toContain("Chờ QC");
    expect(row.textContent).toContain("Cần sửa lại");
    expect(screen.getByText("“Viền tóc chưa sạch”")).toBeTruthy();
    expect(screen.getByText("30 phút trước")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "#1210" }));
    expect(onOpen).toHaveBeenCalledWith(LINE);
  });

  it("words subtasks and quantity requests with their reasons", () => {
    renderList([
      log(2, {
        action: "SUBTASK",
        user: { id: id(2), displayName: "Nhân Viên A", email: null, avatarUrl: null },
        toValue: {
          op: "created",
          subtaskId: SUBTASK,
          subtaskNumber: 1301,
          subtaskCode: "1210a",
          processId: id(81),
          processName: "Mannequin Retouch",
          qtyAssigned: 3,
          parentQtyAssigned: 7
        },
        note: "Ảnh cần ghép nền"
      }),
      log(3, {
        action: "QTY_REQUEST",
        user: { id: id(2), displayName: "Nhân Viên A", email: null, avatarUrl: null },
        toValue: { op: "requested", requestId: id(60), fromQty: 10, toQty: 12 },
        note: "Khách gửi thêm 2 ảnh"
      }),
      log(4, {
        action: "QTY_REQUEST",
        user: { id: id(5), displayName: "Trưởng Nhóm C", email: null, avatarUrl: null },
        toValue: { op: "rejected", requestId: id(60), fromQty: 10, toQty: 12 },
        note: "Giữ 10 tấm"
      })
    ]);
    const rows = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
    expect(rows[0]).toContain(
      "Nhân Viên A đã tạo subtask #1210a · Mannequin Retouch · 3 tấm từ task #1210 (task còn 7 tấm)"
    );
    expect(rows[0]).toContain("“Ảnh cần ghép nền”");
    expect(rows[1]).toContain("Nhân Viên A đề nghị sửa số tấm giao #1210: 10 → 12 tấm");
    expect(rows[1]).toContain("“Khách gửi thêm 2 ảnh”");
    expect(rows[2]).toContain("Trưởng Nhóm C đã từ chối đề nghị sửa số tấm giao #1210: 10 → 12 tấm");
  });

  it("opens the line from a subtask's own row, and not a deleted line", () => {
    const onOpen = renderList([
      log(5, {
        taskId: SUBTASK,
        taskNumber: 1301,
        taskCode: "1210a",
        action: "QTY",
        fromValue: { qtyDone: 3 },
        toValue: { qtyDone: 2 }
      }),
      log(6, {
        taskId: id(9),
        taskNumber: 1299,
        taskCode: "1299",
        action: "DELETE",
        fromValue: { assigneeId: id(2), qtyAssigned: 4 },
        toValue: { reversedEntries: 0 },
        user: null
      })
    ]);
    fireEvent.click(screen.getByRole("button", { name: "#1210a" }));
    expect(onOpen).toHaveBeenCalledWith(LINE);
    expect(screen.queryByRole("button", { name: "#1299" })).toBeNull();
    expect(screen.getAllByRole("listitem")[1]?.textContent).toContain(
      "Hệ thống đã xoá task #1299 của Nhân Viên A · 4 tấm"
    );
  });

  it("shows the old and the new Link chia việc, a long one shortened with the full value as tooltip (PD-045)", () => {
    const long = `//nas/VD JOB-1/${"thu-muc-".repeat(8)}Batch 2`;
    renderList([
      log(7, {
        action: "FIELD",
        user: { id: id(5), displayName: "Người A", email: null, avatarUrl: null },
        fromValue: { workLink: "//old/path" },
        toValue: { workLink: long }
      })
    ]);
    const row = screen.getByRole("listitem");
    expect(row.textContent).toContain("Người A sửa #1210: link chia việc “//old/path” → “//nas/VD");
    expect(row.textContent).toContain("…");
    expect(screen.getByTitle(long).textContent).toMatch(/Batch 2”$/);
  });
});
