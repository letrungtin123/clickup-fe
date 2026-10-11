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
    expect(sentenceText(failed)).toBe("Leader Mẫu đánh giá VD JOB-1 #3 không đạt QC");
    expect(failed.excerpt).toBe("Còn bụi");
    expect(failed.tone).toBe("danger");
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
