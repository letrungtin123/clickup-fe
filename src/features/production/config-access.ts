import { useSessionContext } from "@/features/auth/hooks";

/**
 * PD-050: the whole "Cấu hình Photo Retouch" (members & roles, teams, whitelist, clients, projects, processes, shifts,
 * prices, workflow, job statuses, custom fields, tags, general settings, KPI, KPI close) and the Photo Retouch job
 * permission matrix are edited by the organization superadmin only; everyone else who can open a page reads it. The API
 * refuses the others' writes too (403).
 */
export const useCanEditProductionConfig = () => useSessionContext().hasFullOrganizationAuthority;

export const configReadOnlyMessage =
  "Chỉ Siêu quản trị chỉnh sửa Cấu hình Photo Retouch. Bạn đang xem ở chế độ chỉ đọc.";
