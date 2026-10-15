import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  AlarmClock,
  AtSign,
  Bell,
  CircleCheckBig,
  FolderPlus,
  Hash,
  MessageSquare,
  MessagesSquare,
  Reply,
  ServerCrash,
  TriangleAlert,
  UserRoundPlus,
  type LucideIcon
} from "lucide-react";

import type { Notification, NotificationType } from "@/contracts/notifications";
import type { ColorToken } from "@/contracts/work";

import { describeKnowledgeNotification, knowledgePath } from "./describe-knowledge";
import { describeProductionNotification, productionPath } from "./describe-production";
import { mentionTypeList } from "./feeds";

/**
 * Turns a notification into a Vietnamese sentence (product §30), e.g.
 *   "Linh đã giao cho bạn WEB-12", "WEB-101 sắp đến hạn lúc 17:00, 10/10",
 *   "Minh đã nhắc đến bạn trong #thiết-kế".
 * Rendering is split into segments so the actor / target can be emphasised.
 */
export type SentenceSegment = {
  text: string;
  strong?: boolean;
  /** Shown as a chip of this colour (e.g. the job statuses of a status change, PD-045). */
  color?: ColorToken;
};

export type NotificationDescription = {
  segments: SentenceSegment[];
  /** Subject line under the sentence (task title, project name); null when the sentence says it all. */
  subject: string | null;
  excerpt: string | null;
  icon: LucideIcon;
  /** Accent for the type icon. */
  tone: "brand" | "warning" | "danger" | "success" | "muted";
};

const str = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);

const isDirect = (notification: Notification) => {
  const kind = str(notification.payload.channelKind);
  return kind === "dm" || kind === "group_dm";
};

const channelTarget = (notification: Notification): SentenceSegment[] =>
  isDirect(notification)
    ? [{ text: "tin nhắn trực tiếp" }]
    : [{ text: `#${notification.title}`, strong: true }];

const taskKeyOf = (notification: Notification) =>
  notification.target.taskKey ?? str(notification.payload.taskKey) ?? "công việc";

