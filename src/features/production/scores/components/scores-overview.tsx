import { cn } from "cn";
import { CalendarDays, CalendarRange, Coins, Sun } from "lucide-react";
import { lazy, Suspense } from "react";

import { ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  kpiPeriodRange,
  type KpiCloseDays,
  type ScoreEntryView,
  type ScoreTotalsView
} from "@/contracts/production-scores";

import { formatCredit, formatInteger, formatMoney } from "../../format";
import { flattenPages } from "../../jobs-model";
import { useForecastOf, useScores, type ScoresView } from "../hooks";
import { periodLabel } from "../periods";
import { EntriesList, type EntriesPaging } from "./entries-list";
import { ForecastPanel, ForecastSkeleton } from "./forecast-panel";
import { Panel, PeriodPicker, StatCard } from "./kit";

const DailyPointsChart = lazy(() =>
  import("./daily-chart").then((module) => ({ default: module.DailyPointsChart }))
);

/**
 * "Tổng quan" of a scores page (SPEC Phase 3 §5) for one person: the KPI forecast (with "Nếu chốt hôm nay"), today /
 * week / period cards, "Tiền Khoán tạm tính" (or, when hidden, the Khoán images), daily chart, projects and the ledger.
 * `userId` null = the signed-in user (/production/scores); otherwise that member's "Điểm cá nhân" (PD-052), where money
 * appears only if the API sent it (their own, or "Xem tiền Khoán người khác"). PD-066: points are official points;
 * Khoán is shown as money only — never "điểm Khoán".
 */
export const ScoresOverview = ({
  userId,
  period,
  current,
  closeDays,
  today,
  onPeriodChange
}: {
  userId: string | null;
  period: string;
  current: string;
  closeDays: KpiCloseDays;
  today: string;
  onPeriodChange: (period: string) => void;
}) => {
  const range = kpiPeriodRange(period, closeDays);
  const scores = useScores(userId, range);
  const forecast = useForecastOf(userId, period);
  const fetching =
    (scores.isFetching && !scores.isPending) || (forecast.isFetching && !forecast.isPending);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodPicker
          value={period}
          onChange={onPeriodChange}
          latest={current}
          closeDays={closeDays}
        />
        {fetching ? <Spinner className="size-4 text-foreground-muted" /> : null}
      </div>

      {forecast.isPending ? (
        <ForecastSkeleton />
      ) : forecast.isError ? (
        <Panel>
          <ErrorState
            size="sm"
            error={forecast.error}
            onRetry={() => void forecast.refetch()}
            retrying={forecast.isFetching}
          />
        </Panel>
      ) : (
        <ForecastPanel forecast={forecast.data} />
      )}

      {scores.isPending ? (
        <CardsSkeleton />
      ) : scores.isError ? (
        <Panel>
          <ErrorState
            error={scores.error}
            onRetry={() => void scores.refetch()}
            retrying={scores.isFetching}
          />
        </Panel>
      ) : (
        <ScoresContent
          data={scores.data.pages[0]!}
          entries={flattenPages(scores.data.pages.map((page) => ({ items: page.entries })))}
          paging={{
            hasMore: scores.hasNextPage,
            loading: scores.isFetchingNextPage,
            failed: scores.isFetchNextPageError,
            loadMore: () => void scores.fetchNextPage()
          }}
          period={period}
          isCurrent={period === current}
          today={today}
          self={userId === null}
        />
      )}
    </>
  );
};

/** The Khoán work of a card as money (or images while the money is hidden) — never as points (PD-066). */
const KhoanLine = ({ totals }: { totals: ScoreTotalsView }) =>
  totals.qtyKhoan !== 0 || (totals.moneyKhoanProvisional ?? 0) !== 0 ? (
    <span className="tabular-nums">
      {totals.moneyKhoanProvisional === null
        ? `Khoán ${formatInteger(totals.qtyKhoan)}\u00a0tấm`
        : `Khoán ${formatMoney(totals.moneyKhoanProvisional)} · ${formatInteger(totals.qtyKhoan)}\u00a0tấm`}
    </span>
  ) : (
    <span>Không có task Khoán</span>
  );

