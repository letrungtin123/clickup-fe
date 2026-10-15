import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import { Archive, Briefcase } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "@/components/shared/router-link";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { CustomField } from "@/contracts/production-catalog";
import type { JobPersonShare, JobSummary } from "@/contracts/production-jobs";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { formatInteger } from "../../format";
import { useTags } from "../../hooks";
import { formatWorkDay, jobProgress, shortName } from "../../jobs-model";
import type { Tag } from "../../types";
import { CustomFieldValue } from "../custom-field-input";
import { CustomFieldChips } from "../list-filters";
import { TagChips } from "../tag-picker";
import { JobStatusChip, LateBadge, MiniBar, ProcessTotalChips } from "./job-bits";
import { JobPeopleStack } from "./job-people";

const ROW_HEIGHT = 60;
const FIELD_MIN_REM = 7.5;

/** The person of the per-person view ("Mọi nhân viên", PD-034): their part of each job is shown. */
export type ListPerson = { id: string; displayName: string };

/**
 * Table columns as [track, minimum rem]. The table is as wide as its container but never narrower
 * than the minimums (plus 7.5rem per custom-field column); narrower screens scroll sideways with the
 * job column pinned. Gói công việc (PD-035), "Người làm" (avatars, at most 4 + "+N"), Ngày giao and the manual job status (PD-038) come first.
 * PD-048: "Công đoạn" after "Tổng tấm" breaks the job's images down by process (chips, two at most, then "+N" with
 * the full list as the tooltip) — for everyone who sees the list.
 * Per-person view: "Công đoạn" (the person's processes) replaces "Người làm", and the image columns
 * become the person's own: Giao · Xong · Đã kiểm (the job's "Tổng tấm" and its breakdown are not theirs, so they
 * go). No feedback column: the separate feedback feature is retired (PD-045; client feedback is the job status
 * "Feedback").
 */
const tableColumns = (perPerson: boolean): [string, number][] => [
  ["minmax(13.5rem,2fr)", 13.5],
  perPerson ? ["minmax(10rem,1.5fr)", 10] : ["7.5rem", 7.5],
  ["8rem", 8],
  // Trạng thái: fixed, so rows never shift; the default names ("Đang giao client") fit, longer ones end in "…".
  ["9rem", 9],
  ...(perPerson
    ? Array.from({ length: 3 }, (): [string, number] => ["5.75rem", 5.75])
    : ([
        ["5rem", 5],
        // PD-048 "Tổng tấm" per process: one chip per line, two at most.
        ["minmax(11rem,1.4fr)", 11],
        ["5.25rem", 5.25],
        ["5.25rem", 5.25],
        ["5.25rem", 5.25]
      ] as [string, number][])),
  ["minmax(7rem,1fr)", 7]
];

const noShare: JobPersonShare = {
  processes: [],
  taskCount: 0,
  qtyAssigned: 0,
  qtyDone: 0,
  qtyChecked: 0
};

type JobsListProps = {
  jobs: JobSummary[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  timeZone: string;
  /** Active JOB custom fields; the `showInTable` ones become columns (chips on phone cards). */
  fields?: readonly CustomField[] | undefined;
  /** Per-person view: the rows' `personShare` belongs to this person. */
  person?: ListPerson | null | undefined;
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

const ratio = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0);

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
    <span className="text-[13px] tabular-nums">{formatInteger(value)}</span>
    <MiniBar value={ratio(value, total)} tone={tone} />
  </span>
);

/** Header of a per-person column: the label, then "của {tên}" so the numbers read as the person's. */
const PersonHeader = ({ label, person }: { label: string; person: ListPerson }) => (
  <span
    role="columnheader"
    className="flex min-w-0 flex-col justify-center px-3 leading-tight"
    title={`${label} của ${person.displayName}`}
  >
    <span className="truncate whitespace-nowrap">{label}</span>
    <span className="truncate text-[10px] font-semibold text-brand-text">
      của {shortName(person.displayName)}
    </span>
  </span>
);

const processText = (share: JobPersonShare) => share.processes.join(", ");

