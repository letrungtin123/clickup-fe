import type { KnowledgeAuditAction, KnowledgeAuditEntry } from "@/contracts/knowledge";

import { accessLevelMeta, importanceMeta, statusGroupMeta, visibilityMeta } from "./labels";

/**
 * Vietnamese rendering of the append-only audit log ("Nhật ký", PD-031 §06): one label per action and a
 * readable "trước → sau" list of the changed fields. The payloads are free-form records written by the
 * server, so every value is formatted defensively (ids resolved through the space when possible).
 */

export const auditActionMeta: Record<
  KnowledgeAuditAction,
  { label: string; tone: "brand" | "success" | "warning" | "danger" | "muted"; scope: "space" | "item" }
> = {
  SPACE_CREATED: { label: "Tạo kho", tone: "success", scope: "space" },
  SPACE_UPDATED: { label: "Sửa thông tin kho", tone: "muted", scope: "space" },
  SPACE_ARCHIVED: { label: "Lưu trữ kho", tone: "warning", scope: "space" },
  SPACE_RESTORED: { label: "Khôi phục kho", tone: "success", scope: "space" },
  // Written when a space is deleted (soft delete: the log survives in the database).
  SPACE_DELETED: { label: "Xoá kho", tone: "danger", scope: "space" },
  MEMBER_ADDED: { label: "Thêm thành viên", tone: "brand", scope: "space" },
  MEMBER_UPDATED: { label: "Đổi mức quyền", tone: "muted", scope: "space" },
  MEMBER_REMOVED: { label: "Gỡ thành viên", tone: "warning", scope: "space" },
  STATUSES_REPLACED: { label: "Sửa bộ trạng thái", tone: "muted", scope: "space" },
  CATEGORY_CREATED: { label: "Tạo chuyên mục", tone: "brand", scope: "space" },
  CATEGORY_UPDATED: { label: "Sửa chuyên mục", tone: "muted", scope: "space" },
  CATEGORY_DELETED: { label: "Xoá chuyên mục", tone: "warning", scope: "space" },
  ITEM_CREATED: { label: "Tạo mục", tone: "success", scope: "item" },
  ITEM_CONTENT_UPDATED: { label: "Sửa nội dung", tone: "brand", scope: "item" },
  ITEM_FIELDS_UPDATED: { label: "Sửa thông tin mục", tone: "muted", scope: "item" },
  ITEM_STATUS_CHANGED: { label: "Đổi trạng thái", tone: "brand", scope: "item" },
  ITEM_IMPORTANCE_CHANGED: { label: "Đổi mức quan trọng", tone: "warning", scope: "item" },
  ITEM_MOVED: { label: "Chuyển chuyên mục", tone: "muted", scope: "item" },
  ITEM_DELETED: { label: "Xoá vào thùng rác", tone: "danger", scope: "item" },
  ITEM_RESTORED: { label: "Khôi phục từ thùng rác", tone: "success", scope: "item" },
  ITEM_PURGED: { label: "Xoá vĩnh viễn", tone: "danger", scope: "item" },
  VERSION_RESTORED: { label: "Khôi phục phiên bản", tone: "warning", scope: "item" },
  ATTACHMENT_ADDED: { label: "Thêm tệp đính kèm", tone: "muted", scope: "item" },
  ATTACHMENT_REMOVED: { label: "Xoá tệp đính kèm", tone: "warning", scope: "item" },
  COMMENT_DELETED: { label: "Xoá bình luận", tone: "warning", scope: "item" },
  COMMENT_RESOLVED: { label: "Đánh dấu góp ý", tone: "muted", scope: "item" },
  COMMENT_EDITED: { label: "Sửa bình luận", tone: "muted", scope: "item" }
};

export const auditActionLabel = (action: string) =>
  (auditActionMeta as Record<string, { label: string } | undefined>)[action]?.label ?? action;

