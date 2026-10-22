import { cn } from "cn";
import { ClipboardPen, CloudOff, Eye, History, ShieldAlert, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router";

import { RouteFallback } from "@/components/layout/route-fallback";
import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/components/shared/router-link";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { JobListScope } from "@/contracts/production-jobs";
import type { ProductionOverview } from "@/contracts/production-overview";
import { useSessionContext } from "@/features/auth/hooks";
import { WorkEntryDialog } from "@/features/production/components/jobs/work-entry-dialog";
import { todayIn } from "@/features/production/format";
import { useProductionAccess, useProductionMe } from "@/features/production/hooks";
import { OverviewAssignTasks } from "@/features/production/overview/components/assign-tasks-dialog";
import { OverviewJobTable } from "@/features/production/overview/components/job-table";
import { NeedsBar } from "@/features/production/overview/components/needs-bar";
import { OverviewCardsRow } from "@/features/production/overview/components/overview-cards";
import { OverviewTimeControl, ScopeSwitch } from "@/features/production/overview/components/overview-filters";
import {
  longDayLabel,
  needItemsOf,
  needsScopeLanding,
  noFilter,
  overviewFilterFromSearch,
  overviewFilterToSearch,
  overviewLandingPath,
  overviewQuery,
  overviewRangeOf,
  overviewScopeOf,
  overviewScopeToSearch,
  overviewSubtitle,
  overviewTimeFromSearch,
  overviewTimeToSearch,
  toggleCard,
  toggleFilter,
  type OverviewFilter,
  type OverviewTime,
  type ProjectGroup
} from "@/features/production/overview/model";
import { useProductionOverview } from "@/features/production/overview/queries";
import { touchTargets } from "@/features/production/ui";
import { isApiError } from "@/lib/api/errors";

/**
 * /production — "Tổng quan" (Overview V2, PD-080) for Leaders, Accounts, Quản trị and Director: the first screen of a shift,
 * answering "which jobs may be late, what waits for me, who to give work to". Everyone else (Staff / QC) is sent to "Việc
 * của tôi" (`overviewLandingPath`). Time (Hôm nay · Tuần này · Tháng này · Tùy chọn), scope (Project của tôi · Tất cả) and
 * the card / Needs-you filter live in the URL. Five cards, "Cần bạn xử lý", then the jobs grouped by project with
 * "Chia task" on project rows (Leader / Quản trị).
 */
export const ProductionOverviewRoute = () => {
  const me = useProductionMe();
  const { roles, jobScopes, taskCreate } = useProductionAccess();
  // The production layout waits for /production/me; never flash "no permission" before the roles are known.
  if (!me.data) return <RouteFallback />;
  const landing = overviewLandingPath(roles);
  if (landing) return <Navigate to={landing} replace />;
  return jobScopes.view === "none" ? <OverviewForbidden canEnter={taskCreate !== "none"} /> : <OverviewPage />;
};

/** "Nhập Task" from the overview: the button and its dialog. */
const QuickTaskButton = ({ label = "Tạo nhanh task" }: { label?: string }) => {
  const [entering, setEntering] = useState(false);
  return (
    <>
      <Button onClick={() => setEntering(true)}>
        <ClipboardPen />
        <span className="max-sm:sr-only">{label}</span>
      </Button>
      <WorkEntryDialog key={entering ? "open" : "closed"} open={entering} onClose={() => setEntering(false)} />
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
  const { roles, taskCreate } = useProductionAccess();
  const canEnter = taskCreate !== "none";
  const [params, setParams] = useSearchParams();
  const timeZone = settings.timezone;
  const today = todayIn(timeZone);

  // The scope is written into the URL on landing (a Leader "Project của tôi", Quản trị "Tất cả"), so it stays chosen.
  const scope = overviewScopeOf(params, roles, userId);
  const landing = needsScopeLanding(params, roles);
  useEffect(() => {
    if (!landing) return;
    setParams((previous) => overviewScopeToSearch(scope, previous), { replace: true });
  }, [landing, scope, setParams]);

  const time = useMemo(() => overviewTimeFromSearch(params), [params]);
  const range = overviewRangeOf(time, today);
  const filter = useMemo(() => overviewFilterFromSearch(params), [params]);
  // Query keys are hashed by value: a new object each render is fine.
  const query = overviewQuery(range, scope);
  const overview = useProductionOverview(query);
  const data = overview.data;

  const setTime = useCallback(
    (next: OverviewTime) => setParams((previous) => overviewTimeToSearch(next, previous), { replace: true }),
    [setParams]
  );
  const setScope = useCallback(
    (next: JobListScope) => setParams((previous) => overviewScopeToSearch(next, previous), { replace: true }),
    [setParams]
  );
  const setFilter = useCallback(
    (next: OverviewFilter) => setParams((previous) => overviewFilterToSearch(next, previous), { replace: true }),
    [setParams]
  );

  return (
    <div className={`flex h-full min-h-0 flex-col max-md:overflow-y-auto ${touchTargets}`}>
      <PageHeader
        className="shrink-0"
        eyebrow={`Photo Retouch · ${longDayLabel(today)}`}
        title="Tổng quan"
        description={
          data ? (
            <span className="flex items-center gap-1.5" aria-live="polite">
              {overview.isFetching ? <Spinner className="size-3" aria-hidden="true" /> : null}
              {overviewSubtitle(time, data)}
            </span>
          ) : (
            "Việc nào sắp trễ, việc nào đang chờ bạn, giao việc cho ai."
          )
        }
        actions={
          <>
            {data?.viewer.riskHistory ? (
              <Button variant="outline" nativeButton={false} render={<Link to="/production/at-risk" />}>
                <History />
                <span className="max-sm:sr-only">Lịch sử At risk</span>
              </Button>
            ) : null}
            {canEnter ? <QuickTaskButton /> : null}
          </>
        }
      >
        <div role="toolbar" aria-label="Bộ lọc tổng quan" className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <OverviewTimeControl time={time} today={today} onChange={setTime} />
          {data?.viewer.scopeSwitch ? <ScopeSwitch scope={scope} counts={data.scopeCounts} onChange={setScope} /> : null}
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
              description={overview.error.message || "Tổng quan dành cho Leader, Account, Quản trị và Director."}
            />
          ) : (
            <ErrorState error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
          )}
        </div>
      ) : (
        <OverviewBody
          overview={data}
          filter={filter}
          stale={overview.isPlaceholderData}
          refreshFailed={overview.isRefetchError}
          onRetry={() => void overview.refetch()}
          onFilter={setFilter}
        />
      )}
    </div>
  );
};

