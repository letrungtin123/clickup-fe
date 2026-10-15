import { describe, expect, it } from "vitest";

import type { Notification } from "@/contracts/notifications";

import { describeNotification, mentionTypes, notificationTarget, sentenceText } from "./describe";

// Obviously fake ids and codes (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const make = (overrides: Partial<Notification>): Notification => ({
  id: id(1),
  type: "production.task_assigned",
  actor: { id: id(2), displayName: "Leader Mẫu", email: null, avatarUrl: null },
  title: "VD JOB-1",
  body: null,
  target: {
    projectId: null,
    taskId: null,
    taskKey: null,
    commentId: null,
    channelId: null,
    messageId: null,
    productionTaskId: id(10),
    jobId: id(20),
    knowledgeSpaceId: null,
    knowledgeItemId: null
  },
  payload: {
    jobCode: "VD JOB-1",
    taskNumber: 3,
    processName: "Retouch",
    qty: 5,
    deadline: "2026-10-09T10:30:00.000Z"
  },
  department: null,
  createdAt: "2026-10-09T08:00:00.000Z",
  readAt: null,
  ...overrides
});

describe("production notifications", () => {
  it("words task events as Vietnamese sentences", () => {
    expect(sentenceText(describeNotification(make({})))).toBe(
      "Leader Mẫu đã giao cho bạn task VD JOB-1 #3"
    );
    expect(describeNotification(make({})).subject).toBe("Retouch · 5 tấm");
    expect(sentenceText(describeNotification(make({ type: "production.task_waiting_qc" })))).toBe(
      "Task VD JOB-1 #3 đang chờ bạn QC"
    );
    expect(
      sentenceText(describeNotification(make({ type: "production.task_due_soon", actor: null })))
    ).toBe("Task VD JOB-1 #3 sắp đến hạn lúc 17:30, 09/10");
    const failed = describeNotification(
      make({
        type: "production.qc_failed",
        payload: { jobCode: "VD JOB-1", taskNumber: 3, note: "Còn bụi" }
      })
    );
    expect(sentenceText(failed)).toBe("Leader Mẫu yêu cầu sửa lại task VD JOB-1 #3");
    expect(failed.excerpt).toBe("Còn bụi");
    expect(failed.tone).toBe("danger");
    expect(
      sentenceText(describeNotification(make({ type: "production.task_checked", actor: null })))
    ).toBe("Task VD JOB-1 #3 đã qua QC (Đã check)");
  });

  it("words quantity change requests and their decisions (PD-044)", () => {
    const task = { jobCode: "VD JOB-1", taskNumber: 3, processName: "Retouch", qty: 10 };
    const requested = describeNotification(
      make({
        type: "production.qty_change_requested",
        payload: { ...task, requestId: id(30), fromQty: 10, toQty: 12, reason: "Thêm 2 ảnh góc" }
      })
    );
    expect(sentenceText(requested)).toBe(
      "Leader Mẫu đề nghị sửa số tấm giao của task VD JOB-1 #3: 10 → 12"
    );
    expect(requested.excerpt).toBe("Thêm 2 ảnh góc");
    expect(requested.tone).toBe("warning");
    expect(requested.subject).toBe("Retouch · 10 tấm");

    const approved = describeNotification(
      make({
        type: "production.qty_change_decided",
        payload: { ...task, requestId: id(30), fromQty: 10, toQty: 12, approved: true, decisionNote: "OK" }
      })
    );
    expect(sentenceText(approved)).toBe(
      "Leader Mẫu đã duyệt đề nghị sửa số tấm của task VD JOB-1 #3: 10 → 12"
    );
    expect(approved.excerpt).toBe("OK");
    expect(approved.tone).toBe("success");

    const rejected = describeNotification(
      make({
        type: "production.qty_change_decided",
        payload: { ...task, fromQty: 10, toQty: 12, approved: false, decisionNote: "Giữ 10 tấm" }
      })
    );
    expect(sentenceText(rejected)).toBe(
      "Leader Mẫu đã từ chối đề nghị sửa số tấm của task VD JOB-1 #3: 10 → 12"
    );
    expect(rejected.excerpt).toBe("Giữ 10 tấm");
    expect(rejected.tone).toBe("danger");

    // A payload without numbers still reads, without the change.
    expect(
      sentenceText(
        describeNotification(
          make({ type: "production.qty_change_requested", payload: { jobCode: "VD JOB-1", taskNumber: 3 } })
        )
      )
    ).toBe("Leader Mẫu đề nghị sửa số tấm giao của task VD JOB-1 #3");
    // Both open the line.
    expect(notificationTarget(make({ type: "production.qty_change_decided", payload: task }))).toEqual({
      kind: "path",
      path: `/production/tasks/${id(10)}`
    });
  });

  it("words quantity changes, feedback and comments", () => {
    expect(
      sentenceText(
        describeNotification(
          make({
            type: "production.qty_changed",
            payload: { jobCode: "VD JOB-1", taskNumber: 3, from: 5, to: 4 }
          })
        )
      )
    ).toBe("Leader Mẫu đã sửa số tấm của VD JOB-1 #3: 5 → 4 tấm");
    expect(
      sentenceText(
        describeNotification(
          make({
            type: "production.feedback",
            payload: { jobCode: "VD JOB-1", feedbackType: "EXTRA" }
          })
        )
      )
    ).toBe("Khách phản hồi yêu cầu thêm cho job VD JOB-1");
    expect(
      sentenceText(
        describeNotification(
          make({ type: "production.commented", payload: { jobCode: "VD JOB-1" } })
        )
      )
    ).toBe("Leader Mẫu đã bình luận trong job VD JOB-1");
    expect(mentionTypes.has("production.mentioned")).toBe(true);
  });

  it("names a task by its code (PD-045), the number on older notifications", () => {
    const subtask = make({
      payload: { jobCode: "VD JOB-1", taskCode: "1216a", taskNumber: 1301, processName: "Retouch" }
    });
    expect(sentenceText(describeNotification(subtask))).toBe(
      "Leader Mẫu đã giao cho bạn task VD JOB-1 #1216a"
    );
    expect(
      sentenceText(
        describeNotification(
          make({
            type: "production.mentioned",
            payload: { jobCode: "VD JOB-1", taskCode: "1216" }
          })
        )
      )
    ).toBe("Leader Mẫu đã nhắc đến bạn trong VD JOB-1 #1216");
  });

  it("words a job status change with coloured from → to chips and opens the job (PD-045)", () => {
    const changed = make({
      type: "production.job_status_changed",
      title: "VD JOB-1",
      target: { ...make({}).target, productionTaskId: null, jobId: id(20) },
      payload: {
        jobId: id(20),
        jobCode: "VD JOB-1",
        jobName: "Lô thử",
        from: { id: id(70), name: "Đang làm", color: "blue" },
        to: { id: id(71), name: "Đã xong", color: "green" }
      }
    });
    const description = describeNotification(changed);
    expect(sentenceText(description)).toBe(
      "Leader Mẫu đổi trạng thái job VD JOB-1: Đang làm → Đã xong"
    );
    expect(description.tone).toBe("brand");
    expect(description.subject).toBe("Lô thử");
    expect(description.segments.filter((segment) => segment.color)).toEqual([
      { text: "Đang làm", strong: true, color: "blue" },
      { text: "Đã xong", strong: true, color: "green" }
    ]);
    expect(notificationTarget(changed)).toEqual({
      kind: "path",
      path: `/production/jobs/${id(20)}`
    });
    // An unknown colour (or a malformed payload) still reads, as plain text.
    const odd = describeNotification(
      make({
        type: "production.job_status_changed",
        payload: { jobCode: "VD JOB-1", from: { name: "A", color: "neon" }, to: null }
      })
    );
    expect(sentenceText(odd)).toBe("Leader Mẫu đổi trạng thái job VD JOB-1: A → ?");
    expect(odd.segments.some((segment) => segment.color)).toBe(false);
  });

  it("opens the task page, the job page, leave and scores", () => {
    expect(notificationTarget(make({}))).toEqual({
      kind: "path",
      path: `/production/tasks/${id(10)}`
    });
    expect(
      notificationTarget(
        make({
          type: "production.feedback",
          target: { ...make({}).target, productionTaskId: null }
        })
      )
    ).toEqual({ kind: "path", path: `/production/jobs/${id(20)}` });
    const bare = { ...make({}).target, productionTaskId: null, jobId: null };
    expect(
      notificationTarget(
        make({ type: "production.leave_decided", target: bare, payload: { status: "APPROVED" } })
      )
    ).toEqual({
      kind: "path",
      path: "/production/leave?tab=mine"
    });
    expect(
      notificationTarget(
        make({ type: "production.leave_requested", target: bare, payload: { days: 1 } })
      )
    ).toEqual({
      kind: "path",
      path: "/production/leave?tab=pending"
    });
    expect(
      notificationTarget(
        make({ type: "production.kpi_settled", target: bare, payload: { period: "2026-10" } })
      )
    ).toEqual({
      kind: "path",
      path: "/production/scores"
    });
  });
});
