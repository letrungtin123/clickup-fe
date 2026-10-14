import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/states";
import type { ProductionRole } from "@/contracts/production-catalog";

import { useProductionAccess } from "../hooks";
import { productionRoleLabels } from "../roles";

/**
 * Page-level role gate inside the production module (the module itself is gated by the route
 * layout). UX only: the API answers 403 to the same users.
 */
export const RequireProductionRole = ({
  roles,
  children
}: {
  roles: readonly ProductionRole[];
  children: ReactNode;
}) => {
  const access = useProductionAccess();
  if (access.can(...roles)) {
    return <>{children}</>;
  }
  const names = [...new Set<ProductionRole>(["ADMIN", ...roles])]
    .map((role) => productionRoleLabels[role])
    .join(", ");
  return (
    <div className="flex h-full items-center justify-center p-4">
      <EmptyState
        icon={ShieldAlert}
        title="Bạn không có quyền xem trang này"
        description={`Trang này dành cho vai trò: ${names}. Liên hệ Quản trị Photo Retouch nếu bạn cần quyền.`}
      />
    </div>
  );
};
