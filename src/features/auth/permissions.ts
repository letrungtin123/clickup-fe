import { Permission as ContractPermission, type PermissionKey } from "@/contracts/permissions";
import type { ProjectAccessLevel } from "@/contracts/work";

/**
 * Permission keys the UI checks. Contract keys plus keys that exist in the database but may not be in
 * the synced contract yet (member.view / member.manage / task.comment). Keeping them as plain strings
 * means the UI compiles and degrades gracefully either way.
 */
export const P = {
  ...ContractPermission,
  MemberView: "member.view",
  MemberManage: "member.manage",
  TaskComment: "task.comment"
} as const;

export type PermissionLike = PermissionKey | (typeof P)[keyof typeof P] | (string & {});

export const can = (
  session: { granted: ReadonlySet<string>; full: boolean },
  permission: PermissionLike
) => session.full || session.granted.has(permission);

const accessRank: Record<ProjectAccessLevel, number> = { view: 0, submit: 1, manage: 2 };

export const accessAtLeast = (
  level: ProjectAccessLevel | null | undefined,
  required: ProjectAccessLevel
) => (level ? accessRank[level] >= accessRank[required] : false);
