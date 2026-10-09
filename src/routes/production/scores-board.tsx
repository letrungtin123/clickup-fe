import { ChartColumnBig, ChevronLeft, EyeOff, Trophy, UsersRound } from "lucide-react";
import { Link, useSearchParams } from "react-router";

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
import {
  PageBody,
  Panel,
  PeriodPicker,
  TeamSelect
} from "@/features/production/scores/components/kit";
import { isScoresPrivate } from "@/features/production/scores/errors";
import { useScoreBoard } from "@/features/production/scores/hooks";
import { isPeriod, periodLabel, periodOfDay } from "@/features/production/scores/periods";
import { useBreakpoint } from "@/hooks/use-breakpoint";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /production/scores/board — ranking by official points for a period and team (SPEC Phase 3 §5).
 * Private board (settings.scoresPublic off, not ADMIN) → the API answers 403 and the page shows the
 * private state; money appears only where the API sent it. Excel via GET …/board/export (link).
 */
export const ProductionScoreBoardRoute = () => {
  const me = useProductionMe();
  const access = useProductionAccess();
  const session = useSessionContext();
  const breakpoint = useBreakpoint();
  const [params, setParams] = useSearchParams();

  const settings = me.data?.settings;
  const closeDay = settings?.kpiCloseDay ?? 25;
  const today = todayIn(settings?.timezone ?? "Asia/Ho_Chi_Minh");
  const current = periodOfDay(today, closeDay);
  const requested = params.get("period");
  const period = isPeriod(requested) && requested <= current ? requested : current;
  const teamParam = params.get("team");
  const teamId = teamParam && uuidPattern.test(teamParam) ? teamParam : null;
  const board = useScoreBoard(period, teamId);
  const isPrivate = board.isError && isScoresPrivate(board.error);

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
            Sản xuất
          </Link>
        }
        title="Xếp hạng"
        description={
          breakpoint === "mobile"
            ? undefined
            : showMoney
              ? "Xếp theo điểm chính thức của kỳ. Bạn đang xem cả tiền Khoán của mọi người."
              : "Xếp theo điểm chính thức của kỳ. Điểm công khai; tiền Khoán chỉ chính chủ và Quản trị thấy."
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
                fallbackName={`bang-diem-${period}.xlsx`}
              />
            ) : null}
          </>
        }
      />
      <PageBody>
        {isPrivate ? (
          <Panel>
            <EmptyState
              icon={EyeOff}
              title="Bảng xếp hạng đang ở chế độ riêng tư"
              description="Quản trị đã tắt công khai bảng điểm chung. Bạn vẫn xem được điểm và dự báo KPI của mình."
              action={
                <Button render={<Link to="/production/scores" />} nativeButton={false}>
                  <ChartColumnBig />
                  Bảng điểm của tôi
                </Button>
              }
            />
          </Panel>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodPicker
                value={period}
                onChange={(next) => update({ period: next === current ? null : next })}
                latest={current}
                closeDay={closeDay}
              />
              <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                <TeamSelect value={teamId} onChange={(next) => update({ team: next })} />
                {board.isFetching && !board.isPending ? (
                  <Spinner className="size-4 shrink-0 text-foreground-muted" />
                ) : null}
              </div>
            </div>

            {board.isPending ? (
              <BoardSkeleton />
            ) : board.isError ? (
              <Panel>
                <ErrorState error={board.error} onRetry={() => void board.refetch()} retrying={board.isFetching} />
              </Panel>
            ) : rows.length === 0 ? (
              <Panel>
                <EmptyState
                  icon={UsersRound}
                  title="Không có ai trong bảng"
                  description={teamId ? "Team này chưa có thành viên làm việc. Thử chọn team khác." : "Chưa có nhân viên sản xuất nào."}
                />
              </Panel>
            ) : (
              <>
                <Podium rows={rows} meId={session.user.id} />
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
                          <span className="font-medium text-foreground">{formatMoney(own.money)}</span>
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
                  description={`${rows.length} người${access.isAdmin && !(me.data?.settings.scoresPublic ?? true) ? " · Bảng đang riêng tư, chỉ Quản trị xem được" : ""}`}
                >
                  <BoardTable rows={rows} meId={session.user.id} showMoney={showMoney} />
                </Panel>
              </>
            )}
          </>
        )}
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
