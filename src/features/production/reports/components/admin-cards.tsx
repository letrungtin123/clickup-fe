import { cn } from "cn";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Briefcase,
  Gauge,
  MessageSquareWarning,
  Pin,
  PinOff,
  Star,
  Target,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  reportDimensionInfo,
  type AdminDashboard,
  type ReportConfig,
  type ReportDimension,
  type ReportMeasure,
  type ReportResult
} from "@/contracts/production-reports";

import { formatCredit, formatInteger } from "../../format";
import { periodLabel } from "../../scores/periods";
import { formatDeadline } from "../dashboard";
import { reportErrorMessage } from "../errors";
import { formatMeasure, formatRange } from "../format";
import { useReportResult, useUpdateSavedReport } from "../hooks";
import { reportBuilderHref, viewOfConfig, zonesFromConfig } from "../model";
import { labelOf } from "../pivot";
import { statusColor } from "../palette";
import { ReportVisual } from "./report-visual";

type Cards = AdminDashboard["cards"];

const ease = [0.22, 1, 0.36, 1] as const;

/** Frame of one Admin card: icon, title, headline, body and the "Mở báo cáo" link. */
const CardFrame = ({
  icon: Icon,
  title,
  subtitle,
  href,
  index,
  children
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  href: string;
  index: number;
  children: ReactNode;
}) => (
  <motion.section
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.24, delay: index * 0.04, ease }}
    className="flex min-w-0 flex-col rounded-xl border bg-surface shadow-xs"
    aria-label={title}
  >
    <header className="flex items-start gap-2.5 px-4 pt-4 pb-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-sm leading-5 font-semibold">{title}</h2>
        {subtitle ? <p className="text-xs text-foreground-muted">{subtitle}</p> : null}
      </div>
    </header>
    <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 pb-3">{children}</div>
    <footer className="border-t px-2 py-1.5">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between text-foreground-muted max-sm:min-h-10"
        render={<Link to={href} />}
        nativeButton={false}
      >
        Mở báo cáo
        <ArrowUpRight />
      </Button>
    </footer>
  </motion.section>
);

