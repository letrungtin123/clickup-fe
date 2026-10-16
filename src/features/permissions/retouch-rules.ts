import {
  featurePermissionKeys,
  productionRoleCodes,
  type FeaturePermissionKey,
  type ProductionRole
} from "@/contracts/production-catalog";
import {
  featureDescriptions,
  featureLabels,
  type FeatureSettings
} from "@/features/production/feature-permissions";
import { RANKING_VISIBLE } from "@/features/production/nav";

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

/** The public settings of Cấu hình → Cài đặt chung that the rows' help depends on. */
export type RetouchPublicSettings = FeatureSettings;

export type FeatureRow = {
  feature: FeaturePermissionKey;
  label: string;
  description: string;
};

/** Added to "Xem điểm người khác" while the ranking is hidden (RANKING_VISIBLE, owner 2026-10-16). */
export const rankingHiddenNote =
  "Xếp hạng và Điểm cá nhân của người khác đang ẩn khỏi menu, chỉ mở bằng đường dẫn.";

/** The editable feature rows, in page order (the contract's order). */
export const retouchFeatureRows = (settings: RetouchPublicSettings = {}): FeatureRow[] => {
  const descriptions = featureDescriptions(settings);
  return featurePermissionKeys.map((feature) => ({
    feature,
    label: featureLabels[feature],
    description:
      feature === "view_others_scores" && !RANKING_VISIBLE
        ? `${descriptions[feature]} ${rankingHiddenNote}`
        : descriptions[feature]
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
