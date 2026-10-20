import type { KpiTargetsMissing } from "@/contracts/production-scores";

import { productionRoleLabels } from "../roles";

/** One person without a KPI for the period (PD-066), as the notice lists them. */
export type MissingPerson = {
  id: string;
  displayName: string;
  avatarUrl?: string | null | undefined;
  /** Roles · team, as a hint. */
  detail?: string | undefined;
};

/** The people of GET /production/kpi-targets/missing, with their roles and team as a hint. */
export const missingPeopleOf = (missing: KpiTargetsMissing): MissingPerson[] =>
  missing.items.map((item) => ({
    id: item.user.id,
    displayName: item.user.displayName,
    avatarUrl: item.user.avatarUrl,
    detail: [item.roles.map((role) => productionRoleLabels[role]).join(", "), item.teamName]
      .filter(Boolean)
      .join(" · ")
  }));
