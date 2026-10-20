import { cn } from "cn";
import {
  ArrowUpRight,
  Briefcase,
  ChartColumnBig,
  CircleCheck,
  ClipboardList,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";
import { useMemo } from "react";

import { Link } from "@/components/shared/router-link";
import { ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeaturePermissionKey, ProductionRole } from "@/contracts/production-catalog";
import {
  JobStatusChip,
  LateBadge,
  StatusChip
} from "@/features/production/components/jobs/job-bits";
import { isProductionHidden } from "@/features/production/errors";
import {
  formatCredit,
  formatDay,
  formatKpiPeriod,
  formatMoney,
  formatNumber
} from "@/features/production/format";
import { useProductionMe } from "@/features/production/hooks";
import { useJobs, useMyTasks, useQcQueue } from "@/features/production/jobs-hooks";
import {
  flattenPages,
  formatDateTime,
  formatWorkDay,
  qtyText,
  relativeDeadline,
  taskAgenda
} from "@/features/production/jobs-model";
import { useMyScores } from "@/features/production/scores/hooks";
import { useOpenTask } from "@/features/production/task-link";

/**
 * Photo Retouch agenda ("Việc cần làm"): what needs doing now, per role. Shown on the module overview (/production)
 * and on Trang chủ while the Photo Retouch department is current (PD-041; Trang chủ loads this file lazily so the
 * Production department never downloads it).
 */

/** Trang chủ: loads the caller's production roles first; nothing while the module is closed to them. */
export const HomeProductionAgenda = () => {
  const me = useProductionMe();
  if (me.isPending) {
    return <ProductionAgendaFallback />;
  }
  if (me.isError) {
    return isProductionHidden(me.error) ? null : (
      <ErrorState
        size="sm"
        error={me.error}
        onRetry={() => void me.refetch()}
        retrying={me.isFetching}
      />
    );
  }
  return (
    <ProductionAgenda
      roles={me.data.roles}
      features={me.data.features}
      timeZone={me.data.settings.timezone}
      withMyTasks={false}
    />
  );
};

/** Placeholder with the agenda's footprint while /production/me loads. */
const ProductionAgendaFallback = () => (
  <section className="flex flex-col gap-3" aria-busy="true" aria-label="Đang tải việc cần làm">
    <Skeleton className="h-4 w-28" />
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
    </div>
  </section>
);

const taskRoles: readonly ProductionRole[] = ["STAFF", "QC", "LEADER"];

/**
 * What needs doing now, per role: my open tasks (Staff / QC / Leader), the QC queue (QC holding the "Hàng chờ QC"
 * feature, PD-065; `features` unknown → the role alone) and late jobs (Leader / Account / Admin / Director, who all see
 * every job). `withMyTasks: false` (the module overview, owner
 * 2026-10-16) leaves "Việc của tôi" out — it is a sidebar page of its own — and lays the other cards out in a grid.
 */
export const ProductionAgenda = ({
  roles,
  features,
  timeZone,
  withMyTasks = true
}: {
  roles: readonly ProductionRole[];
  /** The caller's features (`/production/me`, PD-065). */
  features?: readonly FeaturePermissionKey[] | undefined;
  timeZone: string;
  withMyTasks?: boolean;
}) => {
  const hasTasks = roles.some((role) => taskRoles.includes(role));
  const isQc = roles.includes("QC") && (features?.includes("qc_queue") ?? true);
  const watchesJobs =
    roles.includes("LEADER") ||
    roles.includes("ACCOUNT") ||
    roles.includes("ADMIN") ||
    roles.includes("DIRECTOR");
  if (!hasTasks && !isQc && !watchesJobs) return null;
  if (!withMyTasks) {
    return (
      <section aria-labelledby="production-agenda" className="flex flex-col gap-3">
        <h2 id="production-agenda" className="text-sm font-semibold">
          Việc cần làm
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {isQc ? <QcCard timeZone={timeZone} /> : null}
          {watchesJobs ? <LateJobsCard timeZone={timeZone} /> : null}
          {hasTasks ? <MyPointsCard /> : null}
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="production-agenda" className="flex flex-col gap-3">
      <h2 id="production-agenda" className="text-sm font-semibold">
        Việc cần làm
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {hasTasks ? <MyTasksCard timeZone={timeZone} /> : null}
        {isQc || watchesJobs || hasTasks ? (
          <div className="flex min-w-0 flex-col gap-4">
            {isQc ? <QcCard timeZone={timeZone} /> : null}
            {watchesJobs ? <LateJobsCard timeZone={timeZone} /> : null}
            {/* People who earn points (worker / QC / Leader) see today / week / period at a glance. */}
            {hasTasks ? <MyPointsCard /> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
};

/**
 * "Điểm của tôi": official points today, this week and this KPI period (GET /scores/me cards); PD-066: the Khoán work
 * of the period as money ("Tiền Khoán tạm tính"), never as points.
 */
const MyPointsCard = () => {
  const scores = useMyScores(null);
  const cards = scores.data?.pages[0]?.cards;
  const khoanMoney = cards?.period.moneyKhoanProvisional ?? 0;
  return (
    <AgendaCard
      title="Điểm của tôi"
      icon={ChartColumnBig}
      to="/production/scores"
      linkLabel="Bảng điểm"
    >
      {scores.isPending ? (
        <AgendaSkeleton rows={1} />
      ) : scores.isError || !cards ? (
        <ErrorState
          size="sm"
          error={scores.error}
          onRetry={() => void scores.refetch()}
          retrying={scores.isFetching}
        />
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <Count label="Hôm nay" value={formatCredit(cards.today.pointsOfficial)} />
            <Count label="Tuần này" value={formatCredit(cards.week.pointsOfficial)} />
            <Count
              label={`Kỳ ${formatKpiPeriod(cards.period.period)}`}
              value={formatCredit(cards.period.pointsOfficial)}
            />
          </dl>
          <p className="text-xs text-foreground-muted">
            Điểm chính thức · kỳ {formatDay(cards.period.from)} – {formatDay(cards.period.to)}
            {khoanMoney !== 0 ? ` · Tiền Khoán tạm tính ${formatMoney(khoanMoney)}` : ""}
          </p>
        </>
      )}
    </AgendaCard>
  );
};

const AgendaCard = ({
  title,
  icon: Icon,
  to,
  linkLabel,
  children
}: {
  title: string;
  icon: LucideIcon;
  to: string;
  linkLabel: string;
  children: React.ReactNode;
}) => (
  <section className="flex min-w-0 flex-col gap-3 rounded-xl border bg-surface p-4 shadow-xs">
    <header className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
      <h3 className="truncate text-[13px] font-semibold">{title}</h3>
      <Link
        to={to}
        className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded px-1 text-xs font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10"
      >
        {linkLabel}
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    </header>
    {children}
  </section>
);

const AgendaSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Đang tải">
    {Array.from({ length: rows }, (_, index) => (
      <Skeleton key={index} className="h-10 rounded-lg" />
    ))}
  </div>
);

const Calm = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-[13px] text-foreground-muted">
    <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
    {children}
  </p>
);

const Count = ({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "danger" | "warning" | undefined;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2">
    <dt className="truncate text-[11px] text-foreground-muted">{label}</dt>
    <dd
      className={cn(
        "text-lg font-semibold tabular-nums",
        tone === "danger" && value !== "0" && "text-danger",
        tone === "warning" && value !== "0" && "text-warning"
      )}
    >
      {value}
    </dd>
  </div>
);

const rowClass =
  "flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring";

const MyTasksCard = ({ timeZone }: { timeZone: string }) => {
  const tasks = useMyTasks("all", false);
  const openTask = useOpenTask();
  const items = useMemo(() => flattenPages(tasks.data?.pages), [tasks.data]);
  const agenda = useMemo(() => taskAgenda(items, timeZone), [items, timeZone]);
  return (
    <AgendaCard
      title="Việc của tôi"
      icon={ClipboardList}
      to="/production/my-tasks"
      linkLabel="Xem tất cả"
    >
      {tasks.isPending ? (
        <AgendaSkeleton rows={4} />
      ) : tasks.isError ? (
        <ErrorState
          size="sm"
          error={tasks.error}
          onRetry={() => void tasks.refetch()}
          retrying={tasks.isFetching}
        />
      ) : agenda.open === 0 ? (
        <Calm>Không còn việc đang mở.</Calm>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <Count
              label="Đang mở"
              value={`${formatNumber(agenda.open)}${tasks.hasNextPage ? "+" : ""}`}
            />
            <Count label="Trễ hạn" value={formatNumber(agenda.late)} tone="danger" />
            <Count label="Hạn hôm nay" value={formatNumber(agenda.dueToday)} tone="warning" />
          </dl>
          <ul className="-mx-2 flex flex-col" aria-label="Task gần hạn nhất">
            {agenda.next.map((task) => {
              const deadline = task.doneAt === null ? relativeDeadline(task.deadline) : null;
              return (
                <li key={task.id}>
                  <button type="button" className={rowClass} onClick={() => openTask(task.id)}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        #{task.code} · {task.process.name}
                      </span>
                      <span className="truncate text-xs text-foreground-muted">
                        {task.jobCode} · {qtyText(task.qtyAssigned)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <StatusChip status={task.status} size="sm" />
                      <span
                        className={cn(
                          "text-[11px] tabular-nums",
                          deadline?.late ? "font-medium text-danger" : "text-foreground-muted"
                        )}
                      >
                        {deadline ? deadline.label : "đã xong, chờ bước sau"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AgendaCard>
  );
};

const QcCard = ({ timeZone }: { timeZone: string }) => {
  const queue = useQcQueue();
  const openTask = useOpenTask();
  const items = queue.data?.items ?? [];
  return (
    <AgendaCard title="Chờ bạn QC" icon={ShieldCheck} to="/production/qc" linkLabel="Mở hàng chờ">
      {queue.isPending ? (
        <AgendaSkeleton rows={2} />
      ) : queue.isError ? (
        <ErrorState
          size="sm"
          error={queue.error}
          onRetry={() => void queue.refetch()}
          retrying={queue.isFetching}
        />
      ) : items.length === 0 ? (
        <Calm>Không có task chờ QC.</Calm>
      ) : (
        <>
          <p className="text-[13px] text-foreground-muted">
            <span className="text-lg font-semibold text-foreground tabular-nums">
              {formatNumber(items.length)}
            </span>{" "}
            task đang chờ, cũ nhất trước.
          </p>
          <ul className="-mx-2 flex flex-col">
            {items.slice(0, 3).map((task) => (
              <li key={task.id}>
                <button type="button" className={rowClass} onClick={() => openTask(task.id)}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      #{task.code} · {task.process.name}
                    </span>
                    <span className="truncate text-xs text-foreground-muted">
                      {task.jobCode} · {task.assignee.displayName}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-foreground-muted tabular-nums">
                    Xong {formatDateTime(task.doneAt, timeZone)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </AgendaCard>
  );
};

const lateJobsQuery = { late: "true" } as const;

const LateJobsCard = ({ timeZone }: { timeZone: string }) => {
  const jobs = useJobs(lateJobsQuery);
  const items = useMemo(() => flattenPages(jobs.data?.pages), [jobs.data]);
  return (
    <AgendaCard
      title="Job có task trễ"
      icon={Briefcase}
      to="/production/jobs?late=1"
      linkLabel="Xem danh sách"
    >
      {jobs.isPending ? (
        <AgendaSkeleton rows={2} />
      ) : jobs.isError ? (
        <ErrorState
          size="sm"
          error={jobs.error}
          onRetry={() => void jobs.refetch()}
          retrying={jobs.isFetching}
        />
      ) : items.length === 0 ? (
        <Calm>Không có job nào đang trễ.</Calm>
      ) : (
        <>
          <p className="text-[13px] text-foreground-muted">
            <span className="text-lg font-semibold text-danger tabular-nums">
              {formatNumber(items.length)}
              {jobs.hasNextPage ? "+" : ""}
            </span>{" "}
            job đang có task trễ hạn.
          </p>
          <ul className="-mx-2 flex flex-col">
            {items.slice(0, 3).map((job) => (
              <li key={job.id}>
                <Link to={`/production/jobs/${job.id}`} className={rowClass}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{job.code}</span>
                    <span className="truncate text-xs text-foreground-muted">
                      <span className="font-mono">{job.project.code}</span> · giao{" "}
                      {formatWorkDay(job.deadline, timeZone)}
                    </span>
                  </span>
                  {/* The manual status (PD-038) above the late count; a long name ends in "…". */}
                  <span className="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5">
                    <JobStatusChip status={job.jobStatus} size="sm" />
                    <LateBadge label={`${job.lateTaskCount} trễ`} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </AgendaCard>
  );
};
