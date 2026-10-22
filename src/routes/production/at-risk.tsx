import { cn } from "cn";
import { ArrowLeft, History, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";

import { RouteFallback } from "@/components/layout/route-fallback";
import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/components/shared/router-link";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Person } from "@/features/production/components/jobs/job-bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { seesRiskHistory, type RiskHistory, type RiskHistoryJob } from "@/contracts/production-overview";
import { formatInteger, isDay, todayIn } from "@/features/production/format";
import { useProductionAccess, useProductionMe } from "@/features/production/hooks";
import { Segmented } from "@/features/production/overview/components/overview-filters";
import { dateTimeLabel, formatRange, lastWeeks, percentOf } from "@/features/production/overview/model";
import { useRiskHistory } from "@/features/production/overview/queries";
import { touchTargets } from "@/features/production/ui";

/** The range of the URL (both ends valid, in order), else the last 8 weeks. */
const historyRange = (from: string | null, to: string | null, today: string) =>
  from && to && isDay(from) && isDay(to) && from <= to ? { from, to } : lastWeeks(today);

const presets = [
  { weeks: 8, label: "8 tuần" },
  { weeks: 13, label: "3 tháng" },
  { weeks: 26, label: "6 tháng" }
] as const;

const endReasonLabels: Record<NonNullable<RiskHistoryJob["endReason"]>, string> = {
  CLEARED: "Tự tắt (bắt kịp)",
  FINISHED: "Đã xong việc",
  CLIENT_LATE: "Đã trễ khách",
  REMOVED: "Job lưu trữ / xoá"
};

const reasonLabels: Record<RiskHistoryJob["reason"], string> = {
  CAPACITY: "Không kịp với số người",
  UNASSIGNED: "Chưa ai được giao"
};

/**
 * /production/at-risk — PD-080 "Lịch sử At risk" for the superadmin and Director: jobs that were ever At risk (the
 * worker's estimate) per week, per Leader and per project, and how many of them really missed the client deadline.
 * `?from=&to=` (default the last 8 weeks). Never shown to Staff / QC (the API refuses everyone else).
 */
export const ProductionAtRiskRoute = () => {
  const me = useProductionMe();
  const { roles } = useProductionAccess();
  if (!me.data) return <RouteFallback />;
  return seesRiskHistory(roles) ? (
    <AtRiskPage timeZone={me.data.settings.timezone} />
  ) : (
    <div className={`flex h-full items-center justify-center p-4 ${touchTargets}`}>
      <EmptyState
        icon={ShieldAlert}
        title="Không có quyền xem lịch sử At risk"
        description="Lịch sử At risk dành cho Siêu quản trị và Director."
        action={
          <Button variant="outline" nativeButton={false} render={<Link to="/production" />}>
            Về Tổng quan
          </Button>
        }
      />
    </div>
  );
};

const AtRiskPage = ({ timeZone }: { timeZone: string }) => {
  const today = todayIn(timeZone);
  const [params, setParams] = useSearchParams();
  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  const range = historyRange(rawFrom, rawTo, today);
  const query = { from: range.from, to: range.to };
  const history = useRiskHistory(query);
  const data = history.data;
  const pick = (weeks: number) => {
    const next = lastWeeks(today, weeks);
    setParams(weeks === 8 ? new URLSearchParams() : new URLSearchParams(next), { replace: true });
  };
  return (
    <div className={`flex h-full min-h-0 flex-col max-md:overflow-y-auto ${touchTargets}`}>
      <PageHeader
        className="shrink-0"
        eyebrow="Photo Retouch · Tổng quan"
        title="Lịch sử At risk"
        description="Job từng bị cảnh báo At risk (ước tính, không ảnh hưởng điểm) — theo tuần, Leader, Project, và bao nhiêu job thật sự trễ khách."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link to="/production" />}>
            <ArrowLeft />
            <span className="max-sm:sr-only">Tổng quan</span>
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Khoảng thời gian">
            {presets.map((preset) => {
              const preset8 = lastWeeks(today, preset.weeks);
              const active = preset8.from === range.from && preset8.to === range.to;
              return (
                <button
                  key={preset.weeks}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pick(preset.weeks)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap pointer-coarse:h-9",
                    active ? "bg-surface text-foreground shadow-xs ring-1 ring-border" : "text-foreground-muted hover:text-foreground"
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </Segmented>
          <span className="text-xs text-foreground-muted tabular-nums">{formatRange(range, today)}</span>
        </div>
      </PageHeader>
      <div className="max-md:shrink-0 md:min-h-0 md:flex-1 md:overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
          {history.isPending ? (
            <div className="flex flex-col gap-4" aria-busy="true" aria-label="Đang tải lịch sử">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          ) : !data ? (
            <ErrorState error={history.error} onRetry={() => void history.refetch()} retrying={history.isFetching} />
          ) : (
            <HistoryBody history={data} timeZone={timeZone} stale={history.isPlaceholderData} />
          )}
        </div>
      </div>
    </div>
  );
};

const Panel = ({ title, children, className }: { title: string; children: ReactNode; className?: string }) => (
  <section aria-label={title} className={cn("min-w-0 overflow-hidden rounded-xl border bg-surface shadow-xs", className)}>
    <h2 className="border-b px-4 py-2.5 text-[13px] font-semibold">{title}</h2>
    {children}
  </section>
);

/** One "N job · M trễ khách" row with a bar of the share that was really late. */
const CountRow = ({ label, jobs, clientLate, max }: { label: ReactNode; jobs: number; clientLate: number; max: number }) => (
  <li className="flex min-w-0 items-center gap-3 px-4 py-2 text-[13px]">
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <span aria-hidden="true" className="hidden h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:flex">
      <span className="h-full bg-warning" style={{ width: `${percentOf(jobs - clientLate, max)}%` }} />
      <span className="h-full bg-danger" style={{ width: `${percentOf(clientLate, max)}%` }} />
    </span>
    <span className="w-28 shrink-0 text-right text-xs text-foreground-muted tabular-nums">
      <b className="text-foreground">{formatInteger(jobs)}</b> job · <span className={clientLate > 0 ? "text-danger" : ""}>{formatInteger(clientLate)} trễ</span>
    </span>
  </li>
);

const HistoryBody = ({ history, timeZone, stale }: { history: RiskHistory; timeZone: string; stale: boolean }) => {
  const maxWeek = Math.max(1, ...history.weeks.map((week) => week.jobs));
  const maxLeader = Math.max(1, ...history.leaders.map((row) => row.jobs));
  const maxProject = Math.max(1, ...history.projects.map((row) => row.jobs));
  if (history.totals.jobs === 0) {
    return (
      <EmptyState
        icon={History}
        title="Chưa có job nào bị At risk trong khoảng này"
        description="Cảnh báo được ước tính mỗi 15 phút; lịch sử bắt đầu từ khi tính năng chạy."
      />
    );
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-4 transition-opacity", stale && "opacity-60")}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Job từng At risk", value: history.totals.jobs },
          { label: "Thật sự trễ khách", value: history.totals.clientLate, danger: true },
          { label: "Lần bật cờ", value: history.totals.episodes },
          { label: "Đang At risk", value: history.totals.open }
        ].map((tile) => (
          <div key={tile.label} className="flex min-w-0 flex-col gap-1 rounded-xl border bg-surface p-3 shadow-xs">
            <span className="truncate text-xs text-foreground-muted">{tile.label}</span>
            <span className={cn("text-2xl font-semibold tabular-nums", tile.danger && tile.value > 0 && "text-danger")}>
              {formatInteger(tile.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Panel title="Theo tuần">
          <ul className="divide-y">
            {history.weeks.map((week) => (
              <CountRow key={week.week} label={`Tuần ${week.week.slice(8, 10)}/${week.week.slice(5, 7)}`} jobs={week.jobs} clientLate={week.clientLate} max={maxWeek} />
            ))}
          </ul>
        </Panel>
        <Panel title="Theo Leader">
          <ul className="divide-y">
            {history.leaders.map((row) => (
              <CountRow
                key={row.leader?.id ?? "none"}
                label={<Person user={row.leader} fallback="Chưa có Leader" />}
                jobs={row.jobs}
                clientLate={row.clientLate}
                max={maxLeader}
              />
            ))}
          </ul>
        </Panel>
        <Panel title="Theo Project">
          <ul className="divide-y">
            {history.projects.map((row) => (
              <CountRow
                key={row.project.id}
                label={
                  <span title={row.project.name}>
                    <b className="font-semibold">{row.project.code}</b> <span className="text-foreground-muted">{row.project.name}</span>
                  </span>
                }
                jobs={row.jobs}
                clientLate={row.clientLate}
                max={maxProject}
              />
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title={`Job (${formatInteger(history.jobs.length)})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="bg-muted/50 text-left text-[11px] font-semibold tracking-wide text-foreground-muted uppercase">
              <tr>
                <th className="px-4 py-2">Job Code</th>
                <th className="px-3 py-2">Leader</th>
                <th className="px-3 py-2">Lý do</th>
                <th className="px-3 py-2">Bật / tắt</th>
                <th className="px-3 py-2">Deadline khách</th>
                <th className="px-4 py-2">Trễ khách thật</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.jobs.map((row) => (
                <tr key={row.job.id}>
                  <td className="px-4 py-2">
                    <Link to={`/production/jobs/${row.job.id}`} className="font-semibold hover:underline">
                      {row.job.code}
                    </Link>
                    <span className="ml-1.5 text-xs text-foreground-muted">{row.job.project.code}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Person user={row.leader} size="xs" fallback="—" />
                  </td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {reasonLabels[row.reason]}
                    {row.episodes > 1 ? ` · ${row.episodes} lần` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-foreground-muted tabular-nums">
                    {dateTimeLabel(row.startedAt, timeZone)} → {row.endedAt ? dateTimeLabel(row.endedAt, timeZone) : "đang bật"}
                    {row.endReason ? <span className="block">{endReasonLabels[row.endReason]}</span> : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{dateTimeLabel(row.deadline, timeZone)}</td>
                  <td className={cn("px-4 py-2 font-medium", row.clientLate ? "text-danger" : "text-success")}>
                    {row.clientLate ? "Có" : "Không"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};