const Headline = ({
  value,
  unit,
  children
}: {
  value: ReactNode;
  unit?: string;
  children?: ReactNode;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <p className="flex items-baseline gap-1">
      <span className="text-2xl font-semibold tracking-[-0.02em] tabular-nums">{value}</span>
      {unit ? <span className="text-xs text-foreground-muted">{unit}</span> : null}
    </p>
    {children ? <p className="text-xs text-foreground-muted">{children}</p> : null}
  </div>
);

type BarItem = { key: string; label: string; value: number; display: string; secondary?: string };

/** Horizontal bars (one hue, magnitude only) with the value as text — the card's mini chart. */
const MiniBars = ({ items, caption }: { items: BarItem[]; caption: string }) => {
  const max = Math.max(0, ...items.map((item) => item.value));
  return (
    <ul className="flex flex-col gap-2" aria-label={caption}>
      {items.map((item, index) => (
        <li key={item.key} className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-baseline gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.secondary ? (
              <span className="shrink-0 text-foreground-subtle tabular-nums">{item.secondary}</span>
            ) : null}
            <span className="shrink-0 font-semibold tabular-nums">{item.display}</span>
          </div>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <motion.span
              className="block h-full rounded-full bg-brand"
              initial={{ width: 0 }}
              animate={{ width: `${max > 0 ? Math.max(2, (item.value / max) * 100) : 0}%` }}
              transition={{ duration: 0.5, delay: 0.1 + index * 0.03, ease }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
};

const barsOf = (
  result: ReportResult,
  dimension: ReportDimension,
  measure: ReportMeasure,
  secondary?: (row: ReportResult["rows"][number]) => string
): BarItem[] =>
  result.rows.map((row, index) => {
    const value = typeof row[measure] === "number" ? row[measure] : 0;
    return {
      key: String(row[dimension] ?? `__${index}`),
      label: labelOf(row, dimension),
      value,
      display: formatMeasure(measure, row[measure]),
      ...(secondary ? { secondary: secondary(row) } : {})
    };
  });

const Empty = ({ text }: { text: string }) => (
  <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs text-foreground-subtle">
    {text}
  </p>
);

const rangeOf = (result: ReportResult) => formatRange(result.from, result.to);

// Cards ----------------------------------------------------------------------------------------------

export const AdminCards = ({ cards, timeZone }: { cards: Cards; timeZone: string }) => {
  const {
    pointsToday,
    lateJobs,
    fbRateByUser,
    fbRateByClient,
    productivityByShift,
    kpiAttainment
  } = cards;
  const kpiTotal = kpiAttainment.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const bucketColor: Record<string, string> = {
    LT50: statusColor.critical,
    LT80: statusColor.warning,
    LT100: "color-mix(in oklch, var(--success) 45%, var(--surface))",
    MET: statusColor.good
  };

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <CardFrame
        index={0}
        icon={Star}
        title={pointsToday.title}
        subtitle={rangeOf(pointsToday.result)}
        href={reportBuilderHref(pointsToday.config, pointsToday.title)}
      >
        <Headline value={formatCredit(pointsToday.result.totals.points ?? 0)} unit="điểm">
          Khoán {formatCredit(pointsToday.result.totals.points_khoan ?? 0)} điểm ·{" "}
          {formatInteger(pointsToday.result.totals.qty_done ?? 0)} tấm done
        </Headline>
        {pointsToday.result.rows.length === 0 ? (
          <Empty text="Hôm nay chưa ghi điểm nào." />
        ) : (
          <MiniBars
            caption="Điểm theo team"
            items={barsOf(pointsToday.result, "team", "points").slice(0, 6)}
          />
        )}
      </CardFrame>

      <CardFrame
        index={1}
        icon={Briefcase}
        title={lateJobs.title}
        subtitle="Job có task quá hạn mà chưa Done"
        href={reportBuilderHref(lateJobs.config, lateJobs.title)}
      >
        <Headline
          value={
            <span className={lateJobs.jobCount > 0 ? "text-danger" : undefined}>
              {formatInteger(lateJobs.jobCount)}
            </span>
          }
          unit="job"
        >
          {formatInteger(lateJobs.taskCount)} task trễ
        </Headline>
        {lateJobs.items.length === 0 ? (
          <Empty text="Không có job nào đang trễ." />
        ) : (
          <ul className="-mx-2 flex flex-col">
            {lateJobs.items.slice(0, 5).map((item) => (
              <li key={item.job.id}>
                <Link
                  to={`/production/jobs/${item.job.id}`}
                  className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-11"
                >
                  <span aria-hidden="true" className="h-7 w-1 shrink-0 rounded-full bg-danger" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{item.job.code}</span>
                    <span className="flex min-w-0 items-center gap-1 text-xs text-foreground-muted">
                      <UserAvatar user={item.leader} size="xs" />
                      <span className="truncate">
                        {item.projectCode} · {item.leader.displayName}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end text-right">
                    <span className="text-xs font-semibold text-danger tabular-nums">
                      {item.lateTaskCount} task trễ
                    </span>
                    <span className="text-[11px] text-foreground-subtle tabular-nums">
                      từ {formatDeadline(item.oldestDeadline, timeZone)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardFrame>

      {(
        [
          [fbRateByUser, "user", MessageSquareWarning],
          [fbRateByClient, "client", MessageSquareWarning]
        ] as const
      ).map(([card, dimension, icon], index) => (
        <CardFrame
          key={dimension}
          index={2 + index}
          icon={icon}
          title={card.title}
          subtitle={rangeOf(card.result)}
          href={reportBuilderHref(card.config, card.title)}
        >
          <Headline value={formatMeasure("fb_rate", card.result.totals.fb_rate)}>
            {formatInteger(card.result.totals.fb_wrong_count ?? 0)} task FB sai /{" "}
            {formatInteger(card.result.totals.task_count ?? 0)} task Done
          </Headline>
          {card.result.rows.length === 0 ? (
            <Empty
              text={`Chưa có task Done nào trong tháng để tính tỉ lệ FB theo ${reportDimensionInfo[dimension].label.toLowerCase()}.`}
            />
          ) : (
            <MiniBars
              caption={card.title}
              items={barsOf(
                card.result,
                dimension,
                "fb_rate",
                (row) =>
                  `${formatInteger(Number(row.fb_wrong_count ?? 0))}/${formatInteger(Number(row.task_count ?? 0))}`
              )}
            />
          )}
        </CardFrame>
      ))}

      <CardFrame
        index={4}
        icon={Gauge}
        title={productivityByShift.title}
        subtitle={rangeOf(productivityByShift.result)}
        href={reportBuilderHref(productivityByShift.config, productivityByShift.title)}
      >
        <Headline
          value={formatMeasure(
            "qty_per_worker_day",
            productivityByShift.result.totals.qty_per_worker_day
          )}
          unit="tấm/người/ngày"
        >
          {formatInteger(productivityByShift.result.totals.qty_done ?? 0)} tấm done ·{" "}
          {formatInteger(productivityByShift.result.totals.task_count ?? 0)} task
        </Headline>
        {productivityByShift.result.rows.length === 0 ? (
          <Empty text="Chưa có task Done nào trong tháng." />
        ) : (
          <MiniBars
            caption="Năng suất theo ca"
            items={barsOf(
              productivityByShift.result,
              "shift",
              "qty_per_worker_day",
              (row) => `${formatInteger(Number(row.qty_done ?? 0))} tấm`
            )}
          />
        )}
      </CardFrame>

      <CardFrame
        index={5}
        icon={Target}
        title={kpiAttainment.title}
        subtitle={periodLabel(kpiAttainment.period)}
        href={reportBuilderHref(kpiAttainment.config, kpiAttainment.title)}
      >
        <Headline
          value={
            kpiAttainment.averagePercent === null
              ? "—"
              : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(kpiAttainment.averagePercent)}%`
          }
        >
          Trung bình của {kpiAttainment.members - kpiAttainment.withoutTarget} người có KPI
          {kpiAttainment.withoutTarget > 0
            ? ` · ${kpiAttainment.withoutTarget} người chưa đặt KPI`
            : ""}
        </Headline>
        {kpiTotal === 0 ? (
          <Empty text="Chưa có ai được đặt KPI cho kỳ này." />
        ) : (
          <div className="flex flex-col gap-2.5">
            <div
              className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label="Phân bố % đạt KPI"
            >
              {kpiAttainment.buckets.map((bucket, index) =>
                bucket.count > 0 ? (
                  <motion.span
                    key={bucket.key}
                    className={cn("h-full", index > 0 && "border-l-2 border-surface")}
                    style={{ background: bucketColor[bucket.key] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(bucket.count / kpiTotal) * 100}%` }}
                    transition={{ duration: 0.5, delay: 0.1, ease }}
                  />
                ) : null
              )}
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {kpiAttainment.buckets.map((bucket) => (
                <li key={bucket.key} className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ background: bucketColor[bucket.key] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground-muted">
                    {bucket.label}
                  </span>
                  <span className="font-semibold tabular-nums">{bucket.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardFrame>
    </div>
  );
};

export const AdminCardsSkeleton = () => (
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
    {Array.from({ length: 6 }, (_, index) => (
      <div key={index} className="flex flex-col gap-3 rounded-xl border bg-surface p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-28" />
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-5" />
        ))}
      </div>
    ))}
  </div>
);

// Pinned reports -------------------------------------------------------------------------------------

export const PinnedReportCard = ({
  report,
  index
}: {
  report: { id: string; name: string; config: ReportConfig };
  index: number;
}) => {
  const result = useReportResult(report.config);
  const unpin = useUpdateSavedReport();
  const zones = zonesFromConfig(report.config);
  const view = viewOfConfig(report.config);

  const onUnpin = async () => {
    try {
      await unpin.mutateAsync({ id: report.id, input: { pinned: false } });
      toast.success("Đã bỏ ghim", { description: report.name });
    } catch (cause) {
      toast.error(reportErrorMessage(cause, "Không bỏ ghim được."));
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: index * 0.04, ease }}
      className="flex min-w-0 flex-col rounded-xl border bg-surface shadow-xs"
      aria-label={report.name}
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Pin className="size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate text-sm font-semibold">{report.name}</h3>
          <p className="truncate text-xs text-foreground-muted tabular-nums">
            {result.data
              ? `${formatRange(result.data.from, result.data.to)} · ${result.data.rows.length} dòng`
              : "Đang tính…"}
          </p>
        </div>
        {result.isFetching ? <Spinner className="size-3.5 text-foreground-muted" /> : null}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-foreground-muted"
          aria-label={`Bỏ ghim ${report.name}`}
          title="Bỏ ghim"
          disabled={unpin.isPending}
          onClick={() => void onUnpin()}
        >
          <PinOff />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-foreground-muted"
          aria-label={`Mở ${report.name} trong trình dựng báo cáo`}
          title="Mở báo cáo"
          render={<Link to={`/production/reports?saved=${report.id}`} />}
          nativeButton={false}
        >
          <ArrowUpRight />
        </Button>
      </header>
      <div className="min-w-0 flex-1">
        {result.isPending ? (
          <div className="flex flex-col gap-2 p-4" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-6" />
            ))}
          </div>
        ) : result.isError ? (
          <EmptyState
            size="sm"
            title="Không chạy được báo cáo"
            description={reportErrorMessage(result.error)}
          />
        ) : result.data.rows.length === 0 ? (
          <EmptyState
            size="sm"
            title="Không có dữ liệu trong khoảng này"
            description="Báo cáo ghim luôn chạy theo khoảng thời gian đã lưu."
          />
        ) : (
          <ReportVisual
            result={result.data}
            rows={zones.rows}
            columns={zones.columns}
            measures={zones.values}
            view={view}
            compact
          />
        )}
      </div>
    </motion.section>
  );
};