const ScoresContent = ({
  data,
  entries,
  paging,
  period,
  isCurrent,
  today,
  self
}: {
  data: ScoresView;
  entries: ScoreEntryView[];
  paging: EntriesPaging;
  period: string;
  isCurrent: boolean;
  today: string;
  self: boolean;
}) => {
  const { cards, summary } = data;
  // Official points per project; a project worked only on Khoán shifts shows its images (money is per person).
  const projects = summary.byProject
    .filter((row) => row.qty !== 0 || row.pointsOfficial !== 0)
    .sort((a, b) => b.pointsOfficial - a.pointsOfficial || b.qty - a.qty);
  const projectMax = Math.max(1, ...projects.map((row) => row.pointsOfficial));
  const money = summary.moneyKhoanProvisional;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Hôm nay"
          icon={Sun}
          value={formatCredit(cards.today.pointsOfficial)}
          unit="điểm"
        >
          <KhoanLine totals={cards.today} />
        </StatCard>
        <StatCard
          label="Tuần này"
          icon={CalendarDays}
          value={formatCredit(cards.week.pointsOfficial)}
          unit="điểm"
        >
          <KhoanLine totals={cards.week} />
        </StatCard>
        <StatCard
          label={isCurrent ? "Kỳ này (chính thức)" : `${periodLabel(period)} (chính thức)`}
          icon={CalendarRange}
          value={formatCredit(summary.pointsOfficial)}
          unit="điểm"
          accent
        >
          {summary.qcPoints !== 0 ? (
            <span className="tabular-nums">Gồm {formatCredit(summary.qcPoints)} điểm QC</span>
          ) : null}
          <KhoanLine totals={summary} />
        </StatCard>
        {money === null ? (
          // Someone else's money stays private (PD-052, PD-066): their Khoán images, without the amount.
          <StatCard
            label="Khoán trong kỳ"
            icon={Coins}
            value={formatInteger(summary.qtyKhoan)}
            unit="tấm"
          >
            <span>Tiền Khoán chỉ chính chủ và người có quyền xem mới thấy.</span>
          </StatCard>
        ) : (
          <StatCard
            label={isCurrent ? "Tiền Khoán tạm tính" : `Tiền Khoán đã làm · ${periodLabel(period)}`}
            icon={Coins}
            value={formatMoney(money)}
          >
            <span className="tabular-nums">{formatInteger(summary.qtyKhoan)}&nbsp;tấm Khoán</span>
            <span>
              {money !== 0
                ? "Khi chốt: thiếu KPI thì bù từ Khoán, phần còn lại trả tiền."
                : "Chưa có task Khoán có giá trong kỳ."}
            </span>
          </StatCard>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel
          title="Điểm theo ngày"
          description={`${periodLabel(period)} · tổng ${formatCredit(summary.pointsOfficial)} điểm chính thức`}
          bodyClassName="px-3 pt-3 pb-2 sm:px-4"
        >
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <DailyPointsChart days={summary.byDay} today={today} />
          </Suspense>
        </Panel>
        <Panel title="Theo dự án" bodyClassName="px-4 py-3">
          {projects.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-foreground-muted">Chưa có dữ liệu.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-2.5 overflow-y-auto">
              {projects.map((row) => {
                const khoanOnly = row.pointsOfficial === 0 && row.pointsKhoan !== 0;
                return (
                  <li key={row.projectId} className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate font-mono text-xs font-semibold">
                        {row.projectCode}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 tabular-nums",
                          khoanOnly ? "text-xs text-foreground-muted" : "font-medium"
                        )}
                      >
                        {khoanOnly ? "Khoán" : formatCredit(row.pointsOfficial)}
                      </span>
                    </span>
                    <span
                      className="flex h-1.5 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <span
                        className="h-full bg-brand"
                        style={{ width: `${(row.pointsOfficial / projectMax) * 100}%` }}
                      />
                    </span>
                    <span className="text-[11px] text-foreground-muted tabular-nums">
                      {formatInteger(row.qty)} tấm
                      {row.pointsKhoan !== 0 && !khoanOnly ? " · có task Khoán" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Lịch sử ghi điểm"
        description="Mỗi task ghi một dòng khi Done (task Checking: điểm QC) — ca chính thức tính điểm, ca Khoán tính tiền; sửa số tấm sau khi xong hoặc xoá task thì thêm dòng điều chỉnh."
      >
        <EntriesList entries={entries} paging={paging} self={self} />
      </Panel>
    </>
  );
};

const CardsSkeleton = () => (
  <div className="flex flex-col gap-4" aria-hidden="true">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-28 rounded-xl" />
      ))}
    </div>
    <Skeleton className="h-72 rounded-xl" />
    <Skeleton className="h-64 rounded-xl" />
  </div>
);
