import { cn } from "cn";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";

import type { MyOverviewPoints } from "@/contracts/production-my-overview";

import { formatKpiPeriod, formatNumber } from "../../format";
import { myOverviewCopy as copy } from "../copy";

/** Points with at most one decimal: 26,4 · 1.284. */
const pointsText = (value: number) => formatNumber(value, 1);

/**
 * "Điểm của tôi" (PD-081): the caller's official points only — today, this week, the KPI period (26 → 25) — and the KPI
 * bar with the working days left and the points needed per day. No Khoán money, no ranking.
 */
export const PointsStrip = ({ points }: { points: MyOverviewPoints }) => {
  const { kpi } = points;
  const period = formatKpiPeriod(points.period.period);
  const percent = kpi.percent ?? 0;
  const reached = kpi.target !== null && kpi.remaining === 0;
  const hint =
    kpi.target === null
      ? kpi.required
        ? copy.points.missingTarget
        : copy.points.notRequired
      : reached
        ? copy.points.reached
        : kpi.workingDaysLeft === 0 || kpi.perDayNeeded === null
          ? copy.points.lastDay
          : copy.points.hint(kpi.workingDaysLeft, formatNumber(Math.ceil(kpi.perDayNeeded), 0));
  return (
    <section
      aria-label={copy.points.region}
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-surface p-4 shadow-xs md:flex-row md:items-center md:gap-6"
    >
      <dl className="grid shrink-0 grid-cols-3 gap-3 sm:gap-6">
        {[
          { label: copy.points.today, value: points.today },
          { label: copy.points.week, value: points.week.points },
          { label: copy.points.period(period), value: points.period.points }
        ].map((item) => (
          <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="truncate text-xs text-foreground-muted">{item.label}</dt>
            <dd className="text-xl font-semibold tracking-[-0.02em] tabular-nums sm:text-2xl">
              {pointsText(item.value)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-baseline justify-between gap-2 text-[13px]">
          <span className="min-w-0 truncate font-medium">
            {copy.points.kpiTitle(period)}
            {kpi.target !== null ? (
              <span className="text-foreground-muted tabular-nums">
                {" · "}
                {copy.points.kpiValue(pointsText(points.period.points), pointsText(kpi.target))}
              </span>
            ) : null}
          </span>
          {kpi.percent !== null ? (
            <span
              className={cn(
                "shrink-0 font-semibold tabular-nums",
                reached ? "text-success" : "text-brand-text"
              )}
            >
              {formatNumber(kpi.percent, 0)}%
            </span>
          ) : null}
        </div>
        <div
          role="progressbar"
          aria-label={copy.points.kpiTitle(period)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(percent, 100))}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              reached ? "bg-success" : "bg-brand"
            )}
            style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
          />
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-muted">
          <span>{hint}</span>
          <span aria-hidden="true" className="max-sm:hidden">
            ·
          </span>
          <Link
            to={`/production/scores?period=${points.period.period}`}
            className="inline-flex items-center gap-0.5 font-medium text-brand-text underline-offset-2 hover:underline"
          >
            {copy.points.openScores}
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        </p>
      </div>
    </section>
  );
};
