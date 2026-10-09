import { cn } from "cn";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  BellRing,
  Briefcase,
  CalendarDays,
  CalendarRange,
  ChartColumnBig,
  CircleCheck,
  ClipboardList,
  Coins,
  Eye,
  EyeOff,
  Network,
  Paperclip,
  ShieldCheck,
  Trophy,
  type LucideIcon
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

import { ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductionRole } from "@/contracts/production-catalog";
import { useSessionContext } from "@/features/auth/hooks";
import { LateBadge, StatusChip } from "@/features/production/components/jobs/job-bits";
import { RoleBadge } from "@/features/production/components/role-chips";
import { formatDay, formatNumber, kpiPeriod, todayIn } from "@/features/production/format";
import { useProductionMe, useTeams } from "@/features/production/hooks";
import { useJobs, useMyTasks, useQcQueue } from "@/features/production/jobs-hooks";
import {
  flattenPages,
  formatDateTime,
  relativeDeadline,
  taskAgenda
} from "@/features/production/jobs-model";
import { settingsPageBySlug, visibleSettingsPages } from "@/features/production/nav";
import { productionRoleDescriptions, sortRoles } from "@/features/production/roles";
import { useOpenTask } from "@/features/production/task-link";

const ease = [0.22, 1, 0.36, 1] as const;

const greetingFor = (date: Date) => {
  const hour = date.getHours();
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
};

/** Quick links worth surfacing first for admins (the rest live in the settings navigation). */
const featuredSlugs = [
  "members",
  "credit-rules",
  "workflow",
  "clients",
  "custom-fields",
  "general"
];

/**
 * /production — the module's landing page: what needs doing now (my open tasks, the QC queue, late
 * jobs — per role, BUG-PR-21), who you are in production and the rules in force.
 */
