import { useState } from "react";

import { PageIntro, SettingsPage } from "@/features/production/components/settings-kit";
import { todayIn } from "@/features/production/format";
import { useProductionMe } from "@/features/production/hooks";
import { KpiReportPanel } from "@/features/production/kpi/components/kpi-report";
import { SettlementRunPanel } from "@/features/production/kpi/components/settlement-run";
import { SettlementRuns } from "@/features/production/kpi/components/settlement-runs";
import { periodOfDay, shiftPeriod } from "@/features/production/scores/periods";

/**
 * /production/settings/kpi-settlement (ADMIN) — SPEC Phase 6: run the settlement of a period (reason
 * + confirmation), the run history, and the KPI report with quarter/year rollups and Excel export.
 */
export const ProductionKpiSettlementRoute = () => {
  const me = useProductionMe();
  const settings = me.data?.settings;
  const closeDay = settings?.kpiCloseDay ?? 25;
  const today = todayIn(settings?.timezone ?? "Asia/Ho_Chi_Minh");
  const currentPeriod = periodOfDay(today, closeDay);
  const [focus, setFocus] = useState(shiftPeriod(currentPeriod, -1));

  return (
    <SettingsPage wide className="max-w-[min(100%,80rem)]">
      <PageIntro slug="kpi-settlement" />
      <SettlementRunPanel currentPeriod={currentPeriod} closeDay={closeDay} onDone={setFocus} />
      <KpiReportPanel key={focus} currentPeriod={currentPeriod} focusPeriod={focus} />
      <SettlementRuns />
    </SettingsPage>
  );
};
