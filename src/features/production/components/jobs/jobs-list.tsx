import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import { Archive, Briefcase } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import { Link } from "react-router";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { JobSummary } from "@/contracts/production-jobs";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { useTags } from "../../hooks";
import { formatDateTime, jobProgress } from "../../jobs-model";
import type { Tag } from "../../types";
import { TagChips } from "../tag-picker";
import { FeedbackBadge, LateBadge, MiniBar, Person, StatusChip } from "./job-bits";

const ROW_HEIGHT = 60;
const template =
  "minmax(15rem,2fr) minmax(9rem,1fr) 8.5rem 9rem 4.5rem 5.75rem 5.75rem 5.75rem 3.5rem minmax(7rem,1fr)";

type JobsListProps = {
  jobs: JobSummary[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  timeZone: string;
  filtering: boolean;
  empty: React.ReactNode;
};

/**
 * Jobs as a virtualized table (sticky header and job column, scrolls inside its own container) on
 * tablet/desktop and as cards on phones. Next pages load when the end comes into view.
 */
export const JobsList = (props: JobsListProps) => {
  const breakpoint = useBreakpoint();
  const tags = useTags();
  const tagList = tags.data?.items ?? [];
  if (props.isPending) return <ListSkeleton cards={breakpoint === "mobile"} />;
  if (props.error) return <ErrorState error={props.error} onRetry={props.onRetry} />;
  if (props.jobs.length === 0) return <>{props.empty}</>;
  return breakpoint === "mobile" ? (
    <JobCards {...props} tags={tagList} />
  ) : (
    <JobTable {...props} tags={tagList} />
  );
};

const ListSkeleton = ({ cards }: { cards: boolean }) => (
  <div className="flex flex-col gap-2 p-1" aria-busy="true" aria-label="Đang tải job">
    {Array.from({ length: cards ? 4 : 8 }, (_, index) =>
      cards ? (
        <Skeleton key={index} className="h-28 rounded-xl" />
      ) : (
        <div key={index} className="flex items-center gap-4 rounded-lg border px-3 py-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="ml-auto h-2 w-40" />
        </div>
      )
    )}
  </div>
);

const Qty = ({
  value,
  total,
  tone
}: {
  value: number;
  total: number;
  tone: "brand" | "success" | "muted" | "warning";
}) => (
  <span className="flex flex-col gap-1">
    <span className="text-[13px] tabular-nums">{value}</span>
    <MiniBar value={total > 0 ? (value / total) * 100 : 0} tone={tone} />
  </span>
);

const JobTable = ({
  jobs,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  timeZone,
  tags
}: JobsListProps & { tags: Tag[] }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer instance is read during render on purpose
  const virtualizer = useVirtualizer({
    count: jobs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => jobs[index]?.id ?? index
  });
  const items = virtualizer.getVirtualItems();
  const last = items[items.length - 1]?.index ?? -1;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && last >= jobs.length - 8) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, last, jobs.length, fetchNextPage]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border bg-surface shadow-xs"
      style={{ "--job-cols": template } as CSSProperties}
    >
      <div
        role="table"
        aria-label="Danh sách job"
        aria-rowcount={jobs.length + 1}
        className="min-w-max"
      >
        <div
          role="row"
          className="sticky top-0 z-20 grid h-10 grid-cols-(--job-cols) items-center border-b bg-surface/95 text-xs font-medium text-foreground-muted backdrop-blur-sm"
        >
          <span
            role="columnheader"
            className="sticky left-0 z-10 flex h-full items-center bg-surface px-4 shadow-[1px_0_0_var(--border)]"
          >
            Job
          </span>
          <span role="columnheader" className="px-3">
            Leader
          </span>
          <span role="columnheader" className="px-3">
            Deadline
          </span>
          <span role="columnheader" className="px-3">
            Trạng thái
          </span>
          <span role="columnheader" className="px-3 text-right">
            Tổng tấm
          </span>
          <span role="columnheader" className="px-3">
            Đã giao
          </span>
          <span role="columnheader" className="px-3">
            Đã done
          </span>
          <span role="columnheader" className="px-3">
            Đã checked
          </span>
          <span role="columnheader" className="px-3" title="Feedback đang mở">
            FB
          </span>
          <span role="columnheader" className="px-3">
            Tag
          </span>
        </div>
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((virtualRow) => {
            const job = jobs[virtualRow.index];
            if (!job) return null;
            const late = job.lateTaskCount > 0;
            return (
              <Link
                key={virtualRow.key}
                role="row"
                to={`/production/jobs/${job.id}`}
                aria-rowindex={virtualRow.index + 2}
                className={cn(
                  "group/row absolute inset-x-0 top-0 grid grid-cols-(--job-cols) items-center border-b border-border/70 text-[13px] outline-none hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  job.archived && "opacity-60"
                )}
                style={{ height: ROW_HEIGHT, transform: `translateY(${virtualRow.start}px)` }}
              >
                <span
                  role="cell"
                  className="sticky left-0 z-[1] flex h-full min-w-0 flex-col justify-center gap-0.5 bg-surface px-4 shadow-[1px_0_0_var(--border)] group-hover/row:bg-[color-mix(in_oklch,var(--surface),var(--foreground)_3%)]"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {job.archived ? (
                      <Archive
                        className="size-3.5 shrink-0 text-foreground-subtle"
                        aria-label="Đã lưu trữ"
                      />
                    ) : null}
                    <span className="truncate font-medium">{job.code}</span>
                  </span>
                  <span className="truncate text-xs text-foreground-muted">
                    <span className="font-mono">{job.project.code}</span>
                    {job.name ? ` · ${job.name}` : ""}
                  </span>
                </span>
                <span role="cell" className="min-w-0 px-3">
                  <Person user={job.leader} size="xs" />
                </span>
                <span role="cell" className="flex flex-col gap-0.5 px-3">
                  <span className={cn("tabular-nums", late && "font-medium text-danger")}>
                    {formatDateTime(job.deadline, timeZone)}
                  </span>
                  {late ? (
                    <LateBadge label={`${job.lateTaskCount} trễ`} className="self-start" />
                  ) : null}
                </span>
                <span role="cell" className="min-w-0 px-3">
                  <StatusChip status={job.status} size="sm" />
                </span>
                <span role="cell" className="px-3 text-right tabular-nums">
                  {job.totalImages}
                </span>
                <span role="cell" className="px-3">
                  <Qty
                    value={job.qtyAssigned}
                    total={job.totalImages}
                    tone={jobProgress(job).overAllocated ? "warning" : "muted"}
                  />
                </span>
                <span role="cell" className="px-3">
                  <Qty value={job.qtyDone} total={job.totalImages} tone="brand" />
                </span>
                <span role="cell" className="px-3">
                  <Qty value={job.qtyChecked} total={job.totalImages} tone="success" />
                </span>
                <span role="cell" className="px-3">
                  <FeedbackBadge count={job.openFeedbackCount} />
                </span>
                <span role="cell" className="min-w-0 px-3">
                  <TagChips tags={tags} tagIds={job.tagIds} max={2} />
                </span>
              </Link>
            );
          })}
        </div>
        {isFetchingNextPage ? (
          <div className="sticky left-0 flex w-full justify-center py-3">
            <Spinner className="text-foreground-muted" />
          </div>
        ) : null}
      </div>
    </div>
  );
};

