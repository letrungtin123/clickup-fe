import { AtSign, BookCheck, BookOpenText, ClipboardCheck, MessageSquare, Reply, ShieldAlert } from "lucide-react";

import type { Notification } from "@/contracts/notifications";

import type { NotificationDescription, SentenceSegment } from "./describe";

/**
 * Vietnamese sentences for the knowledge base notification types (PD-031 §07). Target: knowledgeSpaceId +
 * knowledgeItemId (+ commentId); payload { spaceName, importance, source, version, newVersion, published,
 * criticalVersion, statusName, statusGroup }.
 */

const str = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (value: unknown) => (typeof value === "string" && uuidPattern.test(value) ? value : null);

const itemRef = (notification: Notification): SentenceSegment => ({ text: notification.title || "một mục tri thức", strong: true });

/** "Kho Quy trình Sản xuất" under the sentence (the item title is already in it). */
const spaceSubject = (notification: Notification) => {
  const space = str(notification.payload.spaceName);
  return space ? `Kho ${space}` : null;
};

export const describeKnowledgeNotification = (notification: Notification): NotificationDescription | null => {
  const actor: SentenceSegment = { text: notification.actor?.displayName ?? "Ai đó", strong: true };
  const excerpt = notification.body?.trim() ? notification.body.trim() : null;
  const critical = notification.payload.importance === "critical";
  const subject = spaceSubject(notification);

  switch (notification.type) {
    case "knowledge.mentioned":
      return {
        segments: [
          actor,
          { text: notification.payload.source === "comment" ? " đã nhắc đến bạn trong bình luận ở " : " đã nhắc đến bạn trong " },
          itemRef(notification)
        ],
        subject,
        excerpt,
        icon: AtSign,
        tone: "brand"
      };
    case "knowledge.commented":
      return {
        segments: [actor, { text: " đã bình luận trong " }, itemRef(notification)],
        subject,
        excerpt,
        icon: MessageSquare,
        tone: "muted"
      };
    case "knowledge.replied":
      return {
        segments: [actor, { text: " đã trả lời bình luận của bạn trong " }, itemRef(notification)],
        subject,
        excerpt,
        icon: Reply,
        tone: "muted"
      };
    case "knowledge.updated": {
      const version = num(notification.payload.newVersion) ?? num(notification.payload.version);
      if (notification.payload.published === true) {
        return {
          segments: [actor, { text: " đã ban hành " }, itemRef(notification)],
          subject,
          excerpt: null,
          icon: BookCheck,
          tone: "success"
        };
      }
      return {
        segments: [
          actor,
          { text: notification.payload.newVersion === false ? " đã cập nhật " : " đã lưu phiên bản mới của " },
          itemRef(notification),
          ...(version !== null && notification.payload.newVersion !== false ? [{ text: ` (v${version})` }] : [])
        ],
        subject: critical ? [subject, "Rất quan trọng"].filter(Boolean).join(" · ") : subject,
        excerpt: null,
        icon: critical ? ShieldAlert : BookOpenText,
        tone: critical ? "warning" : "muted"
      };
    }
    case "knowledge.status_changed": {
      const status = str(notification.payload.statusName);
      const group = str(notification.payload.statusGroup);
      return {
        segments: status
          ? [actor, { text: " đã chuyển " }, itemRef(notification), { text: " sang " }, { text: status, strong: true }]
          : [actor, { text: " đã đổi trạng thái " }, itemRef(notification)],
        subject,
        excerpt: null,
        icon: group === "active" ? BookCheck : BookOpenText,
        tone: group === "active" ? "success" : group === "retired" ? "warning" : "muted"
      };
    }
    case "knowledge.approval_requested": {
      const status = str(notification.payload.statusName);
      return {
        segments: [actor, { text: " gửi duyệt " }, itemRef(notification), ...(status ? [{ text: ` (${status})` }] : [])],
        subject,
        excerpt: null,
        icon: ClipboardCheck,
        tone: "warning"
      };
    }
    default:
      return null;
  }
};

/** /k/<space>/i/<item> — comments open the "Bình luận" tab at the comment. */
export const knowledgePath = (notification: Notification) => {
  // Payload ids are only trusted as UUIDs (anything else would be pasted into the path / query).
  const spaceId = uuidOrNull(notification.target.knowledgeSpaceId ?? notification.payload.knowledgeSpaceId);
  const itemId = uuidOrNull(notification.target.knowledgeItemId ?? notification.payload.knowledgeItemId);
  if (!spaceId) return null;
  if (!itemId) return `/k/${spaceId}`;
  const base = `/k/${spaceId}/i/${itemId}`;
  const commentId = uuidOrNull(notification.target.commentId ?? notification.payload.commentId);
  if (commentId) return `${base}?tab=comments&comment=${commentId}`;
  if (notification.type === "knowledge.commented" || notification.type === "knowledge.replied") return `${base}?tab=comments`;
  if (notification.type === "knowledge.updated" && notification.payload.published !== true) return `${base}?tab=history`;
  return base;
};
