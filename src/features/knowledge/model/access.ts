import type {
  KnowledgeImportance,
  KnowledgeItemDetail,
  KnowledgeSpace,
  KnowledgeStatus
} from "@/contracts/knowledge";

/**
 * UX gates of the knowledge base, derived from the org permissions (outer layer: `knowledge.*`) and the
 * capabilities the server computes per space / item. Pure so they are unit-tested; the API enforces every
 * rule again.
 */

export type OrgKnowledgePermissions = {
  view: boolean;
  create: boolean;
  delete: boolean;
};

/** Sidebar section, routes and the palette entries exist only with `knowledge.view`. */
export const canSeeKnowledge = (org: OrgKnowledgePermissions) => org.view;

/** "Tạo kho" (sidebar +, palette, empty states) needs `knowledge.view` + `knowledge.create`. */
export const canCreateSpace = (org: OrgKnowledgePermissions) => org.view && org.create;

export type SpaceUi = {
  /** "Mục mới": submit+ (members at Thành viên / Quản lý). */
  canCreateItem: boolean;
  /** Category tree editing (add / rename / move / reorder / delete): manage + knowledge.update. */
  canManageCategories: boolean;
  /** Space manager (manage level or org admin): sees the settings as a manager. */
  canManage: boolean;
  /** Info, visibility, approval step, statuses: manage + knowledge.update. */
  canUpdate: boolean;
  /** Members and access levels: manage + knowledge.manage_members. */
  canManageMembers: boolean;
  /** Archive / restore / delete the space: manage + knowledge.delete (stays available when archived). */
  canArchive: boolean;
  /** "Nhật ký kho" (full space audit log): space managers and org admins. */
  canViewAudit: boolean;
  /** Trash page: anyone who can move items to the trash or purge them. */
  canViewTrash: boolean;
  /** Permanent deletion from the trash: manage + `knowledge.delete` (server computed). */
  canPurge: boolean;
  /** Can comment on items of this space. */
  canComment: boolean;
  /** Archived spaces are read-only for everyone. */
  readOnly: boolean;
};

export const spaceUi = (
  space: Pick<KnowledgeSpace, "capabilities" | "archivedAt">,
  org: OrgKnowledgePermissions
): SpaceUi => {
  const caps = space.capabilities;
  const readOnly = space.archivedAt !== null;
  const canManage = caps.canManage && !readOnly;
  return {
    canCreateItem: caps.canEdit && !readOnly,
    canManageCategories: caps.canUpdate && !readOnly,
    canManage,
    canUpdate: caps.canUpdate && !readOnly,
    canManageMembers: caps.canManageMembers && !readOnly,
    canArchive: caps.canArchive,
    canViewAudit: caps.canViewAudit,
    canViewTrash: (caps.canEdit || caps.canManage) && !readOnly,
    canPurge: caps.canPurge && org.delete && !readOnly,
    canComment: caps.canComment && !readOnly,
    readOnly
  };
};

/** Statuses the caller may move the item to (approval rule applied by the server), in space order. */
export const statusChoices = (
  statuses: readonly KnowledgeStatus[],
  item: Pick<KnowledgeItemDetail, "status" | "capabilities">
): KnowledgeStatus[] => {
  if (!item.capabilities.canChangeStatus) return [];
  const allowed = new Set(item.capabilities.allowedStatusIds);
  return [...statuses]
    .sort((a, b) => a.position - b.position)
    .filter((status) => status.id !== item.status.id && allowed.has(status.id));
};

/**
 * Statuses offered when creating an item: the server defaults to the first draft status; with approval
 * switched on, any status outside the draft group (active or retired) needs manage (server: needsApproval).
 */
export const createStatusChoices = (
  statuses: readonly KnowledgeStatus[],
  space: Pick<KnowledgeSpace, "approvalRequired" | "capabilities">
): KnowledgeStatus[] =>
  [...statuses]
    .sort((a, b) => a.position - b.position)
    .filter(
      (status) =>
        status.group === "draft" || !space.approvalRequired || space.capabilities.canManage
    );

/** Changes to a critical item (before or after the change) need a written reason (≥ 3 characters). */
export const reasonRequired = (
  before: KnowledgeImportance | null | undefined,
  after?: KnowledgeImportance | null
) => before === "critical" || after === "critical";

export const minReasonLength = 3;

export const isValidReason = (reason: string) => reason.trim().length >= minReasonLength;

/** A retired item is still readable, always with the "Hết hiệu lực" warning. */
export const isRetired = (item: { status: Pick<KnowledgeStatus, "group"> }) =>
  item.status.group === "retired";

/** Drafts are hidden from plain readers; the badge reminds members the item is not official yet. */
export const isDraft = (item: { status: Pick<KnowledgeStatus, "group"> }) =>
  item.status.group === "draft";

/**
 * Approval step on and the item is published (or retired): only Quản lý edits it (owner decision
 * 2026-10-11). A member who can edit drafts is told why "Sửa" is missing and pointed to the comments.
 */
export const approvalLocked = (
  item: Pick<KnowledgeItemDetail, "capabilities" | "status" | "deletedAt">,
  space: Pick<KnowledgeSpace, "approvalRequired" | "capabilities">
) =>
  space.approvalRequired &&
  space.capabilities.canEdit &&
  !item.capabilities.canEdit &&
  item.status.group !== "draft" &&
  item.deletedAt === null;

/** Item page actions shown in the header menu. */
export const itemActions = (
  item: Pick<KnowledgeItemDetail, "capabilities" | "deletedAt">,
  space: Pick<KnowledgeSpace, "archivedAt">
) => {
  const live = item.deletedAt === null && space.archivedAt === null;
  return {
    edit: live && item.capabilities.canEdit,
    changeStatus: live && item.capabilities.canChangeStatus && item.capabilities.allowedStatusIds.length > 0,
    changeImportance: live && item.capabilities.canEdit,
    pin: live && item.capabilities.canEdit,
    delete: live && item.capabilities.canDelete,
    comment: live && item.capabilities.canComment,
    history: item.capabilities.canViewHistory,
    /** Restoring an old version creates a new one: submit+ (= edit rights). */
    restoreVersion: live && item.capabilities.canEdit
  };
};