const JobCards = ({
  jobs,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  timeZone,
  tags
}: JobsListProps & { tags: Tag[] }) => (
  <div className="flex flex-col gap-2.5">
    <ul className="flex flex-col gap-2.5">
      {jobs.map((job) => {
        const late = job.lateTaskCount > 0;
        const progress = jobProgress(job);
        return (
          <li key={job.id}>
            <Link
              to={`/production/jobs/${job.id}`}
              className={cn(
                "flex flex-col gap-2.5 rounded-xl border bg-surface p-3.5 shadow-xs outline-none active:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring",
                job.archived && "opacity-60"
              )}
            >
              <span className="flex items-start gap-2">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">{job.code}</span>
                  <span className="truncate text-xs text-foreground-muted">
                    <span className="font-mono">{job.project.code}</span>
                    {job.name ? ` · ${job.name}` : ""}
                  </span>
                </span>
                <StatusChip status={job.status} size="sm" className="shrink-0" />
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
                <Person user={job.leader} size="xs" className="max-w-[50%]" />
                <span className={cn("tabular-nums", late && "font-medium text-danger")}>
                  {formatDateTime(job.deadline, timeZone)}
                </span>
                {late ? <LateBadge label={`${job.lateTaskCount} trễ`} /> : null}
                <FeedbackBadge count={job.openFeedbackCount} />
              </span>
              <span className="grid grid-cols-3 gap-3 text-xs">
                <span className="flex flex-col gap-1">
                  <span className="text-foreground-muted">
                    Giao{" "}
                    <b className="font-semibold text-foreground tabular-nums">{job.qtyAssigned}</b>/
                    {job.totalImages}
                  </span>
                  <MiniBar
                    value={progress.assigned}
                    tone={progress.overAllocated ? "warning" : "muted"}
                  />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-foreground-muted">
                    Done <b className="font-semibold text-foreground tabular-nums">{job.qtyDone}</b>
                  </span>
                  <MiniBar value={progress.done} />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-foreground-muted">
                    Checked{" "}
                    <b className="font-semibold text-foreground tabular-nums">{job.qtyChecked}</b>
                  </span>
                  <MiniBar value={progress.checked} tone="success" />
                </span>
              </span>
              {job.tagIds.length > 0 ? <TagChips tags={tags} tagIds={job.tagIds} max={4} /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
    {hasNextPage ? (
      <Button
        variant="outline"
        onClick={fetchNextPage}
        disabled={isFetchingNextPage}
        className="self-center"
      >
        {isFetchingNextPage ? <Spinner /> : null}
        Tải thêm job
      </Button>
    ) : null}
  </div>
);

/** Empty states for the list (no jobs vs. nothing matches the filters). */
export const JobsEmpty = ({
  filtering,
  onReset,
  onCreate
}: {
  filtering: boolean;
  onReset: () => void;
  onCreate?: (() => void) | undefined;
}) =>
  filtering ? (
    <EmptyState
      icon={Briefcase}
      title="Không có job phù hợp"
      description="Thử bỏ bớt bộ lọc hoặc tìm theo mã khác."
      action={
        <Button variant="outline" size="sm" onClick={onReset}>
          Xóa bộ lọc
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Briefcase}
      title="Chưa có job"
      description="Tạo job cho từng gói ảnh của khách; Leader sẽ chia task cho nhân viên."
      action={
        onCreate ? (
          <Button size="sm" onClick={onCreate}>
            Tạo job
          </Button>
        ) : undefined
      }
    />
  );
