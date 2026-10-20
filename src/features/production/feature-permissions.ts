import {
  defaultFeaturePermissions,
  effectiveFeatures,
  featurePermissionKeys,
  productionRoleCodes,
  type FeaturePermissionKey,
  type FeaturePermissionMatrix,
  type ProductionRole
} from "@/contracts/production-catalog";

/**
 * "Quyền theo tính năng" (PD-065): copy and pure helpers of the feature × production role matrix edited on Cài đặt →
 * Vai trò & phân quyền (superadmin only, PD-050). Menus, pages and buttons follow `/production/me` features; the API
 * checks every request again.
 */

export const featureLabels: Record<FeaturePermissionKey, string> = {
  qc_queue: "Hàng chờ QC",
  view_others_scores: "Xem điểm người khác",
  view_others_money: "Xem tiền Khoán người khác",
  leader_dashboard: "Bảng điều khiển",
  admin_dashboard: "Quản trị số liệu",
  anomalies: "Bất thường",
  leave_approval: "Duyệt lịch nghỉ",
  clients: "Khách hàng"
};

/** What holding each feature allows (row help of the matrix). */
export const featureDescriptions = (): Record<FeaturePermissionKey, string> => ({
  qc_queue:
    "Trang Hàng chờ QC: task chờ kiểm mà mình là người QC. Chỉ người có vai trò QC mới được chọn làm QC của task.",
  view_others_scores:
    "Tab Toàn đội ở Bảng điểm (điểm chính thức, KPI, % đạt của mọi người), Điểm cá nhân và điểm từng task của người khác. Điểm của chính mình luôn xem được.",
  view_others_money:
    "Tiền Khoán của người khác (Toàn đội, Điểm cá nhân, chi tiết task, KPI, kết quả chốt) và tiền mỗi tấm ở Bảng đơn giá. Tiền của chính mình luôn xem được; ngoài quyền này không ai xem được tiền của người khác.",
  leader_dashboard:
    "Tiến độ, tải việc hôm nay và điểm team. Người không phải Quản trị/Director thấy job mình lead và job chưa có leader.",
  admin_dashboard:
    "Bảng số liệu tổng của Photo Retouch (điểm hôm nay, job trễ, tỉ lệ FB, năng suất ca, KPI) và các báo cáo được ghim.",
  anomalies:
    "Xem và xử lý mục bất thường (trễ, lệch số lượng…); người không phải Quản trị/Director chỉ thấy job mình lead.",
  leave_approval:
    "Duyệt / từ chối đơn nghỉ, nhận thông báo đơn mới và xuất Excel bảng chấm công nghỉ phép. Ai cũng xem lịch nghỉ và gửi đơn.",
  clients:
    "Trang Khách hàng: xem khách hàng đặt job. Chỉ Siêu quản trị tạo và sửa khách hàng (PD-050)."
});

/** Holds `role` the feature in `matrix`? */
export const featureGranted = (
  matrix: FeaturePermissionMatrix,
  feature: FeaturePermissionKey,
  role: ProductionRole
) => matrix[feature].includes(role);

/**
 * The features of `roles` when `/production/me` did not say (the default matrix): used only until the caller's own
 * list is known.
 */
export const fallbackFeatures = (roles: readonly ProductionRole[]) =>
  effectiveFeatures(roles, defaultFeaturePermissions);

export type FeatureChange = {
  feature: FeaturePermissionKey;
  role: ProductionRole;
  granted: boolean;
};

/** Cells that differ between two matrices, in table order (feature, then role). */
export const featureChanges = (
  from: FeaturePermissionMatrix,
  to: FeaturePermissionMatrix
): FeatureChange[] =>
  featurePermissionKeys.flatMap((feature) =>
    productionRoleCodes.flatMap((role) => {
      const granted = featureGranted(to, feature, role);
      return featureGranted(from, feature, role) === granted ? [] : [{ feature, role, granted }];
    })
  );

export const sameFeaturePermissions = (a: FeaturePermissionMatrix, b: FeaturePermissionMatrix) =>
  featureChanges(a, b).length === 0;

/** A copy of the matrix with one cell changed; roles stay in canonical order (the input is never mutated). */
export const withFeatureRole = (
  matrix: FeaturePermissionMatrix,
  feature: FeaturePermissionKey,
  role: ProductionRole,
  granted: boolean
): FeaturePermissionMatrix => {
  const roles = new Set(matrix[feature]);
  if (granted) roles.add(role);
  else roles.delete(role);
  return { ...matrix, [feature]: productionRoleCodes.filter((code) => roles.has(code)) };
};
