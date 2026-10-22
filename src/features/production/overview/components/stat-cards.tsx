import { cn } from "cn";
import {
  AlarmClock,
  ArrowDownRight,
  ArrowUpRight,
  CircleCheckBig,
  Layers,
  LoaderCircle,
  Minus,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { ProductionOverview } from "@/contracts/production-overview";

import { formatInteger } from "../../format";
import { comparisonLabel, comparisonTitle, overdueShare, percentOf, trendOf } from "../model";

/**
 * PD-076 quick stats: Tổng task · Đang làm · Đã xong · Quá hạn over the range's lines (definitions in the contract).
 * Tổng and Đã xong carry a sparkline of the chart's days (received / finished per day) and the change against the days
 * just before; Đang làm and Quá hạn their share as a thin meter.
 */
export const OverviewStatCards = ({ overview }: { overview: ProductionOverview }) => {
  const { stats, previous, daily, today } = overview;
  const open = stats.total - stats.done;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="list" aria-label="Số liệu nhanh">
      <StatCard
        label="Tổng task"
        icon={Layers}
        tone="brand"
        value={stats.total}
        footer={
          previous ? (
            <Trend
              current={stats.total}
              previous={previous.total}
              label={comparisonLabel(previous, today)}
              title={comparisonTitle(previous, today)}
            />
          ) : (
            "Nhận trong khoảng đã chọn"
          )
        }
        visual={<Sparkline values={daily.days.map((day) => day.received)} tone="var(--brand)" label="Task nhận theo ngày" />}
      />
      <StatCard
        label="Đang làm"
        icon={LoaderCircle}
        tone="info"
        value={stats.inProgress}
        footer={`${formatInteger(stats.notStarted)} chưa bắt đầu`}
        visual={<Meter value={percentOf(stats.inProgress, stats.total)} tone="info" label="tổng task" />}
      />
      <StatCard
        label="Đã xong"
        icon={CircleCheckBig}
        tone="success"
        value={stats.done}
        footer={
          previous ? (
            <Trend
              current={stats.done}
              previous={previous.done}
              label={comparisonLabel(previous, today)}
              title={comparisonTitle(previous, today)}
            />
          ) : (
            `${percentOf(stats.done, stats.total)}% tổng task`
          )
        }
        visual={<Sparkline values={daily.days.map((day) => day.done)} tone="var(--success)" label="Task xong theo ngày" />}
        badge={stats.total > 0 ? `${percentOf(stats.done, stats.total)}%` : null}
      />
      <StatCard
        label="Quá hạn"
        icon={AlarmClock}
        tone={stats.overdue > 0 ? "danger" : "muted"}
        value={stats.overdue}
        footer={
          open > 0
            ? `${overdueShare(stats)}% task chưa xong`
            : stats.total > 0
              ? "Không còn task chưa xong"
              : "Không có task"
        }
        visual={<Meter value={overdueShare(stats)} tone={stats.overdue > 0 ? "danger" : "muted"} label="task chưa xong" />}
      />
    </div>
  );
};

type Tone = "brand" | "info" | "success" | "danger" | "muted";

const toneStyles: Record<Tone, { chip: string; fill: string }> = {
  brand: { chip: "bg-brand-soft text-brand-text", fill: "bg-brand" },
  info: { chip: "tone tone-blue bg-(--tone-soft) text-(--tone-text)", fill: "tone tone-blue bg-(--tone)" },
  success: { chip: "bg-success-soft text-success", fill: "bg-success" },
  danger: { chip: "bg-danger-soft text-danger", fill: "bg-danger" },
  muted: { chip: "bg-muted text-foreground-muted", fill: "bg-foreground-subtle" }
};

const StatCard = ({
  label,
  icon: Icon,
  tone,
  value,
  footer,
  visual,
  badge
}: {
  label: string;
  icon: LucideIcon;
  tone: Tone;
  value: number;
  footer: ReactNode;
  visual: ReactNode;
  badge?: string | null;
}) => (
  <div
    role="listitem"
    className={cn(
      "relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-surface p-3.5 shadow-xs sm:p-4",
      tone === "danger" && "border-danger/30"
    )}
  >
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
          toneStyles[tone].chip
        )}
      >
        <Icon aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground-muted">{label}</span>
      {badge ? (
        <span className="shrink-0 rounded-full bg-success-soft px-1.5 text-[11px] leading-5 font-semibold text-success tabular-nums">
          {badge}
        </span>
      ) : null}
    </div>
    <div className="flex min-w-0 items-end justify-between gap-2">
      <span
        className={cn(
          "truncate text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums sm:text-[32px]",
          tone === "danger" && "text-danger"
        )}
      >
        {formatInteger(value)}
      </span>
      <span className="hidden w-20 shrink-0 sm:block">{visual}</span>
    </div>
    <div className="line-clamp-2 min-w-0 text-xs leading-4 text-foreground-muted">{footer}</div>
  </div>
);

/** "↑ 12% so với hôm qua" (text in ink colours; the arrow carries the direction). */
const Trend = ({
  current,
  previous,
  label,
  title
}: {
  current: number;
  previous: number;
  label: string;
  title: string;
}) => {
  const trend = trendOf(current, previous);
  const Icon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;
  return (
    <span title={`${title}: ${formatInteger(previous)}`}>
      <Icon className="mr-0.5 inline size-3.5 align-[-3px] text-foreground-subtle" aria-hidden="true" />
      <span className="font-medium text-foreground tabular-nums">
        {trend.direction === "flat"
          ? "Không đổi"
          : trend.percent === null
            ? `+${formatInteger(current)}`
            : `${trend.direction === "up" ? "+" : "−"}${trend.percent}%`}
      </span>{" "}
      {label}
    </span>
  );
};

/** A tiny line of daily counts (the chart's days), last point marked. Decorative: the chart below has the numbers. */
export const Sparkline = ({ values, tone, label }: { values: readonly number[]; tone: string; label: string }) => {
  if (values.length < 2) return null;
  const width = 80;
  const height = 28;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => [index * step, height - 3 - (value / max) * (height - 6)] as const);
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-7 w-20 overflow-visible"
      role="img"
      aria-label={`${label}: ${values.join(", ")}`}
    >
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={tone} opacity={0.1} />
      <path d={line} fill="none" stroke={tone} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={tone} stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
};

/** Thin share meter (0–100) on its own track. */
const Meter = ({ value, tone, label }: { value: number; tone: Tone; label: string }) => (
  <span className="flex w-20 flex-col items-end gap-1">
    <span className="text-[11px] font-medium text-foreground-muted tabular-nums">{value}%</span>
    <span
      className="block h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={`${value}% ${label}`}
    >
      <span className={cn("block h-full rounded-full", toneStyles[tone].fill)} style={{ width: `${value}%` }} />
    </span>
  </span>
);

export const StatCardsSkeleton = () => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
    {[0, 1, 2, 3].map((index) => (
      <div key={index} className="flex flex-col gap-3 rounded-xl border bg-surface p-3.5 shadow-xs sm:p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-lg" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-28" />
      </div>
    ))}
  </div>
);
