import {
  SetCurrentDepartmentResponseSchema,
  type Department,
  type SetCurrentDepartmentRequest
} from "@/contracts/departments";
import { api } from "@/lib/api/client";

export const departmentsApi = {
  /** PUT /workspace/department — remembers the current department (403 DEPARTMENT_FORBIDDEN for a non-member). */
  setCurrent: (department: Department) =>
    api.put("/workspace/department", SetCurrentDepartmentResponseSchema, {
      department
    } satisfies SetCurrentDepartmentRequest)
};
