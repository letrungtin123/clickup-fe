import { cn } from "cn";
import { ClipboardPen } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { RouteFallback } from "@/components/layout/route-fallback";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { MyOverview } from "@/contracts/production-my-overview";
import { useSessionContext } from "@/features/auth/hooks";
import { WorkEntryDialog } from "@/features/production/components/jobs/work-entry-dialog";
import { WorkflowUnavailable } from "@/features/production/components/jobs/workflow-unavailable";
import { todayIn } from "@/features/production/format";
import { useProductionAccess, useProductionMe } from "@/features/production/hooks";
import { isoToZoned } from "@/features/production/jobs-model";
import { PointsStrip } from "@/features/production/my-overview/components/points-strip";
import { QcQueueList } from "@/features/production/my-overview/components/qc-queue";
import { NeedsBar, TagCards } from "@/features/production/my-overview/components/tags";
import { MyTaskList } from "@/features/production/my-overview/components/task-list";
import { MyOverviewTimeFilter } from "@/features/production/my-overview/components/time-filter";
import { myOverviewCopy as copy } from "@/features/production/my-overview/copy";
import {
  filterMyTasks,
  myOverviewFilterFromSearch,
  myOverviewFilterToSearch,
  myOverviewRangeOf,
  myOverviewRangeText,
  myOverviewTimeFromSearch,
  myOverviewTimeToSearch,
  needItems,
  tagCards,
  toggleTag,
  type MyOverviewFilter,
  type MyOverviewTime
} from "@/features/production/my-overview/model";
import { useMyOverview } from "@/features/production/my-overview/queries";
import { useMyMoves } from "@/features/production/my-overview/use-my-moves";
import { useOpenTask } from "@/features/production/task-link";
import { touchTargets } from "@/features/production/ui";

/**
 * "Tổng quan của tôi" (PD-081) — every production member's own work at a glance (the landing page of Staff / QC): my
 * points and KPI, my task tags (each a filter), "Cần bạn xử lý", my lines with their quick moves and, for QC holders, the
 * lines waiting for my check. Time filter (Hôm nay · Tuần này · Tháng này · Tùy chọn) and tag / status filters live in the
 * URL (`?range=&from=&to=&tag=&status=`); `?ptask=` opens the task sheet of the production layout. No client deadline,
 * no money, nobody else's points.
 */
export const ProductionMyOverviewRoute = () => {
  const me = useProductionMe();
  // The production layout waits for /production/me; never render the page before the settings are known.
  if (!me.data) return <RouteFallback />;
  return <MyOverviewPage />;
};

/** "+ Nhập Task" (PD-079: for whoever may create tasks): the existing work-entry dialog. */
const LogTaskButton = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPen aria-hidden="true" />
        {copy.logTask}
      </Button>
      <WorkEntryDialog key={open ? "open" : "closed"} open={open} onClose={() => setOpen(false)} />
    </>
  );
};

const MyOverviewPage = () => {
  const settings = useProductionMe().data!.settings;
  const session = useSessionContext();
  const { taskCreate } = useProductionAccess();
  const [params, setParams] = useSearchParams();
  const timeZone = settings.timezone;
  const today = todayIn(timeZone);
  const time = useMemo(() => myOverviewTimeFromSearch(params), [params]);
  const range = myOverviewRangeOf(time, today);
  const overview = useMyOverview(range);
  const data = overview.data;
  const filter = myOverviewFilterFromSearch(params, data?.viewer.qc ?? params.get("tag") === "qc");

  const setTime = useCallback(
    (next: MyOverviewTime) =>
      setParams((previous) => myOverviewTimeToSearch(next, previous), { replace: true }),
    [setParams]
  );
  const setFilter = useCallback(
    (next: MyOverviewFilter) =>
      setParams((previous) => myOverviewFilterToSearch(next, previous), { replace: true }),
    [setParams]
  );

  return (
    // Phones scroll the whole page; wider screens keep the header above the scrolling body.
    <div className={cn("flex h-full min-h-0 flex-col max-md:overflow-y-auto", touchTargets)}>
      <header className="flex shrink-0 flex-col gap-3 border-b px-4 pt-4 pb-3 md:px-6 md:pt-5">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs text-foreground-muted">{copy.eyebrow}</p>
            <h1 className="truncate text-xl leading-7 font-semibold tracking-[-0.015em] sm:text-2xl">
              {copy.greeting(session.user.displayName)}
            </h1>
            <p className="text-[13px] text-foreground-muted">
              {myOverviewRangeText(time, range, today)}
            </p>
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
            <MyOverviewTimeFilter time={time} today={today} onChange={setTime} />
            {taskCreate !== "none" ? <LogTaskButton /> : null}
          </div>
        </div>
        {data ? (
          <p
            className="flex items-center gap-1.5 text-xs text-foreground-subtle tabular-nums"
            aria-live="polite"
          >
            {overview.isFetching ? <Spinner className="size-3" aria-hidden="true" /> : null}
            {copy.updatedAt(isoToZoned(data.generatedAt, timeZone).time)}
          </p>
        ) : null}
      </header>
      {overview.isPending ? (
        <MyOverviewSkeleton />
      ) : !data ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <ErrorState
            title={copy.errors.title}
            error={overview.error}
            onRetry={() => void overview.refetch()}
            retrying={overview.isFetching}
          />
        </div>
      ) : (
        <MyOverviewBody
          overview={data}
          filter={filter}
          onFilter={setFilter}
          stale={overview.isPlaceholderData}
          refreshFailed={overview.isRefetchError}
          onRetry={() => void overview.refetch()}
        />
      )}
    </div>
  );
};

