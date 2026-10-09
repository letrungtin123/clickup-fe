import { describe, expect, it } from "vitest";

import type { Activity } from "@/contracts/work";

import { describeActivity, sentenceText } from "./activity";

const activity = (action: string, previousValue: Activity["previousValue"] = null, newValue: Activity["newValue"] = null): Activity => ({
  id: "00000000-0000-4000-8000-000000000001",
  taskId: "00000000-0000-4000-8000-000000000002",
  actor: null,
  action,
  previousValue,
  newValue,
  createdAt: "2026-10-09T08:00:00.000Z"
});

const say = (input: Activity, context = {}) => sentenceText(describeActivity(input, context), (iso) => iso.slice(0, 10));

describe("describeActivity", () => {
  it("renders creation, titles and descriptions", () => {
    expect(say(activity("TASK_CREATED", null, { title: "A", statusName: "To do" }))).toBe("đã tạo công việc ở trạng thái To do");
    expect(say(activity("TASK_TITLE_CHANGED", { title: "Cũ" }, { title: "Mới" }))).toBe("đã đổi tên Cũ thành Mới");
    expect(say(activity("TASK_DESCRIPTION_CHANGED"))).toBe("đã cập nhật mô tả");
  });

  it("renders status changes with colored chips", () => {
    const sentence = describeActivity(
      activity("TASK_STATUS_CHANGED", { name: "To do", color: "slate" }, { name: "Done", color: "green" })
    );
    expect(sentence.parts.filter((part) => part.kind === "status")).toEqual([
      { kind: "status", name: "To do", color: "slate" },
      { kind: "status", name: "Done", color: "green" }
    ]);
    expect(say(activity("TASK_STATUS_CHANGED", { name: "Doing" }, { name: "QA", reason: "workflow_changed" }))).toBe(
      "đã đổi quy trình trạng thái: Doing → QA"
    );
  });

  it("explains reopen after reassignment", () => {
    expect(say(activity("TASK_REOPENED", { name: "Done" }, { name: "To do", reason: "reassigned" }))).toBe(
      "đã giao lại việc đã xong nên công việc được mở lại → To do"
    );
  });

  it("renders priority and date changes", () => {
    expect(say(activity("TASK_PRIORITY_CHANGED", { priority: "low" }, { priority: "urgent" }))).toBe("đã đổi mức ưu tiên Thấp → Khẩn cấp");
    expect(say(activity("TASK_DUE_DATE_CHANGED", { dueAt: null }, { dueAt: "2026-10-12T10:00:00.000Z" }))).toBe("đã đặt hạn chót 2026-10-12");
    expect(say(activity("TASK_DUE_DATE_CHANGED", { dueAt: "2026-10-12T10:00:00.000Z" }, { dueAt: null }))).toBe("đã xóa hạn chót 2026-10-12");
    expect(
      say(activity("TASK_START_DATE_CHANGED", { startAt: "2026-10-01T00:00:00.000Z" }, { startAt: "2026-10-03T00:00:00.000Z" }))
    ).toBe("đã đổi ngày bắt đầu 2026-10-01 → 2026-10-03");
  });

  it("resolves assignees when the event names them, otherwise stays generic", () => {
    const userId = "abd2e594-6195-41d0-8be0-c8284c8de186";
    expect(say(activity("TASK_ASSIGNEE_ADDED"))).toBe("đã thêm một người thực hiện");
    expect(say(activity("TASK_ASSIGNEE_ADDED", null, { userId }), { resolveUser: () => "Minh Nguyễn" })).toBe(
      "đã giao việc cho Minh Nguyễn"
    );
    expect(say(activity("TASK_ASSIGNEE_REMOVED", { user: { id: userId, displayName: "An" } }))).toBe(
      "đã gỡ An khỏi người thực hiện"
    );
  });

  it("renders moves, files, trash and unknown actions", () => {
    const names: Record<string, string> = { l1: "Backlog", l2: "Sprint" };
    expect(
      say(activity("TASK_MOVED", { listId: "l1", parentTaskId: null }, { listId: "l2", parentTaskId: null }), {
        resolveList: (id: string) => names[id]
      })
    ).toBe("đã chuyển từ danh sách Backlog sang Sprint");
    expect(say(activity("TASK_MOVED", { listId: "l1", parentTaskId: "p" }, { listId: "l1", parentTaskId: null }))).toBe(
      "đã tách thành công việc độc lập"
    );
    expect(say(activity("TASK_ATTACHMENT_ADDED", null, { fileName: "spec.pdf" }))).toBe("đã đính kèm spec.pdf");
    expect(say(activity("TASK_ATTACHMENT_REMOVED", { fileName: "spec.pdf" }))).toBe("đã gỡ tệp spec.pdf");
    expect(say(activity("TASK_DELETED", null, { subtaskCount: 2 }))).toBe("đã chuyển công việc và 2 việc con vào thùng rác");
    expect(say(activity("TASK_RESTORED"))).toBe("đã khôi phục công việc từ thùng rác");
    expect(say(activity("SOMETHING_NEW"))).toBe("đã cập nhật công việc");
  });
});
