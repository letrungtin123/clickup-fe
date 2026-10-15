import { ChartColumnBig, ChevronLeft, Trophy, UsersRound } from "lucide-react";
import { useSearchParams } from "react-router";
import { Link } from "@/components/shared/router-link";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useSessionContext } from "@/features/auth/hooks";
import { formatCredit, formatInteger, formatMoney, todayIn } from "@/features/production/format";
import { useProductionAccess, useProductionMe } from "@/features/production/hooks";
import { BoardTable, Podium } from "@/features/production/scores/components/board";
import { ExportButton } from "@/features/production/scores/components/export-button";
import { PeopleFilterButton } from "@/features/production/scores/components/people-filter";
import {
  PageBody,
  Panel,
  PeriodPicker,
  TeamSelect
} from "@/features/production/scores/components/kit";
import { useScoreBoard } from "@/features/production/scores/hooks";
import {
  emptyPeopleFilter,
  isPeopleFilterEmpty,
  peopleFilterFromParams,
  peopleFilterPairs,
  withPeopleFilterParams,
  type PeopleFilter
} from "@/features/production/scores/people-filter";
import { personScoresPath } from "@/features/production/scores/person-link";
import { closeDaysOf, isPeriod, periodLabel } from "@/features/production/scores/periods";
import { kpiPeriodOfDay } from "@/contracts/production-scores";
import { useBreakpoint } from "@/hooks/use-breakpoint";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /production/scores/board — ranking by official points for a period and team (SPEC Phase 3 §5), open to
 * every Photo Retouch member (PD-052, whatever settings.scoresPublic says). Each person opens their "Điểm cá
 * nhân" (/production/scores/person/:userId, your own row → /production/scores) for the same period. Money
 * appears only where the API sent it. Excel via GET …/board/export (link). ADMIN also filters people by
 * members' custom fields (e.g. Năng lực) and tags: ?cf.<key>=…&tag=….
 */
export const ProductionScoreBoardRoute = () => {
  const me = useProductionMe();
  const access = useProductionAccess();
  const session = useSessionContext();
  const breakpoint = useBreakpoint();
  const [params, setParams] = useSearchParams();

  const settings = me.data?.settings;
  const closeDays = closeDaysOf(settings);
  const today = todayIn(settings?.timezone ?? "Asia/Ho_Chi_Minh");
  const current = kpiPeriodOfDay(today, closeDays);
  const requested = params.get("period");
  const period = isPeriod(requested) && requested <= current ? requested : current;
  const teamParam = params.get("team");
  const teamId = teamParam && uuidPattern.test(teamParam) ? teamParam : null;
  // Members' tags / custom values are Admin data (others get 403): the filter is ADMIN only.
  const people: PeopleFilter = access.isAdmin ? peopleFilterFromParams(params) : emptyPeopleFilter;
  const board = useScoreBoard(period, teamId, people);
  const hrefOf = (userId: string) =>
    personScoresPath(userId, session.user.id, period === current ? null : period);

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );

  const rows = board.data?.items ?? [];
  const own = rows.find((row) => row.user.id === session.user.id) ?? null;
  const showMoney = board.data?.moneyVisible ?? false;

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
        title="Xếp hạng"
        description={
          breakpoint === "mobile"
            ? undefined
            : showMoney
              ? "Xếp theo điểm chính thức của kỳ. Bấm vào một người để xem Điểm cá nhân; bạn đang xem cả tiền Khoán của mọi người."
              : "Xếp theo điểm chính thức của kỳ. Bấm vào một người để xem Điểm cá nhân; tiền Khoán chỉ chính chủ và Quản trị thấy."
        }
        actions={
          <>
            <Button
              variant="outline"
              render={<Link to="/production/scores" />}
              nativeButton={false}
            >
              <ChartColumnBig />
              <span className="max-sm:sr-only">Bảng điểm của tôi</span>
            </Button>
            {board.data ? (
              <ExportButton
                path="/production/scores/board/export"
                query={{ period, teamId }}
                extra={peopleFilterPairs(people)}
                fallbackName={`bang-diem-${period}.xlsx`}
              />
            ) : null}
          </>
        }
      />
      <PageBody>
        <>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodPicker
              value={period}
              onChange={(next) => update({ period: next === current ? null : next })}
              latest={current}
              closeDays={closeDays}
            />
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              <TeamSelect
                value={teamId}
                onChange={(next) => update({ team: next })}
                className="max-sm:flex-1"
              />
              {access.isAdmin ? (
                <PeopleFilterButton
                  value={people}
                  onChange={(next) =>
                    setParams((previous) => withPeopleFilterParams(previous, next), {
                      replace: true
                    })
                  }
                  className="max-sm:flex-1"
                />
              ) : null}
              {board.isFetching && !board.isPending ? (
                <Spinner className="size-4 shrink-0 text-foreground-muted" />
              ) : null}
            </div>
          </div>

          {board.isPending ? (
            <BoardSkeleton />
          ) : board.isError ? (
            <Panel>
              <ErrorState
                error={board.error}
                onRetry={() => void board.refetch()}
                retrying={board.isFetching}
              />
            </Panel>
          ) : rows.length === 0 ? (
            <Panel>
              <EmptyState
                icon={UsersRound}
                title="Không có ai trong bảng"
                description={
                  !isPeopleFilterEmpty(people)
                    ? "Không có ai khớp bộ lọc nhân viên. Bỏ bớt điều kiện ở “Lọc nhân viên”."
                    : teamId
                      ? "Team này chưa có thành viên làm việc. Thử chọn team khác."
                      : "Chưa có nhân viên Photo Retouch nào."
                }
              />
            </Panel>
          ) : (
            <>
              <Podium rows={rows} meId={session.user.id} hrefOf={hrefOf} />
              {own ? (
                <section
                  aria-label="Vị trí của bạn"
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-brand/30 bg-brand-soft/50 px-4 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar user={own.user} size="md" />
                    <span className="flex flex-col">
                      <span className="text-xs text-foreground-muted">Vị trí của bạn</span>
                      <span className="text-sm font-semibold">
                        Hạng {own.rank}/{rows.length} · {formatCredit(own.pointsOfficial)} điểm
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-muted tabular-nums sm:ml-auto">
                    <span>
                      Khoán {formatCredit(own.pointsKhoan)} điểm · {formatInteger(own.qtyKhoan)} tấm
                    </span>
                    {own.money !== null ? (
                      <span>
                        Tiền Khoán tạm tính{" "}
                        <span className="font-medium text-foreground">
                          {formatMoney(own.money)}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </section>
              ) : null}
              <Panel
                title={
                  <span className="flex items-center gap-1.5">
                    <Trophy className="size-4 text-foreground-muted" aria-hidden="true" />
                    {periodLabel(period)}
                  </span>
                }
                description={`${rows.length} người${isPeopleFilterEmpty(people) ? "" : " · đang lọc nhân viên, hạng tính trong nhóm đã lọc"}`}
              >
                <BoardTable
                  rows={rows}
                  meId={session.user.id}
                  showMoney={showMoney}
                  hrefOf={hrefOf}
                />
              </Panel>
            </>
          )}
        </>
      </PageBody>
    </div>
  );
};

const BoardSkeleton = () => (
  <div className="flex flex-col gap-4" aria-hidden="true">
    <div className="grid grid-cols-3 gap-3">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-36 rounded-xl" />
      ))}
    </div>
    <div className="flex flex-col gap-2 rounded-xl border bg-surface p-4">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <Skeleton key={index} className="h-9" />
      ))}
    </div>
  </div>
);
