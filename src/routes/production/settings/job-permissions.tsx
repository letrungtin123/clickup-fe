import { useEffect } from "react";
import { Navigate } from "react-router";

import { useDepartment } from "@/features/departments/hooks";

/**
 * The old "Cấu hình → Phân quyền Job" page (PD-036). The matrix lives on Cài đặt → Vai trò & phân quyền now
 * (PD-042), which follows the current department: switch to Photo Retouch (when the user belongs to it) and go there.
 */
export const ProductionJobPermissionsRoute = () => {
  const { current, departments, setDepartment } = useDepartment();
  const switchTo = current !== "PHOTO_RETOUCH" && departments.includes("PHOTO_RETOUCH");
  useEffect(() => {
    if (switchTo) setDepartment("PHOTO_RETOUCH");
  }, [setDepartment, switchTo]);
  return <Navigate to="/settings/roles" replace />;
};
