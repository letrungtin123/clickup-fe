import { cn } from "cn";
import { ArrowRight, CalendarClock, ChevronRight, Crown } from "lucide-react";
import { useId, useState } from "react";

import { Link } from "@/components/shared/router-link";
import { useSessionContext } from "@/features/auth/hooks";

import { useLedJobs, useProductionAccess, useProductionMe } from "../../hooks";
import { formatLedDeadline, jobsLedByHref } from "../members/member-admin";
import { JobStatusChip } from "./job-bits";

const OPEN_KEY = "production:my-tasks:led-open";
/** Cards shown in the strip; the rest are one click away in the jobs list (filtered to my jobs). */
const SHOWN = 24;

const readOpen = () => {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
};

/**
 * "Job tôi phụ trách" on Việc của tôi (2026-10-13): the open jobs whose Leader I am (not archived, manual status not
 * closed — the same list Admins see for a member). A job usually reaches its Leader before any line is split, so it
 * would otherwise be missing from this page. Nothing renders for people who lead no open job. One horizontal row of
 * cards (scrolls on phones), collapsible; the choice is remembered on this device.
 */
export const MyLedJobs = ({ className }: { className?: string }) => {
  const session = useSessionContext();
  const access = useProductionAccess();
  const me = useProductionMe();
  const myId = session.user.id;
  const led = useLedJobs(myId, access.isMember);
  const [open, setOpen] = useState(readOpen);
  // "Trễ hạn" against the moment the strip appeared (render stays pure).
  const [now] = useState(() => Date.now());
  const listId = useId();
  const items = led.data?.items ?? [];
  if (items.length === 0) return null;
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const shown = items.slice(0, SHOWN);
  const more = items.length - shown.length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // Storage unavailable: keep the choice for this visit only.
    }
  };

  return (
    <section aria-label="Job tôi phụ trách" className={cn("border-b px-4 py-2.5 md:px-6", className)}>
      <div className="flex min-h-9 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={listId}
          className="-ml-1 inline-flex min-h-9 items-center gap-2 rounded-md px-1 text-[13px] font-semibold outline-none hover:text-brand-text focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn("size-4 text-foreground-subtle transition-transform", open && "rotate-90")}
          />
          <Crown aria-hidden="true" className="size-4 text-brand-text" />
          Job tôi phụ trách
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-hover px-1.5 text-[11px] font-semibold tabular-nums text-foreground-muted">
            {items.length}
          </span>
        </button>
        <Link
          to={jobsLedByHref(myId)}
          className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-xs font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="max-sm:hidden">Xem trong danh sách job</span>
          <span className="sm:hidden">Xem tất cả</span>
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      {open ? (
        <ul
          id={listId}
          className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-1.5 pb-1 [scrollbar-width:thin] md:-mx-6 md:scroll-px-6 md:px-6"
        >
          {shown.map((job) => {
            const late = new Date(job.deadline).getTime() < now;
            return (
              <li key={job.id} className="w-60 shrink-0 snap-start sm:w-64">
                <Link
                  to={`/production/jobs/${job.id}`}
                  className="flex h-full flex-col gap-1.5 rounded-lg border bg-surface p-3 outline-none transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold" title={job.code}>
                      {job.code}
                    </span>
                    <JobStatusChip size="sm" status={job.jobStatus} className="max-w-28 shrink-0" />
                  </span>
                  <span
                    className={cn("truncate text-[13px]", job.name ? "text-foreground-muted" : "text-foreground-subtle")}
                    title={job.name ?? undefined}
                  >
                    {job.name ?? "Chưa đặt tên"}
                  </span>
                  <span className="mt-auto flex items-center gap-2.5 text-xs text-foreground-muted">
                    <span
                      className={cn("inline-flex min-w-0 items-center gap-1 tabular-nums", late && "font-medium text-danger")}
                      title={late ? "Đã quá hạn" : "Hạn giao"}
                    >
                      <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {formatLedDeadline(job.deadline, timeZone)}
                        {late ? " · trễ" : null}
                      </span>
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums">
                      {job.taskCount > 0 ? `${job.taskCount} task` : "Chưa chia"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {more > 0 ? (
            <li className="w-40 shrink-0 snap-start">
              <Link
                to={jobsLedByHref(myId)}
                className="flex h-full min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[13px] font-medium text-brand-text outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
              >
                +{more} job khác
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
};
