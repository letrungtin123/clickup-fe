import { useMemo } from "react";

import { useSessionContext } from "@/features/auth/hooks";

import { departmentLocks } from "./department-form";

/**
 * Departments the signed-in admin may not add or remove (escalation guard, PD-041). In Cài đặt › Thành viên
 * (`retouchNeedsProductionAdmin`) Photo Retouch also needs production ADMIN, since it carries production roles.
 */
export const useDepartmentLocks = (options: { retouchNeedsProductionAdmin?: boolean } = {}) => {
  const { departments, hasFullOrganizationAuthority, productionRoles } = useSessionContext();
  const retouchNeedsProductionAdmin = options.retouchNeedsProductionAdmin ?? false;
  return useMemo(
    () =>
      departmentLocks(
        { departments, hasFullOrganizationAuthority, productionRoles },
        { retouchNeedsProductionAdmin }
      ),
    [departments, hasFullOrganizationAuthority, productionRoles, retouchNeedsProductionAdmin]
  );
};
