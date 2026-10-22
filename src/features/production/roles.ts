import { productionRoleCodes, type ProductionRole } from "@/contracts/production-catalog";
import type { ColorToken } from "@/contracts/work";

/**
 * Production (retouch) roles, PD-011: multi-valued, assigned by an Admin. The UI only uses them to
 * shape menus and pages — the API enforces every rule again (non-members 404, missing role 403).
 */

export const productionRoleLabels: Record<ProductionRole, string> = {
  ADMIN: "Quản trị",
  ACCOUNT: "Account",
  LEADER: "Leader",
  QC: "QC",
  STAFF: "Nhân viên",
  DIRECTOR: "Director"
};

export const productionRoleDescriptions: Record<ProductionRole, string> = {
  ADMIN: "Toàn quyền cấu hình, gán vai trò và xem mọi báo cáo.",
  ACCOUNT: "Tạo Project và Job Code (không tạo task), xác nhận giao hàng cho khách.",
  LEADER: "Chia task, gán QC và theo dõi tiến độ của team.",
  QC: "Kiểm tra task chờ QC (Đạt hoặc trả lại kèm ghi chú) và nhập task Checking của mình.",
  STAFF: "Nhập task của mình, cập nhật tiến độ và xem điểm của mình.",
  DIRECTOR: "Xem Bất thường và Quản trị số liệu; theo dõi toàn bộ số liệu."
};

export const productionRoleColors: Record<ProductionRole, ColorToken> = {
  ADMIN: "violet",
  ACCOUNT: "sky",
  LEADER: "amber",
  QC: "teal",
  STAFF: "slate",
  DIRECTOR: "fuchsia"
};

/** Canonical order (ADMIN → STAFF → DIRECTOR), duplicates removed. */
export const sortRoles = (roles: readonly ProductionRole[]): ProductionRole[] =>
  productionRoleCodes.filter((role) => roles.includes(role));

/**
 * True when the user holds any of `required`. ADMIN passes every role check (mirrors the API); features (PD-065) are
 * not role checks — use the caller's `features` (useProductionAccess().hasFeature).
 */
export const hasAnyRole = (
  roles: readonly ProductionRole[],
  required: readonly ProductionRole[]
): boolean =>
  roles.includes("ADMIN") || required.length === 0 || required.some((role) => roles.includes(role));

/** Toggles one role in a set, keeping the canonical order. */
export const toggleRole = (roles: readonly ProductionRole[], role: ProductionRole) =>
  sortRoles(roles.includes(role) ? roles.filter((item) => item !== role) : [...roles, role]);
