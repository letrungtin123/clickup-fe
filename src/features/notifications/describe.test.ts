import { describe, expect, it } from "vitest";

import type { Notification } from "@/contracts/notifications";

import { describeNotification, notificationTarget, sentenceText } from "./describe";
import { groupByDay } from "./group";

const actor = {
  id: "00000000-0000-4000-8000-00000000000a",
  displayName: "Minh Nguyễn",
  email: null,
  avatarUrl: null
};

const make = (overrides: Partial<Notification>): Notification => ({
  id: "00000000-0000-4000-8000-000000000001",
  type: "task.assigned",
  actor,
  title: "Thiết kế màn hình đăng nhập",
  body: null,
  target: {
    projectId: "00000000-0000-4000-8000-0000000000a1",
    taskId: "00000000-0000-4000-8000-0000000000b1",
    taskKey: "WEB-12",
    commentId: null,
    channelId: null,
    messageId: null,
    productionTaskId: null,
    jobId: null
  },
  payload: {},
  createdAt: "2026-10-09T08:00:00.000Z",
  readAt: null,
  ...overrides
});

const sentence = (notification: Notification) => sentenceText(describeNotification(notification));

describe("notification sentences", () => {
  it("describes task notifications with actor and task key", () => {
    expect(sentence(make({ type: "task.assigned" }))).toBe("Minh Nguyễn đã giao cho bạn WEB-12");
    expect(sentence(make({ type: "task.assigned", payload: { reopened: true } }))).toBe(
      "Minh Nguyễn đã mở lại và giao cho bạn WEB-12"
    );
    expect(sentence(make({ type: "task.mentioned" }))).toBe(
      "Minh Nguyễn đã nhắc đến bạn trong WEB-12"
    );
    expect(sentence(make({ type: "task.commented" }))).toBe(
      "Minh Nguyễn đã bình luận trong WEB-12"
    );
    expect(sentence(make({ type: "task.replied" }))).toBe(
      "Minh Nguyễn đã trả lời bình luận của bạn trong WEB-12"
    );
    expect(
      sentence(make({ type: "task.status_changed", payload: { statusName: "Đang làm" } }))
    ).toBe("Minh Nguyễn đã chuyển WEB-12 sang Đang làm");
    expect(sentence(make({ type: "task.status_changed", payload: { isDone: true } }))).toBe(
      "Minh Nguyễn đã hoàn thành WEB-12"
    );
  });

  it("describes deadlines without an actor", () => {
    const soon = make({
      type: "task.due_soon",
      actor: null,
      payload: { dueAt: "2026-10-10T10:00:00Z" }
    });
    expect(sentence(soon)).toMatch(/^WEB-12 sắp đến hạn lúc \d{2}:\d{2}, 10\/10$/);
    expect(sentence(make({ type: "task.overdue", actor: null, payload: {} }))).toBe(
      "WEB-12 đã quá hạn"
    );
    expect(describeNotification(soon).tone).toBe("warning");
  });

  it("describes chat notifications for channels and DMs", () => {
    const base = {
      target: {
        projectId: null,
        taskId: null,
        taskKey: null,
        commentId: null,
        channelId: "00000000-0000-4000-8000-0000000000c1",
        messageId: "00000000-0000-4000-8000-0000000000d1",
        productionTaskId: null,
        jobId: null
      },
      title: "thiết-kế",
      body: "@Linh xem giúp nhé"
    };
    expect(
      sentence(make({ ...base, type: "chat.mentioned", payload: { channelKind: "public" } }))
    ).toBe("Minh Nguyễn đã nhắc đến bạn trong #thiết-kế");
    expect(
      sentence(make({ ...base, type: "chat.mentioned", payload: { channelKind: "dm" } }))
    ).toBe("Minh Nguyễn đã nhắc đến bạn trong tin nhắn trực tiếp");
    expect(describeNotification(make({ ...base, type: "chat.mentioned" })).excerpt).toBe(
      "@Linh xem giúp nhé"
    );
    expect(
      sentence(make({ ...base, type: "channel.member_added", payload: { channelKind: "private" } }))
    ).toBe("Minh Nguyễn đã thêm bạn vào kênh #thiết-kế");
  });

  it("falls back to 'Ai đó' when the actor is unknown", () => {
    expect(
      sentence(make({ type: "project.member_added", actor: null, payload: { projectName: "Web" } }))
    ).toBe("Ai đó đã thêm bạn vào dự án Web");
  });
});

describe("notification targets", () => {
  it("opens tasks in the detail panel and chat at the message (thread aware)", () => {
    expect(notificationTarget(make({ type: "task.commented" }))).toEqual({
      kind: "task",
      taskId: "00000000-0000-4000-8000-0000000000b1"
    });
    const chat = make({
      type: "chat.thread_replied",
      payload: { threadRootId: "00000000-0000-4000-8000-0000000000e1" },
      target: {
        projectId: null,
        taskId: null,
        taskKey: null,
        commentId: null,
        channelId: "00000000-0000-4000-8000-0000000000c1",
        messageId: "00000000-0000-4000-8000-0000000000d1",
        productionTaskId: null,
        jobId: null
      }
    });
    expect(notificationTarget(chat)).toEqual({
      kind: "path",
      path: "/c/00000000-0000-4000-8000-0000000000c1?thread=00000000-0000-4000-8000-0000000000e1&message=00000000-0000-4000-8000-0000000000d1"
    });
  });

  it("groups by calendar day, newest first", () => {
    const groups = groupByDay(
      [
        make({ id: "1", createdAt: "2026-10-09T10:00:00" }),
        make({ id: "2", createdAt: "2026-10-09T08:00:00" }),
        make({ id: "3", createdAt: "2026-10-07T08:00:00" })
      ],
      new Date("2026-10-09T12:00:00")
    );
    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ["Hôm nay", 2],
      ["Thứ Tư, 7 tháng 10", 1]
    ]);
  });
});
