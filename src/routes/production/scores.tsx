import { ChevronLeft, Trophy } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/components/shared/router-link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSessionContext } from "@/features/auth/hooks";
import { useProductionAccess } from "@/features/production/hooks";
import { RANKING_VISIBLE } from "@/features/production/nav";
import { closeDayLabel, closeDaySchedule } from "@/features/production/format";
import { MySettlements } from "@/features/production/kpi/components/my-settlements";
import { PageBody } from "@/features/production/scores/components/kit";
import { ScoresOverview } from "@/features/production/scores/components/scores-overview";
import { useScoresPageState, type ScoresTab } from "@/features/production/scores/page-state";
import { formatPeriod } from "@/features/production/scores/periods";
import { useBreakpoint } from "@/hooks/use-breakpoint";

/**
 * /production/scores — personal scores (SPEC Phase 3 §5): today / week / period cards, the Khoán
 * money provisional card (owner only, as returned by the API), the KPI forecast, daily chart and the
 * ledger; "Kết quả chốt" lists the caller's own settlements (Phase 6 §4). ?period=YYYY-MM&tab=settled.
 * The same content for anyone else is their "Điểm cá nhân" (/production/scores/person/:userId, PD-052).
 */
export const ProductionScoresRoute = () => {
  const session = useSessionContext();
  const access = useProductionAccess();
  const breakpoint = useBreakpoint();
  const state = useScoresPageState();
  const { change } = state;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow={
          <Link
            to="/production"
            className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-3 max-sm:py-3 max-sm:pr-3"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Photo Retouch
          </Link>
        }
        title="Bảng điểm của tôi"
        description={
          breakpoint === "mobile"
            ? undefined
            : `Điểm, tiền Khoán tạm tính và tiến độ KPI. Kỳ KPI chốt ${closeDaySchedule(state.closeDay)}${change ? `; từ kỳ ${formatPeriod(change.fromPeriod)} chốt ${closeDayLabel(change.closeDay)}` : ""}.`
        }
        actions={
          // The ranking is hidden for now (owner, 2026-10-16; RANKING_VISIBLE); PD-065: it needs "Xem điểm người khác".
          RANKING_VISIBLE && access.hasFeature("view_others_scores") ? (
            <Button
              variant="outline"
              render={<Link to="/production/scores/board" />}
              nativeButton={false}
            >
              <Trophy />
              <span className="max-sm:sr-only">Xếp hạng</span>
            </Button>
          ) : null
        }
      >
        <ScoresTabs tab={state.tab} onChange={state.setTab} />
      </PageHeader>

      <PageBody>
        {state.tab === "settled" ? (
          <MySettlements
            userId={session.user.id}
            currentPeriod={state.current}
            khoanPolicy={state.khoanPolicy}
          />
        ) : (
          <ScoresOverview
            userId={null}
            period={state.period}
            current={state.current}
            closeDays={state.closeDays}
            today={state.today}
            khoanPolicy={state.khoanPolicy}
            onPeriodChange={state.setPeriod}
          />
        )}
      </PageBody>
    </div>
  );
};

/** "Tổng quan" / "Kết quả chốt" under the page header (also on "Điểm cá nhân"). */
export const ScoresTabs = ({
  tab,
  onChange
}: {
  tab: ScoresTab;
  onChange: (tab: ScoresTab) => void;
}) => (
  <Tabs
    value={tab}
    onValueChange={(value) => onChange(value === "settled" ? "settled" : "overview")}
  >
    <TabsList variant="line" className="-mb-3 h-9">
      <TabsTrigger value="overview" className="max-sm:min-h-10">
        Tổng quan
      </TabsTrigger>
      <TabsTrigger value="settled" className="max-sm:min-h-10">
        Kết quả chốt
      </TabsTrigger>
    </TabsList>
  </Tabs>
);
