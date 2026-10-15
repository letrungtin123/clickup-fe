import { ChartColumnBig, ChevronLeft, Trophy, UserX } from "lucide-react";
import { Navigate, useLocation, useParams } from "react-router";

import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/components/shared/router-link";
import { EmptyState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { kpiPeriodRange } from "@/contracts/production-scores";
import { useSessionContext } from "@/features/auth/hooks";
import { MySettlements } from "@/features/production/kpi/components/my-settlements";
import { PageBody, Panel } from "@/features/production/scores/components/kit";
import { ScoresOverview } from "@/features/production/scores/components/scores-overview";
import { useScores } from "@/features/production/scores/hooks";
import { useScoresPageState } from "@/features/production/scores/page-state";
import { boardPath } from "@/features/production/scores/person-link";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { isNotFoundError } from "@/lib/api/errors";

import { ScoresTabs } from "./scores";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /production/scores/person/:userId — "Điểm cá nhân" (PD-052): what "Bảng điểm của tôi" shows its owner, for any
 * Photo Retouch member, opened from the ranking (?period=YYYY-MM&tab=settled like /production/scores). Money
 * appears only where the API sent it (the viewer is an Admin, or settings.moneyPublic). Your own id redirects to
 * /production/scores; someone outside Photo Retouch (404) gets a not-found state with the way back.
 */
export const ProductionScorePersonRoute = () => {
  const { userId: param } = useParams();
  const location = useLocation();
  const session = useSessionContext();
  const breakpoint = useBreakpoint();
  const state = useScoresPageState();
  const userId = param && uuidPattern.test(param) ? param.toLowerCase() : null;
  const own = userId === session.user.id;
  // Who the person is: the first page of their scores for the period ("Tổng quan" reads the same query).
  const head = useScores(
    userId,
    kpiPeriodRange(state.period, state.closeDays),
    userId !== null && !own
  );
  const person = head.data?.pages[0];
  const back = boardPath(state.period === state.current ? null : state.period);

  if (own) {
    return <Navigate to={{ pathname: "/production/scores", search: location.search }} replace />;
  }
  const missing = userId === null || (head.isError && isNotFoundError(head.error));
  const name = person?.user?.displayName ?? null;
  const details = [
    person ? (person.teamName ?? "Chưa có team") : null,
    person && person.moneyVisible === false && breakpoint !== "mobile"
      ? "Tiền Khoán của người này chỉ chính chủ và Quản trị xem được"
      : null
  ].filter(Boolean);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow={
          <Link
            to={back}
            className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-3 max-sm:py-3 max-sm:pr-3"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Xếp hạng
          </Link>
        }
        leading={
          person?.user ? (
            <UserAvatar user={person.user} size={breakpoint === "mobile" ? "md" : "lg"} />
          ) : null
        }
        title={
          <span className="line-clamp-2 whitespace-normal break-words">
            {name ? `Điểm cá nhân · ${name}` : "Điểm cá nhân"}
          </span>
        }
        description={details.length > 0 ? `${details.join(" · ")}.` : undefined}
        actions={
          <Button variant="outline" render={<Link to="/production/scores" />} nativeButton={false}>
            <ChartColumnBig />
            <span className="max-sm:sr-only">Bảng điểm của tôi</span>
          </Button>
        }
      >
        {missing ? null : <ScoresTabs tab={state.tab} onChange={state.setTab} />}
      </PageHeader>

      <PageBody>
        {missing || userId === null ? (
          <Panel>
            <EmptyState
              icon={UserX}
              title="Không tìm thấy nhân viên"
              description="Người này không còn trong Photo Retouch hoặc đường dẫn không đúng."
              action={
                <Button render={<Link to={back} />} nativeButton={false}>
                  <Trophy />
                  Về Xếp hạng
                </Button>
              }
            />
          </Panel>
        ) : state.tab === "settled" ? (
          <MySettlements
            userId={userId}
            self={false}
            currentPeriod={state.current}
            khoanPolicy={state.khoanPolicy}
          />
        ) : (
          <ScoresOverview
            userId={userId}
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