const MyOverviewBody = ({
  overview,
  filter,
  onFilter,
  stale,
  refreshFailed,
  onRetry
}: {
  overview: MyOverview;
  filter: MyOverviewFilter;
  onFilter: (next: MyOverviewFilter) => void;
  stale: boolean;
  refreshFailed: boolean;
  onRetry: () => void;
}) => {
  const moves = useMyMoves();
  const openTask = useOpenTask();
  const now = new Date();
  const cards = tagCards(overview);
  const needs = needItems(overview);
  const lines = filterMyTasks(overview.tasks, filter);
  const listTitle =
    filter.tag === "inProgress"
      ? copy.tags.inProgress
      : filter.tag === "done"
        ? copy.tags.done
        : filter.tag === "late"
          ? copy.tags.late
          : copy.list.title;
  return (
    <MyOverviewScroll>
      {refreshFailed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs">
          <span>{copy.refreshFailed}</span>
          <Button size="xs" variant="outline" onClick={onRetry}>
            {copy.retry}
          </Button>
        </div>
      ) : null}
      <div
        className={cn(
          "flex min-w-0 flex-col gap-4 transition-opacity duration-200",
          stale && "opacity-60"
        )}
        aria-busy={stale || undefined}
      >
        <PointsStrip points={overview.points} />
        <TagCards
          cards={cards}
          active={filter.tag}
          onPick={(key) => onFilter(toggleTag(filter, key))}
        />
        <NeedsBar items={needs} onPick={onFilter} />
        {moves.lookup.isError ? (
          <WorkflowUnavailable onRetry={moves.lookup.retry} retrying={moves.lookup.retrying}>
            {copy.errors.workflow}
          </WorkflowUnavailable>
        ) : null}
        {filter.tag === "qc" && overview.qcQueue ? (
          <QcQueueList
            lines={overview.qcQueue}
            now={now}
            statuses={moves.lookup.statuses}
            moves={moves}
            onOpen={openTask}
            onBack={() => onFilter({ tag: "mine", statusId: null })}
          />
        ) : (
          <MyTaskList
            overview={overview}
            lines={lines}
            filter={filter}
            title={listTitle}
            onFilter={onFilter}
            now={now}
            statuses={moves.lookup.statuses}
            moves={moves}
            onOpen={openTask}
          />
        )}
      </div>
      {moves.dialog}
    </MyOverviewScroll>
  );
};

const ease = [0.22, 1, 0.36, 1] as const;

/** The page body: scrolls on its own from md up; on phones the whole page scrolls. */
const MyOverviewScroll = ({ children }: { children: ReactNode }) => (
  <div className="max-md:shrink-0 md:min-h-0 md:flex-1 md:overflow-y-auto">
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease }}
      className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-4 md:px-6 md:py-6"
    >
      {children}
    </motion.div>
  </div>
);

const MyOverviewSkeleton = () => (
  <MyOverviewScroll>
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={copy.loading}>
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  </MyOverviewScroll>
);
