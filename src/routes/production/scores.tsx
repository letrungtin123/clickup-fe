import { CalendarDays, CalendarRange, ChevronLeft, Coins, Sun, Trophy } from "lucide-react";
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router";
import { Link } from "@/components/shared/router-link";

import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { KhoanPayPolicy } from "@/contracts/production-catalog";
import type { MyScores, ScoreEntry, ScoreTotals } from "@/contracts/production-scores";
import { useSessionContext } from "@/features/auth/hooks";
import {
  closeDayLabel,
  closeDaySchedule,
  formatCredit,
  formatInteger,
  formatMoney,
  todayIn
} from "@/features/production/format";
import { useProductionMe } from "@/features/production/hooks";
import { flattenPages } from "@/features/production/jobs-model";
import { MySettlements } from "@/features/production/kpi/components/my-settlements";
import { khoanProvisionalHint } from "@/features/production/kpi/khoan-policy";
import {
  EntriesList,
  type EntriesPaging
} from "@/features/production/scores/components/entries-list";
import {
  ForecastPanel,
  ForecastSkeleton
} from "@/features/production/scores/components/forecast-panel";
import {
  PageBody,
  Panel,
  PeriodPicker,
  StatCard
} from "@/features/production/scores/components/kit";
import { useMyScores, useScoreForecast } from "@/features/production/scores/hooks";
import {
  closeDaysOf,
  formatPeriod,
  isPeriod,
  periodLabel,
  upcomingCloseDayChange
} from "@/features/production/scores/periods";
import {
  closeDayOfPeriod,
  kpiPeriodOfDay,
  kpiPeriodRange,
  type KpiCloseDays
} from "@/contracts/production-scores";
import { useBreakpoint } from "@/hooks/use-breakpoint";

const DailyPointsChart = lazy(() =>
  import("@/features/production/scores/components/daily-chart").then((module) => ({
    default: module.DailyPointsChart
  }))
);

type Tab = "overview" | "settled";

/**
 * /production/scores — personal scores (SPEC Phase 3 §5): today / week / period cards, the Khoán
 * money provisional card (owner only, as returned by the API), the KPI forecast, daily chart and the
 * ledger; "Kết quả chốt" lists the caller's own settlements (Phase 6 §4). ?period=YYYY-MM&tab=settled.
 */
export const ProductionScoresRoute = () => {
  const me = useProductionMe();
  const session = useSessionContext();
  const breakpoint = useBreakpoint();
  const [params, setParams] = useSearchParams();

  const settings = me.data?.settings;
  const closeDays = closeDaysOf(settings);
  const today = todayIn(settings?.timezone ?? "Asia/Ho_Chi_Minh");
  const current = kpiPeriodOfDay(today, closeDays);
  const closeDay = closeDayOfPeriod(closeDays, current);
  const change = upcomingCloseDayChange(closeDays, current);
  // PD-033: what the close does with Khoán money (ALWAYS while /me loads — the default).
  const khoanPolicy = settings?.khoanPayPolicy ?? "ALWAYS";
  const requested = params.get("period");
  const period = isPeriod(requested) && requested <= current ? requested : current;
  const tab: Tab = params.get("tab") === "settled" ? "settled" : "overview";

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
            : `Điểm, tiền Khoán tạm tính và tiến độ KPI. Kỳ KPI chốt ${closeDaySchedule(closeDay)}${change ? `; từ kỳ ${formatPeriod(change.fromPeriod)} chốt ${closeDayLabel(change.closeDay)}` : ""}.`
        }
        actions={
          <Button
            variant="outline"
            render={<Link to="/production/scores/board" />}
            nativeButton={false}
          >
            <Trophy />
            <span className="max-sm:sr-only">Xếp hạng</span>
          </Button>
        }
      >
        <Tabs
          value={tab}
          onValueChange={(value) => update({ tab: value === "settled" ? "settled" : null })}
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
      </PageHeader>

      <PageBody>
        {tab === "settled" ? (
          <MySettlements
            userId={session.user.id}
            currentPeriod={current}
            khoanPolicy={khoanPolicy}
          />
        ) : (
          <Overview
            period={period}
            current={current}
            closeDays={closeDays}
            today={today}
            khoanPolicy={khoanPolicy}
            onPeriodChange={(next) => update({ period: next === current ? null : next })}
          />
        )}
      </PageBody>
    </div>
  );
};

const Overview = ({
  period,
  current,
  closeDays,
  today,
  khoanPolicy,
  onPeriodChange
}: {
  period: string;
  current: string;
  closeDays: KpiCloseDays;
  today: string;
  khoanPolicy: KhoanPayPolicy;
  onPeriodChange: (period: string) => void;
}) => {
  const range = kpiPeriodRange(period, closeDays);
  const scores = useMyScores(range);
  const forecast = useScoreForecast(period);
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
        />
      )}
    </>
  );
};

const KhoanLine = ({ totals }: { totals: ScoreTotals }) =>
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
  khoanPolicy
}: {
  data: MyScores;
  entries: ScoreEntry[];
  paging: EntriesPaging;
  period: string;
  isCurrent: boolean;
  today: string;
  khoanPolicy: KhoanPayPolicy;
}) => {
  const { cards, summary } = data;
  const projects = summary.byProject
    .filter((row) => row.qty !== 0 || row.pointsOfficial !== 0 || row.pointsKhoan !== 0)
    .sort((a, b) => b.pointsOfficial + b.pointsKhoan - (a.pointsOfficial + a.pointsKhoan));
  const projectMax = Math.max(1, ...projects.map((row) => row.pointsOfficial + row.pointsKhoan));

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
        <StatCard
          label="Tiền Khoán tạm tính"
          icon={Coins}
          value={formatMoney(summary.moneyKhoanProvisional)}
        >
          <span>
            {summary.moneyKhoanProvisional > 0
              ? khoanProvisionalHint(khoanPolicy)
              : "Chưa có task Khoán có giá trong kỳ."}
          </span>
        </StatCard>
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
        description="Mỗi dòng công việc ghi một dòng điểm khi Done (dòng Checking: điểm QC); sửa số tấm sau khi xong hoặc xoá dòng thì thêm dòng điều chỉnh."
      >
        <EntriesList entries={entries} paging={paging} />
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
