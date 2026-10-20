import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router";

import { kpiPeriodOfDay } from "@/contracts/production-scores";
import { PageIntro, SettingsPage } from "@/features/production/components/settings-kit";
import { useCanEditProductionConfig } from "@/features/production/config-access";
import { todayIn } from "@/features/production/format";
import { useProductionMe } from "@/features/production/hooks";
import { KpiReportPanel } from "@/features/production/kpi/components/kpi-report";
import { kpiReportAnchor } from "@/features/production/kpi/report";
import { SettlementRunPanel } from "@/features/production/kpi/components/settlement-run";
import { SettlementRuns } from "@/features/production/kpi/components/settlement-runs";
import { closeDaysOf, isPeriod, shiftPeriod } from "@/features/production/scores/periods";

/**
 * /production/settings/kpi-settlement (ADMIN) — SPEC Phase 6: run the settlement of a period (reason
 * + confirmation), the run history, and the KPI report with quarter/year rollups, team totals and Excel
 * export. `?period=YYYY-MM` opens the report on that period; `#bao-cao-kpi` scrolls to it. PD-050: only the
 * organization superadmin runs / re-runs a period; everyone else keeps the report, its export and the history.
 */
export const ProductionKpiSettlementRoute = () => {
  const canEdit = useCanEditProductionConfig();
  const me = useProductionMe();
  const location = useLocation();
  const [params] = useSearchParams();
  const settings = me.data?.settings;
  const closeDays = closeDaysOf(settings);
  const today = todayIn(settings?.timezone ?? "Asia/Ho_Chi_Minh");
  const currentPeriod = kpiPeriodOfDay(today, closeDays);
  const requested = params.get("period");
  const [focus, setFocus] = useState(() =>
    isPeriod(requested) && requested <= currentPeriod ? requested : shiftPeriod(currentPeriod, -1)
  );
  const reportRef = useRef<HTMLDivElement>(null);
  const wantsReport = location.hash === `#${kpiReportAnchor}`;

  useEffect(() => {
    if (!wantsReport) return;
    const frame = window.requestAnimationFrame(() =>
      reportRef.current?.scrollIntoView({ block: "start" })
    );
    return () => window.cancelAnimationFrame(frame);
  }, [wantsReport]);

  return (
    <SettingsPage wide className="max-w-[min(100%,80rem)]">
      <PageIntro slug="kpi-settlement" />
      <SettlementRunPanel
        readOnly={!canEdit}
        currentPeriod={currentPeriod}
        closeDays={closeDays}
        onDone={setFocus}
      />
      <div ref={reportRef} id={kpiReportAnchor} className="scroll-mt-4">
        <KpiReportPanel key={focus} currentPeriod={currentPeriod} focusPeriod={focus} />
      </div>
      <SettlementRuns />
    </SettingsPage>
  );
};