/** Field names in payloads → Vietnamese labels (unknown keys fall back to the key itself). */
const fieldLabels: Record<string, string> = {
  title: "Tiêu đề",
  name: "Tên",
  summary: "Tóm tắt",
  description: "Mô tả",
  body: "Nội dung",
  status: "Trạng thái",
  statusId: "Trạng thái",
  statusName: "Trạng thái",
  importance: "Mức quan trọng",
  owner: "Người phụ trách",
  ownerId: "Người phụ trách",
  ownerName: "Người phụ trách",
  category: "Chuyên mục",
  categoryId: "Chuyên mục",
  categoryName: "Chuyên mục",
  parentId: "Chuyên mục cha",
  tags: "Tag",
  reviewBy: "Hạn rà soát",
  effectiveFrom: "Ngày hiệu lực",
  pinned: "Ghim",
  accessLevel: "Mức quyền",
  user: "Người",
  userId: "Người",
  userName: "Người",
  visibility: "Chế độ",
  color: "Màu",
  icon: "Biểu tượng",
  approvalRequired: "Bước duyệt",
  statuses: "Bộ trạng thái",
  fileName: "Tệp",
  sizeBytes: "Dung lượng",
  // Reads "Góp ý: Đã xử lý" / "Góp ý: Chưa xử lý" (was "Đã xử lý: Chưa xử lý").
  resolved: "Góp ý",
  version: "Phiên bản",
  versionNumber: "Phiên bản",
  restoredFrom: "Khôi phục từ phiên bản",
  archivedAt: "Lưu trữ",
  group: "Nhóm",
  bodyText: "Nội dung",
  rank: "Thứ tự",
  placement: "Thứ tự",
  changed: "Phần sửa",
  note: "Ghi chú phiên bản",
  authorName: "Người viết",
  text: "Nội dung",
  replies: "Số trả lời bị xoá",
  moderated: "Quản lý xoá",
  movedItems: "Số mục chuyển",
  itemCount: "Số mục",
  itemsMovedTo: "Chuyển mục tới",
  reassigned: "Chuyển mục giữa trạng thái",
  deletedAt: "Xoá kho"
};

/** Content parts named in ITEM_CONTENT_UPDATED.changed. */
const contentParts: Record<string, string> = { title: "Tiêu đề", summary: "Tóm tắt", body: "Nội dung" };

/** Own-key lookup: payload keys / values come from the server and may be "constructor", "toString"… */
const ownLabel = (labels: Record<string, string>, key: string) => (Object.hasOwn(labels, key) ? labels[key] : undefined);
const ownMeta = <T extends { label: string }>(meta: Record<string, T>, key: string) => (Object.hasOwn(meta, key) ? meta[key]?.label : undefined);

/** Keys that never carry meaning for a reader (ids already rendered through their name, ranks…). */
const hiddenKeys = new Set([
  "id",
  "spaceId",
  "itemId",
  "rank",
  "placement",
  "updatedAt",
  "createdAt",
  "position",
  "commentId",
  "attachmentId",
  "authorId",
  "subcategoriesMovedToTop"
]);

