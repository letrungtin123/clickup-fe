import { cn } from "cn";
import { CircleCheck, CircleDashed, Info, TrendingUp, TriangleAlert } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { KpiProgress, UserScoreForecast } from "@/contracts/production-scores";

import { formatCredit, formatNumber } from "../../format";
import {
  forecastLabel,
  forecastSentence,
  forecastToneInfo,
  formatPercent,
  progressWidth,
  type ToneFamily
} from "../forecast";
import { formatPeriod, periodLabel, quarterOfPeriod, rollupLabel } from "../periods";
import { ProgressBar } from "./kit";

const toneIcons = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: TrendingUp,
  muted: CircleDashed
} as const;

const toneSurface: Record<ToneFamily, string> = {
  success: "border-success/30 bg-success-soft/60",
  warning: "border-warning/35 bg-warning-soft/70",
  danger: "border-danger/30 bg-danger-soft/60",
  muted: "border-border bg-surface"
};

const toneText: Record<ToneFamily, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-foreground-muted"
};

/**
 * KPI forecast for one period: tone (API-decided) as colour + icon + words, points vs. target with
 * a progress bar, and the month / quarter / year KPI percentages.
 */
export const ForecastPanel = ({ forecast }: { forecast: UserScoreForecast }) => {
  const info = forecastToneInfo[forecast.tone];
  const Icon = toneIcons[info.family];
  const prorated =
    forecast.prorateLeave &&
    forecast.leaveDays !== null &&
    forecast.leaveDays > 0 &&
    forecast.targetBase !== null &&
    forecast.target !== forecast.targetBase;

  return (
    <section
      aria-label={`Dự báo KPI ${formatPeriod(forecast.period)}`}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 shadow-xs",
        toneSurface[info.family]
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface shadow-xs",
              toneText[info.family]
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className={cn("text-xs font-semibold", toneText[info.family])}>
              {forecastLabel(forecast)}
            </p>
            <p className="text-[15px] leading-snug font-medium text-foreground" aria-live="polite">
              {forecastSentence(forecast)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <p className="text-2xl font-semibold tracking-[-0.02em]">
            {formatPercent(forecast.percent)}
          </p>
          <p className="text-xs text-foreground-muted">KPI tháng</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <ProgressBar
          value={progressWidth(forecast.percent)}
          tone={info.family === "muted" ? "brand" : info.family}
          label={`Tiến độ KPI ${formatPeriod(forecast.period)}`}
        />
        <p className="flex flex-wrap justify-between gap-x-3 text-xs text-foreground-muted tabular-nums">
          <span>
            <span className="font-medium text-foreground">
              {formatCredit(forecast.pointsOfficial)}
            </span>
            {forecast.target !== null
              ? ` / ${formatCredit(forecast.target)} điểm chính thức`
              : " điểm chính thức"}
          </span>
          {forecast.daysLeft > 0 ? (
            <span>
              {forecast.daysLeft === 1
                ? "Hôm nay là ngày chốt"
                : `Chốt ngày ${forecast.to.slice(8, 10)}/${forecast.to.slice(5, 7)} · trong đó ${forecast.workingDaysLeft} ngày làm việc`}
            </span>
          ) : (
            <span>
              Kỳ đã kết thúc ngày {forecast.to.slice(8, 10)}/{forecast.to.slice(5, 7)}
            </span>
          )}
        </p>
      </div>

      <KpiChips forecast={forecast} />

      {prorated ? (
        <p className="flex items-start gap-1.5 text-xs text-foreground-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Chỉ tiêu đã trừ {formatNumber(forecast.leaveDays)} ngày nghỉ được duyệt (gốc{" "}
          {formatCredit(forecast.targetBase)} điểm).
        </p>
      ) : null}
    </section>
  );
};

const KpiChips = ({ forecast }: { forecast: UserScoreForecast }) => {
  const { kpi, period } = forecast;
  // The month chip repeats the headline: same (leave-prorated) target and percent, never two numbers.
  const month: KpiProgress =
    forecast.target === null
      ? kpi.month
      : {
          ...kpi.month,
          points: forecast.pointsOfficial,
          target: forecast.target,
          percent: forecast.percent
        };
  const chips: { key: string; label: string; progress: KpiProgress }[] = [
    { key: "month", label: periodLabel(period), progress: month },
    { key: "quarter", label: rollupLabel(quarterOfPeriod(period)), progress: kpi.quarter },
    { key: "year", label: rollupLabel(period.slice(0, 4)), progress: kpi.year }
  ];
  return (
    <ul className="grid grid-cols-3 gap-2" aria-label="Phần trăm KPI">
      {chips.map((chip) => (
        <li
          key={chip.key}
          className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface/80 px-2.5 py-2 shadow-xs ring-1 ring-border/60"
          title={
            chip.progress.target === null
              ? "Chưa có chỉ tiêu"
              : `${formatCredit(chip.progress.points)} / ${formatCredit(chip.progress.target)} điểm`
          }
        >
          <span className="truncate text-[11px] text-foreground-muted">{chip.label}</span>
          <span className="text-sm font-semibold">{formatPercent(chip.progress.percent)}</span>
          <ProgressBar
            value={progressWidth(chip.progress.percent)}
            tone="brand"
            label={`KPI ${chip.label}`}
            className="h-1"
          />
        </li>
      ))}
    </ul>
  );
};

export const ForecastSkeleton = () => (
  <div className="flex flex-col gap-3 rounded-xl border bg-surface p-4" aria-hidden="true">
    <div className="flex items-start gap-2.5">
      <Skeleton className="size-8 rounded-lg" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Skeleton className="h-7 w-16" />
    </div>
    <Skeleton className="h-2 w-full rounded-full" />
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-14 rounded-lg" />
      ))}
    </div>
  </div>
);
