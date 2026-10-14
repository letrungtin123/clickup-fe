import {
  jobPermissionActions,
  jobPermissionRoles,
  jobPermissionScopes,
  type JobPermissionAction,
  type JobPermissionMatrix,
  type JobPermissionRole,
  type JobPermissionScope
} from "@/contracts/production-catalog";

/**
 * "Phân quyền Job" (PD-036): copy and pure helpers of the role × action matrix edited on
 * Cài đặt → Vai trò & phân quyền (PD-042). ADMIN is always "all" and never part of the stored matrix.
 */

export const jobActionLabels: Record<JobPermissionAction, string> = {
  view: "Xem",
  create: "Tạo",
  update: "Sửa",
  delete: "Xoá"
};

export const jobScopeLabels: Record<JobPermissionScope, string> = {
  none: "Không",
  own: "Của mình",
  all: "Tất cả"
};

/** Items for the scope selects, narrowest first. */
export const jobScopeItems = jobPermissionScopes.map((scope) => ({
  value: scope,
  label: jobScopeLabels[scope]
}));

/** What "Của mình" and "Tất cả" allow for each action (mirrors the API rules). */
export const jobScopeMeaning: Record<
  JobPermissionAction,
  Record<Exclude<JobPermissionScope, "none">, string>
> = {
  view: {
    own: "Job có dòng việc mình làm hoặc mình QC, và job mình là Leader.",
    all: "Mọi job."
  },
  create: {
    own: "Chỉ thêm dòng việc giao cho chính mình vào job có sẵn (“Nhập công việc”).",
    all: "Tạo job (“Tạo job”) và dòng việc cho bất kỳ ai."
  },
  update: {
    own: "Dòng việc giao cho mình; thông tin chung của job chỉ khi mọi dòng của job đều là của mình.",
    all: "Mọi job và dòng việc."
  },
  delete: {
    own: "Dòng việc giao cho mình; cả job chỉ khi mọi dòng của job đều là của mình.",
    all: "Mọi job và dòng việc."
  }
};

export type JobScopeChange = {
  role: JobPermissionRole;
  action: JobPermissionAction;
  from: JobPermissionScope;
  to: JobPermissionScope;
};

/** Cells whose scope differs between two matrices, in table order (role, then action). */
export const jobScopeChanges = (
  from: JobPermissionMatrix,
  to: JobPermissionMatrix
): JobScopeChange[] =>
  jobPermissionRoles.flatMap((role) =>
    jobPermissionActions.flatMap((action) =>
      from[role][action] === to[role][action]
        ? []
        : [{ role, action, from: from[role][action], to: to[role][action] }]
    )
  );

export const sameJobPermissions = (a: JobPermissionMatrix, b: JobPermissionMatrix) =>
  jobScopeChanges(a, b).length === 0;

/** A copy of the matrix with one cell changed (the input is never mutated). */
export const withJobScope = (
  matrix: JobPermissionMatrix,
  role: JobPermissionRole,
  action: JobPermissionAction,
  scope: JobPermissionScope
): JobPermissionMatrix => ({ ...matrix, [role]: { ...matrix[role], [action]: scope } });
