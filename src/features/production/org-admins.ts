import { productionRoleCodes, type ProductionRole } from "@/contracts/production-catalog";

/**
 * Who a production ADMIN may act on from "Thành viên & vai trò" (contracts/users-admin.ts, PD-024).
 * Mirrors the API guards for the UX only — the server answers 403 ORG_ADMIN_PROTECTED / 409 SELF_*
 * anyway:
 *   - never an organization superadmin (enable/disable, reset password, production roles);
 *   - an organization admin (role holding member.manage or role.*) only when the viewer is a superadmin;
 *   - not yourself for enable/disable and reset (your own roles: only "keep your ADMIN").
 * Team, custom fields and tags stay editable on every row.
 */

/** Organization permissions that make a role an "organization admin" (BE orgAdminPermissions). */
export const ORG_ADMIN_PERMISSIONS: readonly string[] = [
  "member.manage",
  "role.create",
  "role.update",
  "role.delete",
  "role.assign_permission"
];

export type OrgAuthority = "superadmin" | "admin";

/** The part of GET /organization/members this needs (AdminMember). */
export type OrgMemberLike = {
  user: { id: string };
  role: { key: string; permissions: readonly string[] };
};

export const isOrgAdminRole = (role: OrgMemberLike["role"]) =>
  role.key === "superadmin" ||
  role.permissions.some((permission) => ORG_ADMIN_PERMISSIONS.includes(permission));

/** userId → organization authority, for members whose organization role is superadmin or admin-like. */
export const orgAuthorityByUser = (members: readonly OrgMemberLike[]) => {
  const map = new Map<string, OrgAuthority>();
  for (const member of members) {
    if (member.role.key === "superadmin") map.set(member.user.id, "superadmin");
    else if (isOrgAdminRole(member.role)) map.set(member.user.id, "admin");
  }
  return map;
};

export type AccountLockKind = "self" | "superadmin" | "org-admin";

export type AccountLock = {
  kind: AccountLockKind;
  /** Why enable/disable and reset password are not offered (shown in the row menu). */
  reason: string;
};

export const accountLockReasons: Record<AccountLockKind, string> = {
  self: "Đây là tài khoản của bạn — đổi mật khẩu trong Hồ sơ cá nhân.",
  superadmin: "Tài khoản superadmin chỉ quản lý được ở Cài đặt › Thành viên.",
  "org-admin":
    "Tài khoản quản trị tổ chức — chỉ superadmin mới vô hiệu hóa, đặt lại mật khẩu hoặc đổi vai trò."
};

type LockInput = {
  userId: string;
  viewerId: string;
  /** `hasFullOrganizationAuthority` of the viewer (organization superadmin). */
  viewerIsSuperadmin: boolean;
  /** From orgAuthorityByUser; undefined when the viewer may not read the organization members. */
  authority: ReadonlyMap<string, OrgAuthority> | undefined;
};

/** Account actions (Vô hiệu hóa / Kích hoạt lại / Đặt lại mật khẩu) unavailable on this row, or null. */
export const accountLock = ({
  userId,
  viewerId,
  viewerIsSuperadmin,
  authority
}: LockInput): AccountLock | null => {
  if (userId === viewerId) return { kind: "self", reason: accountLockReasons.self };
  const level = authority?.get(userId);
  if (level === "superadmin") return { kind: "superadmin", reason: accountLockReasons.superadmin };
  if (level === "admin" && !viewerIsSuperadmin)
    return { kind: "org-admin", reason: accountLockReasons["org-admin"] };
  return null;
};

const allRoles = (reason: string) =>
  Object.fromEntries(productionRoleCodes.map((role) => [role, reason])) as Partial<
    Record<ProductionRole, string>
  >;

/**
 * Production roles that cannot be toggled on a row, with the tooltip reason: your own ADMIN (unless
 * superadmin), every role of a superadmin / organization admin the viewer may not manage.
 */
export const lockedRoles = (
  lock: AccountLock | null,
  { roles, viewerIsSuperadmin }: { roles: readonly ProductionRole[]; viewerIsSuperadmin: boolean }
): Partial<Record<ProductionRole, string>> => {
  if (!lock) return {};
  if (lock.kind === "self")
    return !viewerIsSuperadmin && roles.includes("ADMIN")
      ? { ADMIN: "Bạn không thể tự bỏ quyền Quản trị của mình" }
      : {};
  return lock.kind === "superadmin"
    ? allRoles("Superadmin luôn có quyền Quản trị Photo Retouch; vai trò không đổi được ở đây.")
    : allRoles("Chỉ superadmin đổi được vai trò của tài khoản quản trị tổ chức.");
};
