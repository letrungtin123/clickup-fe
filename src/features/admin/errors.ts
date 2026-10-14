import { departmentErrorMessage } from "@/features/departments-admin/department-form";
import { getErrorMessage } from "@/lib/api/errors";

/** Cài đặt › Thành viên copy: department answers (PD-041) first, then the shared map. */
export const adminErrorMessage = (error: unknown, fallback?: string) =>
  departmentErrorMessage(error) ?? getErrorMessage(error, fallback);