const formatDue = (value: unknown) => {
  const raw = str(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : format(date, "HH:mm, dd/MM", { locale: vi });
};

export const describeNotification = (notification: Notification): NotificationDescription => {
  const actor: SentenceSegment = {
    text: notification.actor?.displayName ?? "Ai đó",
    strong: true
  };
  const key: SentenceSegment = { text: taskKeyOf(notification), strong: true };
  const excerpt = notification.body?.trim() ? notification.body.trim() : null;
  const type: NotificationType = notification.type;

  if (type.startsWith("production.")) {
    const production = describeProductionNotification(notification);
    if (production) return production;
  }
  if (type.startsWith("knowledge.")) {
    const knowledge = describeKnowledgeNotification(notification);
    if (knowledge) return knowledge;
  }

  switch (type) {
    case "task.assigned":
      return {
        segments: [
          actor,
          {
            text:
              notification.payload.reopened === true
                ? " đã mở lại và giao cho bạn "
                : " đã giao cho bạn "
          },
          key
        ],
        subject: notification.title,
        excerpt,
        icon: UserRoundPlus,
        tone: "brand"
      };
    case "task.mentioned":
      return {
        segments: [actor, { text: " đã nhắc đến bạn trong " }, key],
        subject: notification.title,
        excerpt,
        icon: AtSign,
        tone: "brand"
      };
    case "task.commented":
      return {
        segments: [actor, { text: " đã bình luận trong " }, key],
        subject: notification.title,
        excerpt,
        icon: MessageSquare,
        tone: "muted"
      };
    case "task.replied":
      return {
        segments: [actor, { text: " đã trả lời bình luận của bạn trong " }, key],
        subject: notification.title,
        excerpt,
        icon: Reply,
        tone: "muted"
      };
    case "task.status_changed": {
      const status = str(notification.payload.statusName);
      const done = notification.payload.isDone === true;
      return {
        segments: done
          ? [actor, { text: " đã hoàn thành " }, key]
          : status
            ? [
                actor,
                { text: " đã chuyển " },
                key,
                { text: " sang " },
                { text: status, strong: true }
              ]
            : [actor, { text: " đã đổi trạng thái " }, key],
        subject: notification.title,
        excerpt: null,
        icon: CircleCheckBig,
        tone: done ? "success" : "muted"
      };
    }
    case "task.due_soon": {
      const due = formatDue(notification.payload.dueAt);
      return {
        segments: [key, { text: due ? ` sắp đến hạn lúc ${due}` : " sắp đến hạn" }],
        subject: notification.title,
        excerpt: null,
        icon: AlarmClock,
        tone: "warning"
      };
    }
    case "task.overdue": {
      const due = formatDue(notification.payload.dueAt);
      return {
        segments: [key, { text: due ? ` đã quá hạn (hạn ${due})` : " đã quá hạn" }],
        subject: notification.title,
        excerpt: null,
        icon: TriangleAlert,
        tone: "danger"
      };
    }
    case "project.member_added":
      return {
        segments: [
          actor,
          { text: " đã thêm bạn vào dự án " },
          { text: str(notification.payload.projectName) ?? notification.title, strong: true }
        ],
        subject: null,
        excerpt: null,
        icon: FolderPlus,
        tone: "brand"
      };
    case "chat.mentioned":
      return {
        segments: [actor, { text: " đã nhắc đến bạn trong " }, ...channelTarget(notification)],
        subject: null,
        excerpt,
        icon: AtSign,
        tone: "brand"
      };
    case "chat.thread_replied":
      return {
        segments: [
          actor,
          { text: " đã trả lời chuỗi tin nhắn bạn tham gia trong " },
          ...channelTarget(notification)
        ],
        subject: null,
        excerpt,
        icon: MessagesSquare,
        tone: "muted"
      };
    case "channel.member_added":
      return {
        segments: isDirect(notification)
          ? [actor, { text: " đã bắt đầu cuộc trò chuyện với bạn" }]
          : [
              actor,
              { text: " đã thêm bạn vào kênh " },
              { text: `#${notification.title}`, strong: true }
            ],
        subject: null,
        excerpt: null,
        icon: Hash,
        tone: "brand"
      };
    case "system.dead_letter": {
      // Ops alert to admins: a worker queue parked messages it could not process ({ queue, count }).
      const queue = str(notification.payload.queue);
      const count = notification.payload.count;
      return {
        segments: [
          { text: "Có " },
          {
            text: typeof count === "number" && Number.isFinite(count) ? `${count} thông báo/email` : "thông báo/email",
            strong: true
          },
          { text: " gửi lỗi trong hàng đợi" },
          ...(queue ? [{ text: " " }, { text: queue, strong: true }] : [])
        ],
        subject: null,
        excerpt,
        icon: ServerCrash,
        tone: "danger"
      };
    }
    default:
      // Types without a dedicated sentence yet (e.g. a module adding new types): never crash the
      // inbox — show the server-provided title until a specific case is added above.
      return {
        segments:
          notification.actor && notification.title && notification.title !== actor.text
            ? [actor, { text: ` · ${notification.title}` }]
            : [{ text: notification.title || actor.text, strong: Boolean(notification.actor) }],
        subject: null,
        excerpt,
        icon: Bell,
        tone: "muted"
      };
  }
};

export const sentenceText = (description: NotificationDescription) =>
  description.segments.map((segment) => segment.text).join("");

/** Types shown under the "Nhắc đến" tab (the inbox asks the server for exactly these). */
export const mentionTypes: ReadonlySet<NotificationType> = new Set(mentionTypeList);

/**
 * Where a notification leads. Tasks open in the detail panel on top of the current page
 * (`?task=<id>` works on every route); chat targets open the conversation at the message.
 */
export type NotificationTarget =
  { kind: "task"; taskId: string } | { kind: "path"; path: string } | { kind: "none" };

export const notificationTarget = (notification: Notification): NotificationTarget => {
  const { target } = notification;
  if (notification.type.startsWith("production.")) {
    const path = productionPath(notification);
    return path ? { kind: "path", path } : { kind: "none" };
  }
  if (notification.type.startsWith("knowledge.")) {
    const path = knowledgePath(notification);
    return path ? { kind: "path", path } : { kind: "none" };
  }
  if (notification.type.startsWith("task.") && target.taskId) {
    return { kind: "task", taskId: target.taskId };
  }
  if (notification.type === "project.member_added" && target.projectId) {
    return { kind: "path", path: `/p/${target.projectId}` };
  }
  if (target.channelId) {
    const params = new URLSearchParams();
    const threadRootId = str(notification.payload.threadRootId);
    if (threadRootId) params.set("thread", threadRootId);
    if (target.messageId) params.set("message", target.messageId);
    const query = params.toString();
    return { kind: "path", path: `/c/${target.channelId}${query ? `?${query}` : ""}` };
  }
  return { kind: "none" };
};
