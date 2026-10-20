import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/components/shared/router-link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSessionContext } from "@/features/auth/hooks";
import { useProductionAccess, useProductionMe } from "@/features/production/hooks";
import { closeDayLabel, closeDaySchedule } from "@/features/production/format";
import { MySettlements } from "@/features/production/kpi/components/my-settlements";
import { PageBody } from "@/features/production/scores/components/kit";
import { ScoresOverview } from "@/features/production/scores/components/scores-overview";
import { TeamBoard } from "@/features/production/scores/components/team-board";
import { useScoresPageState, type ScoresTab } from "@/features/production/scores/page-state";
import { formatPeriod } from "@/features/production/scores/periods";
import { useBreakpoint } from "@/hooks/use-breakpoint";

/**
 * /production/scores — "Bảng điểm" (SPEC Phase 3 §5). "Tổng quan": personal today / week / period cards, the Khoán
 * money provisional card (owner only, as returned by the API), the KPI forecast with "Nếu chốt hôm nay" (PD-066), daily
 * chart and the ledger; "Kết quả chốt" lists the caller's own settlements (Phase 6 §4); "Toàn đội" (PD-069, ?tab=team)
 * everyone's official points, KPI and % reached — only for "Xem điểm người khác" (PD-065), the tab is hidden for others
 * (and ?tab=team falls back to "Tổng quan"). ?period=YYYY-MM is shared by the tabs. The same personal content for anyone
 * else is their "Điểm cá nhân" (/production/scores/person/:userId, PD-052).
 */
export const ProductionScoresRoute = () => {
  const session = useSessionContext();
  const me = useProductionMe();
  const access = useProductionAccess();
  const breakpoint = useBreakpoint();
  const state = useScoresPageState();
  const { change } = state;
  const teamAllowed = access.hasFeature("view_others_scores");
  // Until /production/me answers, the tab asked for stays (no flash of "Tổng quan"); then only with the feature.
  const tab: ScoresTab =
    state.tab === "team" && !teamAllowed && !me.isPending ? "overview" : state.tab;
  const team = tab === "team";

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
        title={team ? "Điểm toàn đội" : "Bảng điểm của tôi"}
        description={
          breakpoint === "mobile"
            ? undefined
            : team
              ? "Điểm chính thức của mọi người trong kỳ, KPI của từng người (tính như khi chốt) và % đạt."
              : `Điểm, tiền Khoán tạm tính và tiến độ KPI. Kỳ KPI chốt ${closeDaySchedule(state.closeDay)}${change ? `; từ kỳ ${formatPeriod(change.fromPeriod)} chốt ${closeDayLabel(change.closeDay)}` : ""}.`
        }
      >
        <ScoresTabs tab={tab} onChange={state.setTab} showTeam={teamAllowed} />
      </PageHeader>

      <PageBody>
        {tab === "settled" ? (
          <MySettlements userId={session.user.id} currentPeriod={state.current} />
        ) : team ? (
          me.isPending ? null : (
            <TeamBoard
              meId={session.user.id}
              period={state.period}
              current={state.current}
              closeDays={state.closeDays}
              onPeriodChange={state.setPeriod}
            />
          )
        ) : (
          <ScoresOverview
            userId={null}
            period={state.period}
            current={state.current}
            closeDays={state.closeDays}
            today={state.today}
            onPeriodChange={state.setPeriod}
          />
        )}
      </PageBody>
    </div>
  );
};

/**
 * "Tổng quan" / "Kết quả chốt" under the page header (also on "Điểm cá nhân"), plus "Toàn đội" on "Bảng điểm" for
 * holders of "Xem điểm người khác" (`showTeam`, PD-069).
 */
export const ScoresTabs = ({
  tab,
  onChange,
  showTeam = false
}: {
  tab: ScoresTab;
  onChange: (tab: ScoresTab) => void;
  showTeam?: boolean;
}) => (
  <Tabs
    value={tab}
    onValueChange={(value) =>
      onChange(value === "settled" ? "settled" : value === "team" && showTeam ? "team" : "overview")
    }
  >
    <TabsList variant="line" className="-mb-3 h-9">
      <TabsTrigger value="overview" className="max-sm:min-h-10">
        Tổng quan
      </TabsTrigger>
      <TabsTrigger value="settled" className="max-sm:min-h-10">
        Kết quả chốt
      </TabsTrigger>
      {showTeam ? (
        <TabsTrigger value="team" className="max-sm:min-h-10">
          Toàn đội
        </TabsTrigger>
      ) : null}
    </TabsList>
  </Tabs>
);
