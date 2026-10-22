import type { Department } from "@/contracts/departments";
import type { ProductionRole } from "@/contracts/production-catalog";
import type { LedJob } from "@/contracts/users-admin";
import {
  departmentErrorMessage,
  toDepartmentPayload,
  validateDepartmentDraft,
  type DepartmentLocks
} from "@/features/departments-admin/department-form";

import type { CreateUserInput } from "../../api";
import { productionErrorMessage } from "../../errors";

/**
 * Pure helpers of the production user administration on "Thành viên & vai trò" (SPEC Phase 0
 * /admin/users, contracts/users-admin.ts): the "Thêm thành viên" form, the one-time temporary
 * password and the jobs a demoted / disabled leader still leads (SEC2-04).
 */

// "Thêm thành viên" ------------------------------------------------------------------------------

export type NewMemberDraft = {
  email: string;
  displayName: string;
  jobTitle: string;
  /** PD-041: at least one; the roles below are only sent with PHOTO_RETOUCH. */
  departments: Department[];
  roles: ProductionRole[];
  teamId: string | null;
  allowGoogleSignIn: boolean;
};

/** Most new accounts here are retouchers: Photo Retouch + "Nhân viên" pre-selected (still editable). */
export const emptyNewMember: NewMemberDraft = {
  email: "",
  displayName: "",
  jobTitle: "",
  departments: ["PHOTO_RETOUCH"],
  roles: ["STAFF"],
  teamId: null,
  allowGoogleSignIn: true
};

export type NewMemberErrors = Partial<
  Record<"email" | "displayName" | "jobTitle" | "departments" | "roles", string>
>;

/** Same shape the API accepts (AccountEmailSchema). */
const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export const MAX_NAME_LENGTH = 160;
export const MAX_JOB_TITLE_LENGTH = 120;

/** `locks`: departments the caller may not add (escalation guard, useDepartmentLocks). */
export const validateNewMember = (
  draft: NewMemberDraft,
  locks: DepartmentLocks = {}
): NewMemberErrors => {
  const errors: NewMemberErrors = {};
  const email = draft.email.trim();
  if (!email) errors.email = "Nhập email đăng nhập.";
  else if (email.length > 254 || !emailPattern.test(email))
    errors.email = "Email chưa đúng định dạng, ví dụ ten@nesso.vn.";
  const name = draft.displayName.trim();
  if (!name) errors.displayName = "Nhập họ tên.";
  else if (name.length > MAX_NAME_LENGTH)
    errors.displayName = `Họ tên tối đa ${MAX_NAME_LENGTH} ký tự.`;
  if (draft.jobTitle.trim().length > MAX_JOB_TITLE_LENGTH)
    errors.jobTitle = `Chức danh tối đa ${MAX_JOB_TITLE_LENGTH} ký tự.`;
  const departmentProblems = validateDepartmentDraft(
    { departments: draft.departments, roles: draft.roles },
    { locks }
  );
  if (departmentProblems.departments) errors.departments = departmentProblems.departments;
  if (departmentProblems.roles) errors.roles = departmentProblems.roles;
  return errors;
};

/**
 * POST /production/users body: trimmed, lower-cased email, empty job title left out, departments
 * in stable order, roles (canonical order) only with Photo Retouch.
 */
export const toCreateUserInput = (draft: NewMemberDraft): CreateUserInput => {
  const jobTitle = draft.jobTitle.trim();
  const { departments, roles } = toDepartmentPayload(draft);
  return {
    email: draft.email.trim().toLowerCase(),
    displayName: draft.displayName.trim(),
    ...(jobTitle ? { jobTitle } : {}),
    departments,
    roles,
    teamId: draft.teamId,
    allowGoogleSignIn: draft.allowGoogleSignIn
  };
};

/** Member admin errors: the department answers (PD-041) first, then the production copy. */
export const memberErrorMessage = (
  error: unknown,
  options?: Parameters<typeof productionErrorMessage>[1]
) => departmentErrorMessage(error) ?? productionErrorMessage(error, options);

// Temporary password ------------------------------------------------------------------------------

/** A one-time temporary password, kept only in component state (never logged, cached or toasted). */
export type TemporarySecret = {
  kind: "created" | "reset";
  name: string;
  email: string | null;
  password: string;
  /** The address was added to the Google sign-in whitelist (create only). */
  whitelisted: boolean;
};

// Jobs still led (SEC2-04) ------------------------------------------------------------------------

/** Open jobs someone still leads right after losing LEADER / ADMIN or their account. */
export type OrphanNotice = {
  userId: string;
  displayName: string;
  reason: "role" | "deactivated";
  jobs: LedJob[];
};

/** Newest first; a second change for the same person replaces their notice. */
export const addOrphanNotice = (notices: readonly OrphanNotice[], next: OrphanNotice) => [
  next,
  ...notices.filter((notice) => notice.userId !== next.userId)
];

export const orphanTitle = (count: number, name: string) =>
  `${count} job vẫn do ${name} dẫn — hãy giao cho Leader khác`;

/**
 * The job list filtered by leader (jobs-model `leader` parameter): the removable "Leader: …" chip — the viewer's own id
 * too ("Job tôi phụ trách → Xem tất cả"). Opened on the "Tất cả" tab (PD-078: "Tôi quản lý" is the Projects I own, so a
 * job I lead in someone else's Project is only under "Tất cả").
 */
export const jobsLedByHref = (userId: string) =>
  `/production/jobs?${new URLSearchParams({ scope: "all", leader: userId }).toString()}`;

const pad = (value: number) => String(value).padStart(2, "0");

const partsIn = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute")
  };
};

/** "dd/MM HH:mm" in the organization timezone ("dd/MM/yyyy HH:mm" outside the current year). */
export const formatLedDeadline = (iso: string, timeZone: string, now: Date = new Date()) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const p = partsIn(date, timeZone);
  const year = p.year === partsIn(now, timeZone).year ? "" : `/${p.year}`;
  return `${pad(p.day)}/${pad(p.month)}${year} ${pad(p.hour)}:${pad(p.minute)}`;
};
