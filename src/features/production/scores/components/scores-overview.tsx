import { CalendarDays, CalendarRange, Coins, Sun } from "lucide-react";
import { lazy, Suspense } from "react";

import { ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { KhoanPayPolicy } from "@/contracts/production-catalog";
import {
  kpiPeriodRange,
  type KpiCloseDays,
  type ScoreEntryView,
  type ScoreTotalsView
} from "@/contracts/production-scores";

import { formatCredit, formatInteger, formatMoney } from "../../format";
import { flattenPages } from "../../jobs-model";
import { khoanProvisionalHint } from "../../kpi/khoan-policy";
import { useForecastOf, useScores, type ScoresView } from "../hooks";
import { periodLabel } from "../periods";
import { EntriesList, type EntriesPaging } from "./entries-list";
import { ForecastPanel, ForecastSkeleton } from "./forecast-panel";
import { Panel, PeriodPicker, StatCard } from "./kit";

const DailyPointsChart = lazy(() =>
  import("./daily-chart").then((module) => ({ default: module.DailyPointsChart }))
);

/**
 * "Tổng quan" of a scores page (SPEC Phase 3 §5) for one person: the KPI forecast, today / week / period
 * cards, Khoán money (or, when hidden, the Khoán work), daily chart, projects and the ledger. `userId`
 * null = the signed-in user (/production/scores); otherwise that member's "Điểm cá nhân" (PD-052), where
 * money appears only if the API sent it (own, Admin, or settings.moneyPublic).
 */
export const ScoresOverview = ({
  userId,
  period,
  current,
  closeDays,
  today,
  khoanPolicy,
  onPeriodChange
}: {
  userId: string | null;
  period: string;
  current: string;
  closeDays: KpiCloseDays;
  today: string;
  khoanPolicy: KhoanPayPolicy;
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
          khoanPolicy={khoanPolicy}
          self={userId === null}
        />
      )}
    </>
  );
};

const KhoanLine = ({ totals }: { totals: ScoreTotalsView }) =>
  totals.pointsKhoan > 0 || totals.qtyKhoan > 0 ? (
    <span className="tabular-nums">
      {`+\u00a0${formatCredit(totals.pointsKhoan)}\u00a0Khoán · ${formatInteger(totals.qtyKhoan)}\u00a0tấm`}
    </span>
  ) : (
    <span>Chưa có điểm Khoán</span>
  );

const ScoresContent = ({
  data,
  entries,
  paging,
  period,
  isCurrent,
  today,
  khoanPolicy,
  self
}: {
  data: ScoresView;
  entries: ScoreEntryView[];
  paging: EntriesPaging;
  period: string;
  isCurrent: boolean;
  today: string;
  khoanPolicy: KhoanPayPolicy;
  self: boolean;
}) => {
  const { cards, summary } = data;
  const projects = summary.byProject
    .filter((row) => row.qty !== 0 || row.pointsOfficial !== 0 || row.pointsKhoan !== 0)
    .sort((a, b) => b.pointsOfficial + b.pointsKhoan - (a.pointsOfficial + a.pointsKhoan));
  const projectMax = Math.max(1, ...projects.map((row) => row.pointsOfficial + row.pointsKhoan));
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
          // Someone else's money stays private (PD-052): their Khoán work, without the amount.
          <StatCard
            label="Khoán trong kỳ"
            icon={Coins}
            value={formatCredit(summary.pointsKhoan)}
            unit="điểm"
          >
            <span className="tabular-nums">{formatInteger(summary.qtyKhoan)}&nbsp;tấm</span>
            <span>Tiền Khoán chỉ chính chủ và Quản trị xem được.</span>
          </StatCard>
        ) : (
          <StatCard label="Tiền Khoán tạm tính" icon={Coins} value={formatMoney(money)}>
            <span>
              {money > 0
                ? khoanProvisionalHint(khoanPolicy)
                : "Chưa có task Khoán có giá trong kỳ."}
            </span>
          </StatCard>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel
          title="Điểm theo ngày"
          description={`${periodLabel(period)} · tổng ${formatCredit(summary.pointsOfficial + summary.pointsKhoan)} điểm`}
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
                const total = row.pointsOfficial + row.pointsKhoan;
                return (
                  <li key={row.projectId} className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate font-mono text-xs font-semibold">
                        {row.projectCode}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatCredit(total)}
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
                      <span
                        className="h-full bg-[color-mix(in_oklab,var(--brand)_42%,white)]"
                        style={{ width: `${(row.pointsKhoan / projectMax) * 100}%` }}
                      />
                    </span>
                    <span className="text-[11px] text-foreground-muted tabular-nums">
                      {formatInteger(row.qty)} tấm
                      {row.pointsKhoan > 0 ? ` · ${formatCredit(row.pointsKhoan)} Khoán` : ""}
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
        description="Mỗi task ghi một dòng điểm khi Done (task Checking: điểm QC); sửa số tấm sau khi xong hoặc xoá task thì thêm dòng điều chỉnh."
      >
        <EntriesList entries={entries} paging={paging} self={self} showMoney={money !== null} />
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
