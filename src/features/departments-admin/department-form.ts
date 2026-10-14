import {
  departmentCodes,
  departmentLabels,
  departmentRolesProblem,
  departmentsRequiredMessage,
  sortDepartments,
  type Department
} from "@/contracts/departments";
import { productionRoleCodes, type ProductionRole } from "@/contracts/production-catalog";
import { isApiError } from "@/lib/api/errors";

/**
 * "Phòng ban" fields of the member forms (PD-041), shared by Cài đặt › Thành viên and the Photo
 * Retouch users admin (Cấu hình › Thành viên & vai trò): pure rules, mirrored by the API.
 *   - at least one department (an organization superadmin implicitly belongs to all and is never edited here);
 *   - production (Photo Retouch) roles are required with PHOTO_RETOUCH and not sent without it; when editing,
 *     only when PHOTO_RETOUCH is newly added (someone who already has it keeps their roles);
 *   - escalation guard: a caller who is not the superadmin can only add / remove departments they belong to
 *     (403 DEPARTMENT_ESCALATION) — those checkboxes are disabled with the reason.
 */

/** Shown instead of the department list for an organization superadmin. */
export const allDepartmentsLabel = "Tất cả";

export { departmentTones } from "@/features/departments/meta";

/** One line under each option of the picker. */
export const departmentDescriptions: Record<Department, string> = {
  PHOTO_RETOUCH: "Job, task, QC và điểm của đội retouch.",
  PRODUCTION: "Dự án và công việc (Dự án, Việc của tôi)."
};

/** Warning shown before saving an edit that removes PHOTO_RETOUCH (the API removes the roles too). */
export const removeRetouchWarning =
  "Bỏ Photo Retouch sẽ gỡ các vai trò Photo Retouch của người này.";

export const escalationMessage = "Bạn chỉ thêm hoặc bỏ được phòng ban mà bạn thuộc về.";

/** Departments the caller may not toggle, with the reason (tooltip / hint). */
export type DepartmentLocks = Partial<Record<Department, string>>;

export const departmentLocks = (
  caller: {
    departments: readonly Department[];
    hasFullOrganizationAuthority: boolean;
    /** Effective production roles of the caller (session). */
    productionRoles?: readonly string[] | undefined;
  },
  options: { retouchNeedsProductionAdmin?: boolean } = {}
): DepartmentLocks => {
  if (caller.hasFullOrganizationAuthority) return {};
  const locks: DepartmentLocks = {};
  for (const department of departmentCodes) {
    if (!caller.departments.includes(department))
      locks[department] =
        `Bạn không thuộc phòng ban ${departmentLabels[department]} nên không thêm hoặc bỏ được phòng ban này.`;
  }
  // Cài đặt › Thành viên: Photo Retouch comes with production roles, which only a production ADMIN (or the
  // superadmin) may grant or take away (403 PRODUCTION_ROLE_ESCALATION).
  if (options.retouchNeedsProductionAdmin && !locks.PHOTO_RETOUCH && !caller.productionRoles?.includes("ADMIN")) {
    locks.PHOTO_RETOUCH = retouchAdminOnlyMessage;
  }
  return locks;
};

export const retouchAdminOnlyMessage =
  "Chỉ Quản trị Photo Retouch hoặc superadmin mới thêm hoặc bỏ được phòng ban Photo Retouch (kèm vai trò).";

/** Adds or removes one department; result de-duplicated, stable order (Photo Retouch first). */
export const toggleDepartment = (
  departments: readonly Department[],
  department: Department
): Department[] =>
  sortDepartments(
    departments.includes(department)
      ? departments.filter((item) => item !== department)
      : [...departments, department]
  );

/** Canonical role order (ADMIN → STAFF), duplicates removed. */
const sortProductionRoles = (roles: readonly ProductionRole[]): ProductionRole[] =>
  productionRoleCodes.filter((role) => roles.includes(role));

export type DepartmentDraft = {
  departments: Department[];
  /** Kept while Photo Retouch is unticked (re-ticking restores them); only sent with PHOTO_RETOUCH. */
  roles: ProductionRole[];
};

export type DepartmentErrors = { departments?: string | undefined; roles?: string | undefined };

/**
 * The production roles field is shown (and required): creating → PHOTO_RETOUCH ticked; editing
 * (`before` given) → PHOTO_RETOUCH newly added.
 */
