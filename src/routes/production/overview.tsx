import { cn } from "cn";
import { ChartNoAxesCombined, ClipboardPen, PieChart, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { RouteFallback } from "@/components/layout/route-fallback";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { JobListScope } from "@/contracts/production-jobs";
import type { ProductionOverview } from "@/contracts/production-overview";
import { useSessionContext } from "@/features/auth/hooks";
import { JobScopeTabs } from "@/features/production/components/jobs/job-scope-tabs";
import { WorkEntryDialog } from "@/features/production/components/jobs/work-entry-dialog";
import { formatDay, formatInteger, todayIn } from "@/features/production/format";
import { useProductionAccess, useProductionMe } from "@/features/production/hooks";
import { isoToZoned } from "@/features/production/jobs-model";
import { DueTasks } from "@/features/production/overview/components/due-tasks";
import { OverviewTimeFilter } from "@/features/production/overview/components/overview-filters";
import { ProjectProgressList } from "@/features/production/overview/components/project-progress";
import {
  OverviewStatCards,
  StatCardsSkeleton
} from "@/features/production/overview/components/stat-cards";
import {
  formatOverviewRange,
  overviewQuery,
  overviewRangeOf,
  overviewTabOf,
  overviewTabToSearch,
  overviewTimeFromSearch,
  overviewTimeToSearch,
  type OverviewTime
} from "@/features/production/overview/model";
import { useProductionOverview } from "@/features/production/overview/queries";
import { Panel } from "@/features/production/scores/components/kit";
import { closeDaysOf, formatDayRange } from "@/features/production/scores/periods";
import { touchTargets } from "@/features/production/ui";
import { isApiError } from "@/lib/api/errors";

// recharts stays out of the page's first chunk.
const charts = () => import("@/features/production/overview/components/overview-charts");
const ReceivedDoneChart = lazy(() => charts().then((module) => ({ default: module.ReceivedDoneChart })));
const StatusDonut = lazy(() => charts().then((module) => ({ default: module.StatusDonut })));
const VolumeDonut = lazy(() => charts().then((module) => ({ default: module.VolumeDonut })));

/**
 * /production — "Tổng quan" of Photo Retouch (PD-076): the whole system at a glance, nothing else. Quick stats, task
 * nhận vs xong per day, lines by status, volume per project, project progress and lines due today / this week, over
 * the jobs the caller may see (the Job list's visibility). Holders of LEADER get the "Tất cả" / "Tôi quản lý" tabs of
 * the Job list (PD-073; landing on "Tôi quản lý"). Time filter in the URL (default Hôm nay). "Tạo nhanh task" opens
 * "Nhập Task" for whoever may enter work.
 */
export const ProductionOverviewRoute = () => {
  const me = useProductionMe();
  const { jobScopes, taskCreate } = useProductionAccess();
  // The production layout waits for /production/me; never flash "no permission" before the scopes are known.
  if (!me.data) return <RouteFallback />;
  return jobScopes.view === "none" ? (
    <OverviewForbidden canEnter={taskCreate !== "none"} />
  ) : (
    <OverviewPage />
  );
};

/** "Nhập Task" from the overview: the button and its dialog. */
const QuickTaskButton = ({ label = "Tạo nhanh task" }: { label?: string }) => {
  const [entering, setEntering] = useState(false);
  return (
    <>
      <Button onClick={() => setEntering(true)}>
        <ClipboardPen />
        {label}
      </Button>
      <WorkEntryDialog
        key={entering ? "open" : "closed"}
        open={entering}
        onClose={() => setEntering(false)}
      />
    </>
  );
};

/** Job "view: none": no overview (it reads jobs); whoever may enter work keeps the quick action. */
const OverviewForbidden = ({ canEnter }: { canEnter: boolean }) => (
  <div className={`flex h-full items-center justify-center p-4 ${touchTargets}`}>
    <EmptyState
      icon={ShieldAlert}
      title="Bạn không có quyền xem tổng quan"
      description="Tổng quan tổng hợp các job bạn được xem. Liên hệ Quản trị Photo Retouch nếu bạn cần quyền xem job."
      action={canEnter ? <QuickTaskButton /> : undefined}
    />
  </div>
);

const OverviewPage = () => {
  const settings = useProductionMe().data!.settings;
  const userId = useSessionContext().user.id;
  const { jobScopes, roles, taskCreate } = useProductionAccess();
  // PD-079: "Tạo nhanh task" needs a task-creating role (an Account creates no task).
  const canEnter = taskCreate !== "none";
  const [params, setParams] = useSearchParams();
  // PD-078: tabs for holders of LEADER or ADMIN (null: none). Without ?scope= the page lands on the role's tab (a Leader
  // "Tôi quản lý", an Admin "Tất cả"; a PD-076 ?leader= link is read once), written into the URL so it stays chosen.
  const tab = overviewTabOf(params, roles, userId);
  const landing = tab !== null && !params.has("scope") ? tab : null;
  useEffect(() => {
    if (!landing) return;
    setParams((previous) => overviewTabToSearch(landing, previous), { replace: true });
  }, [landing, setParams]);

  const timeZone = settings.timezone;
  const today = todayIn(timeZone);
  const closeDays = useMemo(() => closeDaysOf(settings), [settings]);
  const time = useMemo(() => overviewTimeFromSearch(params), [params]);
  const range = overviewRangeOf(time, today, closeDays);
  const query = useMemo(
    () => overviewQuery({ from: range.from, to: range.to }, tab),
    [range.from, range.to, tab]
  );
  const overview = useProductionOverview(query);
  const data = overview.data;
  const stale = overview.isPlaceholderData;

  const setTime = useCallback(
    (next: OverviewTime) => setParams((previous) => overviewTimeToSearch(next, previous), { replace: true }),
    [setParams]
  );
  const setTab = useCallback(
    (next: JobListScope) => setParams((previous) => overviewTabToSearch(next, previous), { replace: true }),
    [setParams]
  );

  return (
    // Phones scroll the whole page (header, tabs and filters included); wider screens keep them above the body.
    <div className={`flex h-full min-h-0 flex-col max-md:overflow-y-auto ${touchTargets}`}>
      <PageHeader
        className="shrink-0"
        eyebrow="Photo Retouch"
        title="Tổng quan"
        description={
          jobScopes.view === "own"
            ? "Các job bạn tham gia — nhìn nhanh mà không cần vào từng Project."
            : "Toàn hệ thống — nhìn nhanh mà không cần vào từng Project."
        }
        actions={canEnter ? <QuickTaskButton /> : null}
      >
        {tab ? (
          <div className="-mx-4 -mt-1 border-b px-4 md:-mx-6 md:px-6">
            <JobScopeTabs value={tab} counts={data?.leaderTabs} onChange={setTab} />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <OverviewTimeFilter time={time} today={today} closeDays={closeDays} onChange={setTime} />
          <p
            className="flex shrink-0 items-center gap-1.5 text-xs text-foreground-muted tabular-nums lg:pt-1.5"
            aria-live="polite"
          >
            {overview.isFetching ? <Spinner className="size-3" aria-hidden="true" /> : null}
            {/* The KPI period picker already shows its days. */}
            {time.kind === "period" ? null : (
              <span>
                Ngày nhận{" "}
                {range.from === range.to ? formatDay(range.from) : formatDayRange(range.from, range.to)}
              </span>
            )}
            {data ? (
              <span>
                {time.kind === "period" ? "Cập nhật" : "· cập nhật"} {isoToZoned(data.generatedAt, timeZone).time}
              </span>
            ) : null}
          </p>
        </div>
      </PageHeader>
      {overview.isPending ? (
        <OverviewSkeleton />
      ) : !data ? (
        <div className="flex flex-1 items-center justify-center p-4">
          {isApiError(overview.error) && overview.error.status === 403 ? (
            <EmptyState
              icon={ShieldAlert}
              title="Bạn không có quyền xem tổng quan"
              description="Tổng quan tổng hợp các job bạn được xem."
            />
          ) : (
            <ErrorState
              error={overview.error}
              onRetry={() => void overview.refetch()}
              retrying={overview.isFetching}
            />
          )}
        </div>
      ) : (
        <OverviewBody
          overview={data}
          tab={tab}
          stale={stale}
          refreshFailed={overview.isRefetchError}
          onRetry={() => void overview.refetch()}
        />
      )}
    </div>
  );
};

const OverviewBody = ({
  overview,
  tab,
  stale,
  refreshFailed,
  onRetry
}: {
  overview: ProductionOverview;
  tab: JobListScope | null;
  stale: boolean;
  refreshFailed: boolean;
  onRetry: () => void;
}) => {
  const { stats, range, today } = overview;
  const empty = stats.total === 0;
  const scope = tab === "mine" ? " — Project bạn phụ trách" : "";
  return (
    <OverviewScroll>
      {refreshFailed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs">
          <span>Không tải lại được số liệu mới nhất — đang hiện lần tải trước.</span>
          <Button size="xs" variant="outline" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      ) : null}
      <div
        className={cn("flex min-w-0 flex-col gap-4 transition-opacity duration-200", stale && "opacity-60")}
        aria-busy={stale || undefined}
      >
        <OverviewStatCards overview={overview} />
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          <Panel
            className="lg:col-span-2"
            title="Task nhận và xong theo ngày"
            description={
              overview.daily.from === range.from && overview.daily.to === range.to
                ? `Task nhận (theo Ngày nhận) và task xong mỗi ngày${scope}.`
                : `7 ngày gần nhất đến ${formatOverviewRange({ from: range.to, to: range.to }, today)} — task nhận và task xong mỗi ngày.`
            }
            bodyClassName="px-3 pt-3 pb-2 sm:px-4"
          >
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <ReceivedDoneChart daily={overview.daily} range={range} today={today} />
            </Suspense>
          </Panel>
          <Panel title="Task theo trạng thái" description="Task nhận trong khoảng đã chọn." bodyClassName="p-4">
            {empty ? (
              <EmptyChart icon={PieChart}>Không có task nào nhận trong khoảng này.</EmptyChart>
            ) : (
              <Suspense fallback={<DonutSkeleton />}>
                <StatusDonut slices={overview.byStatus} total={stats.total} />
              </Suspense>
            )}
          </Panel>
        </div>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Task sắp đến hạn"
          description="Task chưa xong theo Ngày giao — không theo bộ lọc thời gian."
          bodyClassName="px-4 pt-1 pb-3"
        >
          <DueTasks dueToday={overview.dueToday} dueThisWeek={overview.dueThisWeek} timeZone={overview.timeZone} />
        </Panel>
        <div className={cn("min-w-0 transition-opacity duration-200", stale && "opacity-60")}>
          <Panel
            className="h-full"
            title="Khối lượng theo Project"
            description="Số tấm của task nhận trong khoảng đã chọn."
            bodyClassName="p-4"
          >
            {overview.volume.slices.length === 0 ? (
              <EmptyChart icon={ChartNoAxesCombined}>
                {empty ? "Không có task nào nhận trong khoảng này." : "Task trong khoảng này chưa có số lượng."}
              </EmptyChart>
            ) : (
              <Suspense fallback={<DonutSkeleton />}>
                <VolumeDonut volume={overview.volume} />
              </Suspense>
            )}
            {overview.volume.withoutQty > 0 ? (
              <p className="mt-3 text-xs text-foreground-muted">
                {formatInteger(overview.volume.withoutQty)} task chưa có số lượng — không tính vào số tấm.
              </p>
            ) : null}
          </Panel>
        </div>
      </div>
      <Panel
        title="Tiến độ Project"
        description="% theo số tấm của các job đang mở (chưa đóng, chưa lưu trữ) — không theo bộ lọc thời gian. Bấm để xem job của Project."
        bodyClassName="px-4 py-2"
      >
        <ProjectProgressList projects={overview.projects} tab={tab} />
      </Panel>
    </OverviewScroll>
  );
};

const ease = [0.22, 1, 0.36, 1] as const;

/** The page body: scrolls on its own from md up; on phones the whole page scrolls. */
const OverviewScroll = ({ children }: { children: ReactNode }) => (
  <div className="max-md:shrink-0 md:min-h-0 md:flex-1 md:overflow-y-auto">
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease }}
      className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 px-4 py-4 md:px-6 md:py-6"
    >
      {children}
    </motion.div>
  </div>
);

const EmptyChart = ({ icon: Icon, children }: { icon: typeof PieChart; children: ReactNode }) => (
  <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-center text-[13px] text-foreground-muted">
    <span className="flex size-9 items-center justify-center rounded-xl border bg-surface shadow-xs [&_svg]:size-4">
      <Icon strokeWidth={1.75} aria-hidden="true" />
    </span>
    {children}
  </div>
);

const DonutSkeleton = () => (
  <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
    <Skeleton className="aspect-square w-full max-w-44 rounded-full" />
    <div className="flex w-full flex-col gap-2">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-4 w-full" />
      ))}
    </div>
  </div>
);

const OverviewSkeleton = () => (
  <OverviewScroll>
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Đang tải tổng quan">
      <StatCardsSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  </OverviewScroll>
);