const OverviewBody = ({
  overview,
  filter,
  stale,
  refreshFailed,
  onRetry,
  onFilter
}: {
  overview: ProductionOverview;
  filter: OverviewFilter;
  stale: boolean;
  refreshFailed: boolean;
  onRetry: () => void;
  onFilter: (next: OverviewFilter) => void;
}) => {
  const [assigning, setAssigning] = useState<ProjectGroup | null>(null);
  const needs = needItemsOf(overview);
  // The time-left labels follow the data's time (refreshed every minute).
  const now = useMemo(() => new Date(overview.generatedAt), [overview.generatedAt]);
  return (
    <OverviewScroll>
      {overview.scope === "all" && overview.viewer.scopeSwitch ? (
        <Notice icon={Eye} tone="info">
          Bạn đang xem <b className="font-semibold">TẤT CẢ</b> project — chọn “Project của tôi” để chỉ xem các Project bạn phụ trách.
        </Notice>
      ) : null}
      {refreshFailed ? (
        <Notice
          icon={CloudOff}
          tone="warning"
          action={
            <Button size="xs" variant="outline" onClick={onRetry}>
              Thử lại
            </Button>
          }
        >
          Không tải lại được số liệu mới nhất — đang hiện lần tải trước.
        </Notice>
      ) : null}
      <div
        className={cn("flex min-w-0 flex-col gap-4 transition-opacity duration-200 md:gap-5", stale && "opacity-60")}
        aria-busy={stale || undefined}
      >
        <OverviewCardsRow overview={overview} filter={filter} onPick={(card) => onFilter(toggleCard(filter, card))} />
        <NeedsBar items={needs} filter={filter} onPick={(item) => onFilter(toggleFilter(filter, item.filter))} />
        <OverviewJobTable
          overview={overview}
          filter={filter}
          now={now}
          canAssign={overview.viewer.canAssign}
          onSub={(sub) => onFilter({ card: filter.card, sub })}
          onClear={() => onFilter(noFilter)}
          onAssign={setAssigning}
        />
      </div>
      {assigning ? (
        <OverviewAssignTasks
          project={assigning.project}
          jobs={assigning.noTaskJobs}
          timeZone={overview.timeZone}
          onClose={() => setAssigning(null)}
        />
      ) : null}
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
      className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-4 px-4 py-4 md:px-6 md:py-5"
    >
      {children}
    </motion.div>
  </div>
);

/** A one-line notice above the figures (an icon, the text, an optional action). */
const Notice = ({
  icon: Icon,
  tone,
  action,
  children
}: {
  icon: LucideIcon;
  tone: "info" | "warning";
  action?: ReactNode;
  children: ReactNode;
}) => (
  <div
    className={cn(
      "flex min-w-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px]",
      tone === "warning" ? "border-warning/40 bg-warning-soft" : "border-brand/30 bg-brand-soft/60"
    )}
  >
    <Icon aria-hidden="true" className={cn("size-4 shrink-0", tone === "warning" ? "text-warning" : "text-brand-text")} />
    <span className="min-w-0 flex-1">{children}</span>
    {action ? <span className="shrink-0">{action}</span> : null}
  </div>
);

/** The page's shape while it loads: the cards, "Cần bạn xử lý" and the table (same grid as the real ones). */
const OverviewSkeleton = () => (
  <OverviewScroll>
    <div className="flex flex-col gap-4 md:gap-5" aria-busy="true" aria-label="Đang tải tổng quan">
      <div className="@container">
        <div className="grid grid-cols-2 gap-2.5 @lg:grid-cols-6 @4xl:grid-cols-5 @4xl:gap-3">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton
              key={index}
              className={cn(
                "h-[118px] rounded-xl @4xl:col-span-1",
                index === 0 ? "col-span-2 @lg:col-span-2" : index < 3 ? "@lg:col-span-2" : "@lg:col-span-3"
              )}
            />
          ))}
        </div>
      </div>
      <Skeleton className="h-14 rounded-xl" />
      <div className="overflow-hidden rounded-xl border bg-surface shadow-xs">
        <div className="flex flex-col gap-1.5 border-b px-4 py-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="flex items-center gap-4 border-b border-border/60 px-4 py-4 last:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-4 w-24 max-md:hidden" />
            <Skeleton className="h-2 w-40 rounded-full max-md:hidden" />
            <Skeleton className="h-6 w-28 rounded-md max-lg:hidden" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  </OverviewScroll>
);