export const showsRetouchRoles = (
  departments: readonly Department[],
  before?: readonly Department[]
) => departments.includes("PHOTO_RETOUCH") && !(before?.includes("PHOTO_RETOUCH") ?? false);

/** Editing removes PHOTO_RETOUCH (the API then removes the person's production roles). */
export const removesRetouch = (before: readonly Department[], after: readonly Department[]) =>
  before.includes("PHOTO_RETOUCH") && !after.includes("PHOTO_RETOUCH");

/** Departments whose membership changes (creating: every chosen one). */
const changedDepartments = (
  after: readonly Department[],
  before: readonly Department[] = []
): Department[] =>
  departmentCodes.filter(
    (department) => before.includes(department) !== after.includes(department)
  );

export const validateDepartmentDraft = (
  draft: DepartmentDraft,
  options: { before?: readonly Department[]; locks?: DepartmentLocks } = {}
): DepartmentErrors => {
  const errors: DepartmentErrors = {};
  const departments = sortDepartments(draft.departments);
  if (departments.length === 0) errors.departments = departmentsRequiredMessage;
  else {
    const locked = changedDepartments(departments, options.before).find((d) => options.locks?.[d]);
    if (locked) errors.departments = options.locks?.[locked] ?? escalationMessage;
  }
  if (showsRetouchRoles(departments, options.before)) {
    const problem = departmentRolesProblem(departments, draft.roles);
    if (problem) errors.roles = problem;
  }
  return errors;
};

/** Create payload: departments (stable order) and the roles only with PHOTO_RETOUCH (none otherwise). */
export const toDepartmentPayload = (
  draft: DepartmentDraft
): { departments: Department[]; roles: ProductionRole[] } => {
  const departments = sortDepartments(draft.departments);
  return {
    departments,
    roles: departments.includes("PHOTO_RETOUCH") ? sortProductionRoles(draft.roles) : []
  };
};

export type DepartmentChange = { departments: Department[]; roles?: ProductionRole[] };

/**
 * Edit payload: null when nothing changed; the roles only when PHOTO_RETOUCH is newly added
 * (removing it lets the API remove the roles; keeping it leaves them as they are).
 */
export const toDepartmentChange = (
  before: readonly Department[],
  draft: DepartmentDraft
): DepartmentChange | null => {
  const departments = sortDepartments(draft.departments);
  if (changedDepartments(departments, before).length === 0) return null;
  return showsRetouchRoles(departments, before)
    ? { departments, roles: sortProductionRoles(draft.roles) }
    : { departments };
};

/** What a list shows: every department for a superadmin ("Tất cả"), otherwise theirs in stable order. */
export const shownDepartments = (
  departments: readonly Department[],
  superadmin: boolean
): "all" | Department[] => (superadmin ? "all" : sortDepartments(departments));

/** Client-side department filter (null = every department); a superadmin matches every department. */
export const inDepartment = (
  departments: readonly Department[],
  filter: Department | null,
  superadmin = false
) => filter === null || superadmin || departments.includes(filter);

/** Vietnamese copy for the department answers of the member endpoints (PD-041). */
const departmentErrorMessages: Record<string, string> = {
  DEPARTMENTS_REQUIRED: departmentsRequiredMessage,
  DEPARTMENT_ESCALATION: escalationMessage,
  DEPARTMENT_FORBIDDEN: "Bạn không thuộc phòng ban này.",
  PRODUCTION_ROLES_REQUIRED: "Chọn ít nhất một vai trò Photo Retouch.",
  PRODUCTION_ROLES_NOT_ALLOWED:
    "Vai trò Photo Retouch chỉ dành cho người thuộc phòng ban Photo Retouch.",
  PRODUCTION_ROLE_ESCALATION: retouchAdminOnlyMessage
};

/** The department-specific message for an API error, or null (then use the page's own error copy). */
export const departmentErrorMessage = (error: unknown): string | null =>
  isApiError(error) ? (departmentErrorMessages[error.code] ?? null) : null;

/** The form field a department API error belongs to. */
export const departmentErrorField = (error: unknown): keyof DepartmentErrors | null => {
  if (!isApiError(error)) return null;
  if (error.code === "DEPARTMENTS_REQUIRED" || error.code === "DEPARTMENT_ESCALATION")
    return "departments";
  if (error.code === "PRODUCTION_ROLES_REQUIRED" || error.code === "PRODUCTION_ROLES_NOT_ALLOWED")
    return "roles";
  return null;
};
