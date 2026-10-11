import { describe, expect, it } from "vitest";

import type { Notification } from "@/contracts/notifications";

import { describeNotification, mentionTypes, notificationTarget, sentenceText } from "./describe";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const space = id(10);
const item = id(20);

const make = (type: Notification["type"], payload: Record<string, unknown> = {}, target: Partial<Notification["target"]> = {}): Notification => ({
  id: id(1),
  type,
  actor: { id: id(2), displayName: "Linh Trần", email: null, avatarUrl: null },
  title: "Quy trình retouch",
  body: "Bước 3 cần sửa",
  target: {
    projectId: null,
    taskId: null,
    taskKey: null,
    commentId: null,
    channelId: null,
    messageId: null,
    productionTaskId: null,
    jobId: null,
    knowledgeSpaceId: space,
    knowledgeItemId: item,
    ...target
  },
  payload: { spaceName: "Quy trình Sản xuất", importance: "normal", ...payload },
  createdAt: "2026-10-11T08:00:00.000Z",
  readAt: null
});

const sentence = (notification: Notification) => sentenceText(describeNotification(notification));

describe("knowledge notifications", () => {
  it("describes every knowledge type in Vietnamese with the space as subject", () => {
    expect(sentence(make("knowledge.mentioned", { source: "comment" }))).toBe("Linh Trần đã nhắc đến bạn trong bình luận ở Quy trình retouch");
    expect(sentence(make("knowledge.mentioned", { source: "body" }))).toBe("Linh Trần đã nhắc đến bạn trong Quy trình retouch");
    expect(sentence(make("knowledge.commented"))).toBe("Linh Trần đã bình luận trong Quy trình retouch");
    expect(sentence(make("knowledge.replied"))).toBe("Linh Trần đã trả lời bình luận của bạn trong Quy trình retouch");
    expect(sentence(make("knowledge.updated", { newVersion: 4 }))).toBe("Linh Trần đã lưu phiên bản mới của Quy trình retouch (v4)");
    expect(sentence(make("knowledge.updated", { published: true }))).toBe("Linh Trần đã ban hành Quy trình retouch");
    expect(sentence(make("knowledge.status_changed", { statusName: "Hết hiệu lực", statusGroup: "retired" }))).toBe(
      "Linh Trần đã chuyển Quy trình retouch sang Hết hiệu lực"
    );
    expect(sentence(make("knowledge.approval_requested", { statusName: "Chờ duyệt" }))).toBe("Linh Trần gửi duyệt Quy trình retouch (Chờ duyệt)");
    expect(describeNotification(make("knowledge.commented")).subject).toBe("Kho Quy trình Sản xuất");
    expect(describeNotification(make("knowledge.commented")).excerpt).toBe("Bước 3 cần sửa");
  });

  it("flags new versions of critical items", () => {
    const description = describeNotification(make("knowledge.updated", { importance: "critical", criticalVersion: true, version: 7 }));
    expect(description.tone).toBe("warning");
    expect(description.subject).toBe("Kho Quy trình Sản xuất · Rất quan trọng");
  });

  it("links to the item page (comments tab for comments, history for new versions)", () => {
    expect(notificationTarget(make("knowledge.status_changed"))).toEqual({ kind: "path", path: `/k/${space}/i/${item}` });
    expect(notificationTarget(make("knowledge.mentioned", {}, { commentId: id(30) }))).toEqual({
      kind: "path",
      path: `/k/${space}/i/${item}?tab=comments&comment=${id(30)}`
    });
    expect(notificationTarget(make("knowledge.replied"))).toEqual({ kind: "path", path: `/k/${space}/i/${item}?tab=comments` });
    expect(notificationTarget(make("knowledge.updated", { newVersion: 3 }))).toEqual({ kind: "path", path: `/k/${space}/i/${item}?tab=history` });
    expect(notificationTarget(make("knowledge.updated", {}, { knowledgeSpaceId: null, knowledgeItemId: null }))).toEqual({ kind: "none" });
  });

  it("lists knowledge mentions under Nhắc đến", () => {
    expect(mentionTypes.has("knowledge.mentioned")).toBe(true);
  });
});