const JobTable = ({
  jobs,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  timeZone,
  tags,
  person = null,
  fields = []
}: JobsListProps & { tags: Tag[] }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columns = fields.filter((field) => field.showInTable);
  const base = tableColumns(person !== null);
  const template = [
    ...base.map(([track]) => track),
    ...columns.map(() => `minmax(${FIELD_MIN_REM}rem,1fr)`)
  ].join(" ");
  const minRem = base.reduce((sum, [, min]) => sum + min, 0) + columns.length * FIELD_MIN_REM;
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

  // More columns to the right (custom fields often are): a fade on the edge says "scroll".
  const [moreRight, setMoreRight] = useState(false);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const update = () =>
      setMoreRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 4);
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [columns.length, minRem]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border bg-surface shadow-xs"
        style={{ "--job-cols": template } as CSSProperties}
      >
        <div
          role="table"
          aria-label={person ? `Danh sách job của ${person.displayName}` : "Danh sách job"}
          aria-rowcount={jobs.length + 1}
          style={{ minWidth: `${minRem}rem` }}
        >
          <div
            role="row"
            className="sticky top-0 z-20 grid h-10 grid-cols-(--job-cols) items-center border-b bg-surface/95 text-xs font-medium text-foreground-muted backdrop-blur-sm"
          >
            <span
              role="columnheader"
              className="sticky left-0 z-10 flex h-full items-center bg-surface px-4 shadow-[1px_0_0_var(--border)]"
            >
              Gói công việc
            </span>
            {person ? (
              <PersonHeader label="Công đoạn" person={person} />
            ) : (
              <span role="columnheader" className="px-3 whitespace-nowrap">
                Người làm
              </span>
            )}
            <span role="columnheader" className="px-3 whitespace-nowrap">
              Ngày giao
            </span>
            <span role="columnheader" className="px-3">
              Trạng thái
            </span>
            {person ? (
              <>
                <PersonHeader label="Giao" person={person} />
                <PersonHeader label="Xong" person={person} />
                <PersonHeader label="Đã kiểm" person={person} />
              </>
            ) : (
              <>
                <span role="columnheader" className="px-3 text-right whitespace-nowrap">
                  Tổng tấm
                </span>
                <span
                  role="columnheader"
                  className="px-3 whitespace-nowrap"
                  title="Tổng tấm theo công đoạn"
                >
                  Công đoạn
                </span>
                <span role="columnheader" className="px-3">
                  Đã giao
                </span>
                <span role="columnheader" className="px-3">
                  Đã xong
                </span>
                <span role="columnheader" className="px-3">
                  Đã kiểm
                </span>
              </>
            )}
            <span role="columnheader" className="px-3">
              Tag
            </span>
            {columns.map((field) => (
              <span
                key={field.id}
                role="columnheader"
                className="truncate px-3 whitespace-nowrap"
                title={field.label}
              >
                {field.label}
              </span>
            ))}
          </div>
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {items.map((virtualRow) => {
              const job = jobs[virtualRow.index];
              if (!job) return null;
              const late = job.lateTaskCount > 0;
              const share = job.personShare ?? noShare;
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
                      <span className="truncate font-medium" title={job.code}>
                        {job.code}
                      </span>
                    </span>
                    {job.name ? (
                      <span className="truncate text-xs text-foreground-muted" title={job.name}>
                        {job.name}
                      </span>
                    ) : null}
                  </span>
                  {person ? (
                    <span role="cell" className="min-w-0 px-3">
                      <span className="line-clamp-2 leading-snug" title={processText(share)}>
                        {processText(share) || "—"}
                      </span>
                    </span>
                  ) : (
                    <span role="cell" className="flex min-w-0 px-2.5">
                      <JobPeopleStack people={job.people} />
                    </span>
                  )}
                  <span role="cell" className="flex flex-col gap-0.5 px-3">
                    <span className={cn("tabular-nums", late && "font-medium text-danger")}>
                      {formatWorkDay(job.deadline, timeZone)}
                    </span>
                    {late ? (
                      <LateBadge label={`${job.lateTaskCount} trễ`} className="self-start" />
                    ) : null}
                  </span>
                  <span role="cell" className="flex min-w-0 items-center px-3">
                    {/* The manual status (PD-038); one line, a long name ends in "…" (tooltip). */}
                    <JobStatusChip status={job.jobStatus} size="sm" />
                  </span>
                  {person ? (
                    <>
                      <span role="cell" className="px-3">
                        {/* Bar: their share of the job's images. */}
                        <Qty value={share.qtyAssigned} total={job.totalImages} tone="muted" />
                      </span>
                      <span role="cell" className="px-3">
                        <Qty value={share.qtyDone} total={share.qtyAssigned} tone="brand" />
                      </span>
                      <span role="cell" className="px-3">
                        <Qty value={share.qtyChecked} total={share.qtyAssigned} tone="success" />
                      </span>
                    </>
                  ) : (
                    <>
                      <span role="cell" className="px-3 text-right tabular-nums">
                        {formatInteger(job.totalImages)}
                      </span>
                      <span role="cell" className="flex min-w-0 px-3">
                        {job.processTotals.length > 0 ? (
                          <ProcessTotalChips totals={job.processTotals} max={2} layout="stack" />
                        ) : (
                          <span className="text-foreground-subtle">—</span>
                        )}
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
                    </>
                  )}
                  <span role="cell" className="min-w-0 px-3">
                    <TagChips tags={tags} tagIds={job.tagIds} max={2} />
                  </span>
                  {columns.map((field) => (
                    <span key={field.id} role="cell" className="flex min-w-0 px-3">
                      <CustomFieldValue
                        field={field}
                        value={job.customValues[field.key]}
                        className="min-w-0"
                      />
                    </span>
                  ))}
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
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-px right-px w-12 rounded-r-xl bg-linear-to-l from-surface to-transparent transition-opacity duration-200",
          moreRight ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
};

/** One "label number / bar" cell of a phone card. */
const CardQty = ({
  label,
  value,
  of,
  percent,
  tone = "brand"
}: {
  label: string;
  value: number;
  /** "Giao 80/100": the job's total images. */
  of?: number | undefined;
  percent: number;
  tone?: "brand" | "success" | "muted" | "warning";
}) => (
  <span className="flex min-w-0 flex-col gap-1">
    <span className="truncate text-foreground-muted">
      {label} <b className="font-semibold text-foreground tabular-nums">{formatInteger(value)}</b>
      {of !== undefined ? `/${formatInteger(of)}` : ""}
    </span>
    <MiniBar value={percent} tone={tone} />
  </span>
);

const JobCards = ({
  jobs,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  timeZone,
  tags,
  person = null,
  fields = []
}: JobsListProps & { tags: Tag[] }) => (
  <div className="flex flex-col gap-2.5">
    <ul className="flex flex-col gap-2.5">
      {jobs.map((job) => {
        const late = job.lateTaskCount > 0;
        const progress = jobProgress(job);
        const share = job.personShare ?? noShare;
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
                  <span
                    className="line-clamp-2 text-sm font-semibold [overflow-wrap:anywhere]"
                    title={job.code}
                  >
                    {job.code}
                  </span>
                  {job.name ? (
                    <span className="truncate text-xs text-foreground-muted" title={job.name}>
                      {job.name}
                    </span>
                  ) : null}
                </span>
                {/* At most half the row, so the package name keeps its room. */}
                <JobStatusChip status={job.jobStatus} size="sm" className="max-w-[50%] shrink-0" />
              </span>
              {/* Ngày giao always fills this line, so the leader is left to the job page. */}
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
                <span className={cn("tabular-nums", late && "font-medium text-danger")}>
                  Giao {formatWorkDay(job.deadline, timeZone)}
                </span>
                {late ? <LateBadge label={`${job.lateTaskCount} trễ`} /> : null}
              </span>
              {person ? (
                <span className="flex flex-col gap-2 rounded-lg bg-brand-soft px-2.5 py-2 text-xs">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="font-semibold text-brand-text">
                      Phần của {shortName(person.displayName)}
                    </span>
                    <span className="text-foreground-muted">
                      {" · "}
                      {processText(share) || "—"}
                    </span>
                  </span>
                  <span className="grid grid-cols-3 gap-3">
                    <CardQty
                      label="Giao"
                      value={share.qtyAssigned}
                      of={job.totalImages}
                      percent={ratio(share.qtyAssigned, job.totalImages)}
                      tone="muted"
                    />
                    <CardQty
                      label="Xong"
                      value={share.qtyDone}
                      percent={ratio(share.qtyDone, share.qtyAssigned)}
                    />
                    <CardQty
                      label="Đã kiểm"
                      value={share.qtyChecked}
                      percent={ratio(share.qtyChecked, share.qtyAssigned)}
                      tone="success"
                    />
                  </span>
                </span>
              ) : (
                <>
                  {job.people.workers.length > 0 ? (
                    <JobPeopleStack people={job.people} showCount className="-my-1 self-start" />
                  ) : null}
                  <span className="grid grid-cols-3 gap-3 text-xs">
                    <CardQty
                      label="Giao"
                      value={job.qtyAssigned}
                      of={job.totalImages}
                      percent={progress.assigned}
                      tone={progress.overAllocated ? "warning" : "muted"}
                    />
                    <CardQty label="Xong" value={job.qtyDone} percent={progress.done} />
                    <CardQty
                      label="Đã kiểm"
                      value={job.qtyChecked}
                      percent={progress.checked}
                      tone="success"
                    />
                  </span>
                  {/* PD-048 "Tổng tấm" per process; the job page lists them all. */}
                  <ProcessTotalChips totals={job.processTotals} max={4} />
                </>
              )}
              <CustomFieldChips fields={fields} values={job.customValues} />
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
      description="Mỗi job là một gói công việc của dự án. Tạo job, hoặc “Nhập công việc” để thêm task — gói mới tự thành job."
      action={
        onCreate ? (
          <Button size="sm" onClick={onCreate}>
            Tạo job
          </Button>
        ) : undefined
      }
    />
  );
