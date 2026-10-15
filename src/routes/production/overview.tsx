import { cn } from "cn";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  BellRing,
  CalendarDays,
  CalendarRange,
  ChartColumnBig,
  Coins,
  Eye,
  HandCoins,
  Network,
  Paperclip,
  Trophy,
  type LucideIcon
} from "lucide-react";
import { Link } from "@/components/shared/router-link";

import { Skeleton } from "@/components/ui/skeleton";
import { departmentLabels } from "@/contracts/departments";
import { useSessionContext } from "@/features/auth/hooks";
import { ProductionAgenda } from "@/features/production/components/agenda";
import { RoleBadge } from "@/features/production/components/role-chips";
import { closeDaySchedule, formatDay, kpiPeriod, todayIn } from "@/features/production/format";
import { useProductionMe, useTeams } from "@/features/production/hooks";
import { khoanPolicyMeta } from "@/features/production/kpi/khoan-policy";
import { settingsPageBySlug, visibleSettingsPages } from "@/features/production/nav";
import { productionRoleDescriptions, sortRoles } from "@/features/production/roles";

const ease = [0.22, 1, 0.36, 1] as const;

const greetingFor = (date: Date) => {
  const hour = date.getHours();
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
};

/** Team names often already start with "Team" ("Team Ánh Sáng"): never "Team Team …". */
const teamLabel = (name: string) => (/^team\b/i.test(name) ? name : `Team ${name}`);

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
  const weekday = format(now, "EEEE, d MMMM", { locale: vi });
  const day = weekday.charAt(0).toLocaleUpperCase("vi") + weekday.slice(1);

  // The layout route only renders this once /production/me resolved with at least one role.
  if (!me.data) return null;
  const { roles, settings, teamId } = me.data;
  const today = todayIn(settings.timezone);
  // Close-day versions (G15): a changed close day only applies from the next period.
  const period = kpiPeriod(today, settings.kpiCloseDays);
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
            {departmentLabels.PHOTO_RETOUCH} · {day}
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            {greetingFor(now)}, {session.user.displayName}
          </h1>
        </header>

        <ProductionAgenda roles={roles} timeZone={settings.timezone} />

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
                  teamLabel(team.name)
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
                  `Chốt ${closeDaySchedule(settings.kpiCloseDay)}`
                )}
              </Rule>
              <Rule icon={HandCoins} label="Tiền Khoán">
                {khoanPolicyMeta[settings.khoanPayPolicy].label}
              </Rule>
              {/* PD-052: the ranking and everyone's scores are always open to every member. */}
              <Rule icon={Eye} label="Bảng điểm">
                Công khai cho mọi thành viên
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