export type AuditResolvers = {
  status?: ((id: string) => string | undefined) | undefined;
  category?: ((id: string) => string | undefined) | undefined;
  user?: ((id: string) => string | undefined) | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const isoPattern = /^\d{4}-\d{2}-\d{2}T/;

const formatDay = (value: string) => {
  const match = dayPattern.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const truncate = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Human-readable value of one payload field. */
export const formatAuditValue = (key: string, value: unknown, resolvers: AuditResolvers = {}): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") {
    if (key === "pinned") return value ? "Đã ghim" : "Bỏ ghim";
    if (key === "approvalRequired") return value ? "Bật" : "Tắt";
    if (key === "moderated") return value ? "Có (không phải người viết)" : "Không";
    if (key === "resolved") return value ? "Đã xử lý" : "Chưa xử lý";
    return value ? "Có" : "Không";
  }
  if (typeof value === "number") {
    if (key === "sizeBytes") return formatBytes(value);
    if (key === "version" || key === "versionNumber" || key === "restoredFrom") return `v${value}`;
    return String(value);
  }
  if (typeof value === "string") {
    const metaLabel =
      key === "importance"
        ? ownMeta(importanceMeta, value)
        : key === "accessLevel"
          ? ownMeta(accessLevelMeta, value)
          : key === "visibility"
            ? ownMeta(visibilityMeta, value)
            : key === "group"
              ? ownMeta(statusGroupMeta, value)
              : undefined;
    if (metaLabel) return metaLabel;
    if (key === "statusId") return resolvers.status?.(value) ?? "(trạng thái đã xoá)";
    if (key === "categoryId" || key === "parentId" || key === "itemsMovedTo") return resolvers.category?.(value) ?? "(chuyên mục đã xoá)";
    if (key === "ownerId" || key === "userId") return resolvers.user?.(value) ?? "(người dùng)";
    if (dayPattern.test(value)) return formatDay(value);
    if (key === "deletedAt") return "Đã xoá";
    if (isoPattern.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}, ${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
      }
    }
    return truncate(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (key === "changed") {
      return value.map((part) => (typeof part === "string" ? (ownLabel(contentParts, part) ?? part) : "")).filter(Boolean).join(", ");
    }
    if (key === "reassigned") {
      return truncate(
        value
          .map((entry) => {
            if (!isRecord(entry)) return "";
            const from = typeof entry.from === "string" ? (resolvers.status?.(entry.from) ?? "trạng thái đã xoá") : "?";
            const to = typeof entry.to === "string" ? (resolvers.status?.(entry.to) ?? "trạng thái khác") : "?";
            return `${from} → ${to}${typeof entry.items === "number" ? ` (${entry.items} mục)` : ""}`;
          })
          .filter(Boolean)
          .join("; ")
      );
    }
    return truncate(value.map((entry) => formatAuditValue(key === "tags" ? "tag" : key, entry, resolvers)).join(", "));
  }
  if (isRecord(value)) {
    const label = value.displayName ?? value.name ?? value.label ?? value.title ?? value.fileName;
    if (typeof label === "string") return truncate(label);
    if (value.type === "doc") return "(nội dung có định dạng)";
    return "(chi tiết)";
  }
  return "—";
};

export type AuditChange = { key: string; label: string; before: string | null; after: string | null };

const comparable = (value: unknown) => JSON.stringify(value ?? null);

/**
 * The fields that differ between `before` and `after` (or every field of a creation / deletion),
 * formatted for display. Unchanged keys and bookkeeping keys are left out.
 */
export const auditChanges = (
  entry: Pick<KnowledgeAuditEntry, "before" | "after">,
  resolvers: AuditResolvers = {}
): AuditChange[] => {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !hiddenKeys.has(key));
  const changes: AuditChange[] = [];
  for (const key of keys) {
    const hasBefore = entry.before !== null && key in before;
    const hasAfter = entry.after !== null && key in after;
    if (hasBefore && hasAfter && comparable(before[key]) === comparable(after[key])) continue;
    changes.push({
      key,
      label: ownLabel(fieldLabels, key) ?? key,
      before: hasBefore ? formatAuditValue(key, before[key], resolvers) : null,
      after: hasAfter ? formatAuditValue(key, after[key], resolvers) : null
    });
  }
  // Keys that resolve to the same label (statusId + statusName) keep the more readable one.
  const seen = new Map<string, AuditChange>();
  for (const change of changes) {
    const existing = seen.get(change.label);
    const readable = !/Id$/.test(change.key);
    if (!existing || (readable && /Id$/.test(existing.key))) seen.set(change.label, change);
  }
  return [...seen.values()];
};

/** One-line summary used in the item history and notifications ("Đổi trạng thái: Nháp → Đã ban hành"). */
export const auditSummary = (entry: KnowledgeAuditEntry, resolvers: AuditResolvers = {}) => {
  const label = auditActionLabel(entry.action);
  const changes = auditChanges(entry, resolvers);
  const first = changes[0];
  if (!first) return label;
  if (first.before !== null && first.after !== null) return `${label}: ${first.before} → ${first.after}`;
  return `${label}: ${first.after ?? first.before ?? ""}`;
};
