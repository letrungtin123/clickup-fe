import { describe, expect, it } from "vitest";

import type { Notification } from "@/contracts/notifications";

import { describeNotification, notificationTarget, sentenceText } from "./describe";

// Obviously fake ids, names and codes (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const make = (overrides: Partial<Notification>): Notification => ({
  id: id(1),
  type: "production.leader_removed",
  actor: { id: id(2), displayName: "Quản trị Mẫu", email: null, avatarUrl: null },
  title: "Leader Mẫu",
  body: "Còn dẫn 3 job chưa xong: VD JOB-1, VD JOB-2, VD JOB-3. Hãy giao các job này cho Leader khác.",
  target: {
    projectId: null,
    taskId: null,
    taskKey: null,
    commentId: null,
    channelId: null,
    messageId: null,
    productionTaskId: null,
    jobId: null
  },
  payload: {
    userId: id(3),
    userName: "Leader Mẫu",
    reason: "role_removed",
    jobCount: 3,
    jobs: [
      { id: id(11), code: "VD JOB-1" },
      { id: id(12), code: "VD JOB-2" },
      { id: id(13), code: "VD JOB-3" }
    ]
  },
  createdAt: "2026-10-11T01:00:00.000Z",
  readAt: null,
  ...overrides
});

describe("admin alerts in the inbox and the bell", () => {
  it("words a removed leader who still leads open jobs", () => {
    const description = describeNotification(make({}));
    expect(sentenceText(description)).toBe("Leader Mẫu không còn là Leader — còn 3 job cần giao Leader khác");
    expect(description.subject).toBe("VD JOB-1, VD JOB-2, VD JOB-3");
    expect(description.tone).toBe("warning");
    const disabled = describeNotification(make({ payload: { ...make({}).payload, reason: "deactivated" } }));
    expect(sentenceText(disabled)).toBe("Leader Mẫu đã bị vô hiệu hóa — còn 3 job cần giao Leader khác");
  });

  it("shortens long job lists", () => {
    const jobs = Array.from({ length: 8 }, (_, index) => ({ id: id(20 + index), code: `VD JOB-${index + 1}` }));
    const description = describeNotification(make({ payload: { userId: id(3), userName: "Leader Mẫu", jobCount: 25, jobs } }));
    expect(description.subject).toBe("VD JOB-1, VD JOB-2, VD JOB-3, VD JOB-4, VD JOB-5 và 20 job khác");
  });

  it("opens the jobs that person still leads", () => {
    expect(notificationTarget(make({}))).toEqual({ kind: "path", path: `/production/jobs?leader=${id(3)}` });
    expect(notificationTarget(make({ payload: {} }))).toEqual({ kind: "path", path: "/production/jobs" });
  });

  it("words a dead-letter alert for admins", () => {
    const alert = make({
      type: "system.dead_letter",
      actor: null,
      title: "Hàng đợi lỗi: nesso.notifications.dlq",
      body: "2 tin nhắn không xử lý được sau nhiều lần thử.",
      payload: { queue: "nesso.notifications.dlq", count: 2 }
    });
    expect(sentenceText(describeNotification(alert))).toBe(
      "Có 2 thông báo/email gửi lỗi trong hàng đợi nesso.notifications.dlq"
    );
    expect(describeNotification(alert).tone).toBe("danger");
    expect(notificationTarget(alert)).toEqual({ kind: "none" });
    expect(sentenceText(describeNotification({ ...alert, payload: {} }))).toBe("Có thông báo/email gửi lỗi trong hàng đợi");
  });
});
