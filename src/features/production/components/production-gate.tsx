import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/states";
import type { FeaturePermissionKey, ProductionRole } from "@/contracts/production-catalog";

import { featureLabels } from "../feature-permissions";
import { useProductionAccess } from "../hooks";
import { productionRoleLabels } from "../roles";

const NoAccess = ({ description }: { description: string }) => (
  <div className="flex h-full items-center justify-center p-4">
    <EmptyState
      icon={ShieldAlert}
      title="Bạn không có quyền xem trang này"
      description={description}
    />
  </div>
);

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
    <NoAccess
      description={`Trang này dành cho vai trò: ${names}. Liên hệ Quản trị Photo Retouch nếu bạn cần quyền.`}
    />
  );
};

/**
 * Page-level feature gate (PD-065): the page opens for whoever holds `feature` ("Quyền theo tính năng", Cài đặt →
 * Vai trò & phân quyền). UX only: the API answers 403 to the same users.
 */
export const RequireProductionFeature = ({
  feature,
  children
}: {
  feature: FeaturePermissionKey;
  children: ReactNode;
}) => {
  const access = useProductionAccess();
  if (access.hasFeature(feature)) {
    return <>{children}</>;
  }
  return <ProductionFeatureForbidden feature={feature} />;
};

/** The "không có quyền" state of a page that needs `feature` (PD-065). */
export const ProductionFeatureForbidden = ({ feature }: { feature: FeaturePermissionKey }) => (
  <NoAccess
    description={`Trang này cần quyền “${featureLabels[feature]}”. Liên hệ Siêu quản trị nếu bạn cần quyền.`}
  />
);
