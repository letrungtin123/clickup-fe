import {
  featurePermissionKeys,
  productionRoleCodes,
  type FeaturePermissionKey,
  type ProductionRole
} from "@/contracts/production-catalog";
import { featureDescriptions, featureLabels } from "@/features/production/feature-permissions";

/**
 * Rows of the Photo Retouch matrix on Cài đặt → Vai trò & phân quyền below the job permissions:
 *   - "Quyền theo tính năng" (PD-065): one editable row per feature (`featurePermissions`, superadmin only, PD-050);
 *   - the rules that stay fixed by role (read-only): "Cấu hình Photo Retouch" — mirrors the API (configuration writes
 *     are superadmin only since PD-050) and the settings pages' roles in `features/production/nav.ts`.
 */

/** A fixed cell: has it, does not, or only partly (the note says how). */
export type RuleCell = boolean | { partial: string };

export type RetouchRule = {
  id: string;
  label: string;
  description: string;
  cells: Record<ProductionRole, RuleCell>;
};

/** Columns of the Photo Retouch matrix, in order (ADMIN first, DIRECTOR last). */
export const retouchColumns: readonly ProductionRole[] = productionRoleCodes;

export type FeatureRow = {
  feature: FeaturePermissionKey;
  label: string;
  description: string;
};

/** The editable feature rows, in page order (the contract's order). */
export const retouchFeatureRows = (): FeatureRow[] => {
  const descriptions = featureDescriptions();
  return featurePermissionKeys.map((feature) => ({
    feature,
    label: featureLabels[feature],
    description: descriptions[feature]
  }));
};

const workflowOnly = { partial: "Chỉ xem Trạng thái & luồng chuyển" };

/** The rules that stay fixed by role, in page order. */
export const retouchFixedRules = (): RetouchRule[] => [
  {
    id: "settings",
    label: "Cấu hình Photo Retouch",
    description:
      "Cấu hình Photo Retouch: chỉ Siêu quản trị sửa; Quản trị xem mọi trang, Account xem Khách hàng, mọi vai trò xem Trạng thái & luồng chuyển.",
    cells: {
      ADMIN: { partial: "Chỉ xem" },
      ACCOUNT: { partial: "Xem Khách hàng, Trạng thái & luồng chuyển" },
      LEADER: workflowOnly,
      QC: workflowOnly,
      STAFF: workflowOnly,
      DIRECTOR: workflowOnly
    }
  }
];