export const ProductionOverviewRoute = () => {
  const session = useSessionContext();
  const me = useProductionMe();
  const teams = useTeams();
  const now = new Date();

  // The layout route only renders this once /production/me resolved with at least one role.
  if (!me.data) return null;
  const { roles, settings, teamId } = me.data;
  const today = todayIn(settings.timezone);
  const period = kpiPeriod(today, settings.kpiCloseDay);
  const team = teams.data?.items.find((item) => item.id === teamId) ?? null;
  const links = visibleSettingsPages(roles)
    .filter((page) => featuredSlugs.includes(page.slug))
    .sort((a, b) => featuredSlugs.indexOf(a.slug) - featuredSlugs.indexOf(b.slug));
  const clientsOnly = !roles.includes("ADMIN") && roles.includes("ACCOUNT");

  return (
    <div className="h-full overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease }}
        className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10"
      >
        <header className="flex flex-col gap-1">
          <p className="text-[13px] text-foreground-muted first-letter:uppercase">
            Sản xuất · {format(now, "EEEE, d MMMM", { locale: vi })}
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            {greetingFor(now)}, {session.user.displayName}
          </h1>
        </header>

        <Agenda roles={roles} timeZone={settings.timezone} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section
            aria-labelledby="production-me"
            className="flex flex-col gap-4 rounded-xl border bg-surface p-5 shadow-xs"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="production-me" className="text-sm font-semibold">
                Vai trò của bạn
              </h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-foreground-muted">
                <Network className="size-3.5" aria-hidden="true" />
                {teams.isPending ? (
                  <Skeleton className="h-3 w-16" />
                ) : team ? (
                  <>Team {team.name}</>
                ) : (
                  "Chưa thuộc team nào"
                )}
              </span>
            </div>
            <ul className="flex flex-col gap-3">
              {sortRoles(roles).map((role) => (
                <li key={role} className="flex items-start gap-3">
                  <RoleBadge role={role} className="mt-0.5 w-20 justify-center" />
                  <span className="text-[13px] leading-relaxed text-foreground-muted">
                    {productionRoleDescriptions[role]}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="production-rules"
            className="flex flex-col gap-3 rounded-xl border bg-surface p-5 shadow-xs"
          >
            <h2 id="production-rules" className="text-sm font-semibold">
              Quy định đang áp dụng
            </h2>
            <dl className="flex flex-col gap-2.5 text-[13px]">
              <Rule icon={CalendarRange} label="Kỳ KPI hiện tại">
                {period ? (
                  <>
                    {formatDay(period.start)} – {formatDay(period.end)}
                    <span className="text-foreground-muted">
                      {" "}
                      ·{" "}
                      {period.daysLeft <= 1
                        ? "chốt hôm nay"
                        : `còn ${period.daysLeft} ngày tới ngày chốt (tính cả hôm nay)`}
                    </span>
                  </>
                ) : (
                  `Chốt ngày ${settings.kpiCloseDay} hằng tháng`
                )}
              </Rule>
              <Rule icon={settings.scoresPublic ? Eye : EyeOff} label="Bảng điểm">
                {settings.scoresPublic ? "Công khai cho mọi người" : "Riêng tư"}
              </Rule>
              <Rule icon={Coins} label="Tiền công">
                {settings.moneyPublic ? "Công khai" : "Chỉ chính chủ và Quản trị thấy"}
              </Rule>
              <Rule icon={Paperclip} label="Tệp trong chat">
                {settings.chatAttachmentsEnabled ? "Được phép" : "Đang tắt"}
              </Rule>
            </dl>
            <p className="text-xs text-foreground-subtle">Theo giờ {settings.timezone}.</p>
          </section>
        </div>

        <section aria-labelledby="production-links" className="flex flex-col gap-3">
          <h2 id="production-links" className="text-sm font-semibold">
            Lối tắt
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <QuickLink
                to="/production/scores"
                icon={ChartColumnBig}
                title="Bảng điểm"
                description="Điểm hôm nay, tuần, kỳ; tiền Khoán tạm tính và dự báo KPI."
              />
            </li>
            <li>
              <QuickLink
                to="/production/scores/board"
                icon={Trophy}
                title="Xếp hạng"
                description="Xếp hạng điểm chính thức theo kỳ và team."
              />
            </li>
            <li>
              <QuickLink
                to="/production/leave"
                icon={CalendarDays}
                title="Lịch nghỉ"
                description="Ai nghỉ ngày nào; xin nghỉ và theo dõi đơn của bạn."
              />
            </li>
            {(clientsOnly ? [settingsPageBySlug("clients")] : links).map((page) =>
              page ? (
                <li key={page.slug}>
                  <QuickLink
                    to={clientsOnly ? "/production/clients" : `/production/settings/${page.slug}`}
                    icon={page.icon}
                    title={page.label}
                    description={page.description}
                  />
                </li>
              ) : null
            )}
            <li>
              <QuickLink
                to="/settings/profile"
                icon={BellRing}
                title="Thông báo của tôi"
                description="Chọn nhận thông báo trên web và qua email."
              />
            </li>
          </ul>
        </section>
      </motion.div>
    </div>
  );
};

const Rule = ({
  icon: Icon,
  label,
  children
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-start gap-3">
    <Icon className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
    <dt className="w-28 shrink-0 text-foreground-muted">{label}</dt>
    <dd className="min-w-0 flex-1">{children}</dd>
  </div>
);

const QuickLink = ({
  to,
  icon: Icon,
  title,
  description
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) => (
  <Link
    to={to}
    className={cn(
      "group flex h-full items-start gap-3 rounded-xl border bg-surface p-4 shadow-xs outline-none",
      "transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
    )}
  >
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text [&_svg]:size-[18px]">
      <Icon aria-hidden="true" />
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex items-center gap-1 text-sm font-medium">
        {title}
        <ArrowUpRight
          className="size-3.5 text-foreground-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          aria-hidden="true"
        />
      </span>
      <span className="line-clamp-2 text-xs text-foreground-muted">{description}</span>
    </span>
  </Link>
);

// Agenda ("Việc cần làm") -----------------------------------------------------------------------------

const taskRoles: readonly ProductionRole[] = ["STAFF", "QC", "LEADER"];

/**
 * What needs doing now, per role: my open tasks (Staff / QC / Leader), the QC queue (QC) and late
 * jobs (Leader / Account). Hidden for roles without a queue of their own (e.g. Admin only).
 */
const Agenda = ({ roles, timeZone }: { roles: readonly ProductionRole[]; timeZone: string }) => {
  const hasTasks = roles.some((role) => taskRoles.includes(role));
  const isQc = roles.includes("QC");
  const watchesJobs = roles.includes("LEADER") || roles.includes("ACCOUNT");
  if (!hasTasks && !isQc && !watchesJobs) return null;
  return (
    <section aria-labelledby="production-agenda" className="flex flex-col gap-3">
      <h2 id="production-agenda" className="text-sm font-semibold">
        Việc cần làm
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {hasTasks ? <MyTasksCard timeZone={timeZone} /> : null}
        {isQc || watchesJobs ? (
          <div className="flex min-w-0 flex-col gap-4">
            {isQc ? <QcCard timeZone={timeZone} /> : null}
            {watchesJobs ? <LateJobsCard timeZone={timeZone} /> : null}
          </div>
        ) : null}
      </div>
    </section>
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
                        #{task.number} · {task.process.name}
                      </span>
                      <span className="truncate text-xs text-foreground-muted">
                        {task.jobCode} · {task.qtyAssigned} tấm
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
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">
                      #{task.number} · {task.process.name}
                    </span>
                    <span className="text-foreground-muted"> · {task.assignee.displayName}</span>
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
                      <span className="font-mono">{job.project.code}</span> · hạn{" "}
                      {formatDateTime(job.deadline, timeZone)}
                    </span>
                  </span>
                  <LateBadge label={`${job.lateTaskCount} trễ`} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </AgendaCard>
  );
};
