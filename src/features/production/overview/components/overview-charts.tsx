import { cn } from "cn";
import { AlarmClock } from "lucide-react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type XAxisTickContentProps
} from "recharts";

import type {
  OverviewDaily,
  OverviewRange,
  OverviewStatusSlice,
  OverviewVolume
} from "@/contracts/production-overview";
import { toneChartColor } from "@/lib/colors";

import { formatInteger } from "../../format";
import { seriesColor, vizPalette } from "../../reports/palette";
import { dayMonth, inRange, percentOf, weekdayOf } from "../model";

/**
 * PD-076 charts of "Tổng quan" (recharts, loaded lazily so it stays out of the main bundle): task nhận vs xong per day,
 * the range's lines by status (the workflow's colours) and the volume per project (the reports' validated categorical
 * order, "Khác" grey). Thin marks, a 2px surface gap between donut slices, legends in text colours, tooltips, and a
 * table for screen readers.
 */

const RECEIVED = seriesColor(0);
const DONE = seriesColor(2);
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

const TooltipBox = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <div className="min-w-40 rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10">
    <p className="mb-1.5 font-medium">{title}</p>
    <dl className="flex flex-col gap-1 tabular-nums">{children}</dl>
  </div>
);

const TooltipRow = ({ color, label, value }: { color?: string; label: string; value: ReactNode }) => (
  <div className="flex items-center gap-2">
    {color ? <span aria-hidden="true" className="size-2 shrink-0 rounded-sm" style={{ background: color }} /> : null}
    <dt className="flex-1 text-foreground-muted">{label}</dt>
    <dd className="font-semibold">{value}</dd>
  </div>
);

const LegendKey = ({ color, label, value }: { color: string; label: string; value: string }) => (
  <span className="inline-flex items-center gap-1.5 text-xs">
    <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full" style={{ background: color }} />
    <span className="text-foreground-muted">{label}</span>
    <span className="font-semibold text-foreground tabular-nums">{value}</span>
  </span>
);

// Task nhận vs xong ------------------------------------------------------------------------------------------------------

type DayRow = OverviewDaily["days"][number];

const DayTick = ({
  x,
  y,
  payload,
  index,
  every,
  today
}: XAxisTickContentProps & { every: number; today: string }) => {
  const day = String(payload.value);
  if (index % every !== 0 && day !== today) return <g />;
  return (
    <text
      x={Number(x)}
      y={Number(y) + 12}
      textAnchor="middle"
      fontSize={11}
      fill={day === today ? "var(--foreground)" : "var(--foreground-muted)"}
      fontWeight={day === today ? 600 : 400}
    >
      {dayMonth(day)}
    </text>
  );
};

/**
 * Two lines per day over the chart's days: lines received (Ngày nhận) and lines finished. A range shorter than a week is
 * charted over the 7 days ending on its last day (the API's `daily`), the chosen days tinted.
 */
export const ReceivedDoneChart = ({
  daily,
  range,
  today
}: {
  daily: OverviewDaily;
  range: OverviewRange;
  today: string;
}) => {
  const days = daily.days;
  const received = days.reduce((sum, row) => sum + row.received, 0);
  const done = days.reduce((sum, row) => sum + row.done, 0);
  const widened = daily.from !== range.from || daily.to !== range.to;
  const tickEvery = Math.max(1, Math.ceil(days.length / 8));
  const dots = days.length <= 14;
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", vizPalette)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <LegendKey color={RECEIVED} label="Nhận" value={formatInteger(received)} />
        <LegendKey color={DONE} label="Xong" value={formatInteger(done)} />
        {widened ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground-muted">
            <span
              aria-hidden="true"
              className={cn(
                range.from === range.to ? "h-3 w-px bg-brand/60" : "size-2.5 rounded-sm bg-brand-soft ring-1 ring-brand/30"
              )}
            />
            {range.from === range.to ? "Ngày đã chọn" : "Khoảng đã chọn"}
          </span>
        ) : null}
      </div>
      <div
        className="h-56 w-full sm:h-64 lg:h-72"
        role="img"
        aria-label={`Task nhận và xong theo ngày, ${dayMonth(daily.from)} – ${dayMonth(daily.to)}: nhận ${received}, xong ${done}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={days} margin={{ top: 8, right: 18, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="overview-received" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={RECEIVED} stopOpacity={0.16} />
                <stop offset="100%" stopColor={RECEIVED} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="overview-done" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={DONE} stopOpacity={0.16} />
                <stop offset="100%" stopColor={DONE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            {widened && range.from === range.to ? (
              <ReferenceLine x={range.from} stroke="var(--brand)" strokeOpacity={0.6} strokeWidth={1} ifOverflow="extendDomain" />
            ) : widened ? (
              <ReferenceArea
                x1={range.from}
                x2={range.to}
                fill="var(--brand)"
                fillOpacity={0.07}
                stroke="none"
                ifOverflow="extendDomain"
              />
            ) : null}
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              interval={0}
              tick={(props: XAxisTickContentProps) => <DayTick {...props} every={tickEvery} today={today} />}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
              tickFormatter={(value: number) => compact.format(value)}
            />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, payload }: TooltipContentProps) => {
                const row = payload[0]?.payload as DayRow | undefined;
                if (!active || !row) return null;
                return (
                  <TooltipBox title={`${weekdayOf(row.day)}, ${dayMonth(row.day)}${inRange(row.day, range) && widened ? " · đã chọn" : ""}`}>
                    <TooltipRow color={RECEIVED} label="Task nhận" value={formatInteger(row.received)} />
                    <TooltipRow color={DONE} label="Task xong" value={formatInteger(row.done)} />
                  </TooltipBox>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="received"
              name="Nhận"
              stroke={RECEIVED}
              strokeWidth={2}
              fill="url(#overview-received)"
              dot={dots ? { r: 2.5, strokeWidth: 0, fill: RECEIVED } : false}
              activeDot={{ r: 4.5, stroke: "var(--surface)", strokeWidth: 2, fill: RECEIVED }}
              animationDuration={500}
            />
            <Area
              type="monotone"
              dataKey="done"
              name="Xong"
              stroke={DONE}
              strokeWidth={2}
              fill="url(#overview-done)"
              dot={dots ? { r: 2.5, strokeWidth: 0, fill: DONE } : false}
              activeDot={{ r: 4.5, stroke: "var(--surface)", strokeWidth: 2, fill: DONE }}
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Task nhận và xong theo ngày</caption>
        <thead>
          <tr>
            <th scope="col">Ngày</th>
            <th scope="col">Nhận</th>
            <th scope="col">Xong</th>
          </tr>
        </thead>
        <tbody>
          {days.map((row) => (
            <tr key={row.day}>
              <th scope="row">{dayMonth(row.day)}</th>
              <td>{row.received}</td>
              <td>{row.done}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Donuts -----------------------------------------------------------------------------------------------------------------

type Slice = { key: string; label: string; detail?: string | undefined; value: number; fill: string; overdue?: number };

/** A donut with its total in the middle and a legend (value + share) beside it on wide cards, below on phones. */
const Donut = ({
  slices,
  total,
  unit,
  caption,
  valueLabel
}: {
  slices: readonly Slice[];
  total: number;
  unit: string;
  caption: string;
  valueLabel: (value: number) => string;
}) => (
  <div className="flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-center lg:flex-col">
    <div className="relative aspect-square w-full max-w-44 shrink-0" role="img" aria-label={caption}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {/* Above the total printed in the hole (a later, absolutely placed sibling) and free to leave the small donut box
              (owner, 2026-10-21: the hovered tooltip was hidden behind "210 tấm"). */}
          <Tooltip
            isAnimationActive={false}
            allowEscapeViewBox={{ x: true, y: true }}
            offset={18}
            wrapperStyle={{ zIndex: 30, pointerEvents: "none" }}
            content={({ active, payload }: TooltipContentProps) => {
              const slice = payload[0]?.payload as Slice | undefined;
              if (!active || !slice) return null;
              return (
                <TooltipBox title={slice.detail ? `${slice.label} · ${slice.detail}` : slice.label}>
                  <TooltipRow color={slice.fill} label={unit === "tấm" ? "Số tấm" : "Số task"} value={valueLabel(slice.value)} />
                  <TooltipRow label="Tỷ lệ" value={`${percentOf(slice.value, total)}%`} />
                  {slice.overdue ? <TooltipRow label="Quá hạn" value={formatInteger(slice.overdue)} /> : null}
                </TooltipBox>
              );
            }}
          />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="66%"
            outerRadius="96%"
            paddingAngle={slices.length > 1 ? 1.5 : 0}
            cornerRadius={3}
            stroke="var(--surface)"
            strokeWidth={2}
            animationDuration={500}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center">
        <span className="text-xl leading-tight font-semibold tracking-[-0.02em] tabular-nums">
          {total < 1_000_000 ? formatInteger(total) : compact.format(total)}
        </span>
        <span className="text-[11px] text-foreground-muted">{unit}</span>
      </div>
    </div>
    <ul className="flex w-full min-w-0 flex-col gap-1.5" aria-label={`Chú giải: ${caption}`}>
      {slices.map((slice) => (
        <li key={slice.key} className="flex min-w-0 items-center gap-2 text-[13px]">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ background: slice.fill }} />
          <span className="min-w-0 flex-1 truncate" title={slice.detail ? `${slice.label} — ${slice.detail}` : slice.label}>
            {slice.label}
            {slice.detail ? <span className="text-foreground-muted"> · {slice.detail}</span> : null}
          </span>
          {slice.overdue ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-danger-soft px-1 text-[11px] leading-[18px] font-semibold text-danger tabular-nums"
              title={`${slice.overdue} task quá hạn`}
            >
              <AlarmClock className="size-3" aria-hidden="true" />
              {formatInteger(slice.overdue)}
              <span className="sr-only"> quá hạn</span>
            </span>
          ) : null}
          <span className="shrink-0 font-medium tabular-nums">{valueLabel(slice.value)}</span>
          <span className="w-9 shrink-0 text-right text-xs text-foreground-muted tabular-nums">
            {percentOf(slice.value, total)}%
          </span>
        </li>
      ))}
    </ul>
  </div>
);

/** The range's lines by their current workflow status (status colours of the workflow), Quá hạn marked per status. */
export const StatusDonut = ({ slices, total }: { slices: readonly OverviewStatusSlice[]; total: number }) => (
  <Donut
    slices={slices.map((slice) => ({
      key: slice.status.id,
      label: slice.status.name,
      value: slice.count,
      fill: toneChartColor(slice.status.color),
      overdue: slice.overdue
    }))}
    total={total}
    unit="task"
    caption={`Task theo trạng thái: ${slices.map((slice) => `${slice.status.name} ${slice.count}`).join(", ")}.`}
    valueLabel={formatInteger}
  />
);

/** Images per project (the largest, then "Khác"). */
export const VolumeDonut = ({ volume }: { volume: OverviewVolume }) => (
  <div className={cn("min-w-0", vizPalette)}>
    <Donut
      slices={volume.slices.map((slice, index) => ({
        key: slice.project?.id ?? "other",
        label: slice.project?.code ?? "Khác",
        detail: slice.project ? slice.project.name : `${slice.projectCount} Project`,
        value: slice.qty,
        fill: seriesColor(index, { other: slice.project === null })
      }))}
      total={volume.totalQty}
      unit="tấm"
      caption={`Khối lượng theo Project: ${volume.slices
        .map((slice) => `${slice.project?.code ?? "Khác"} ${slice.qty} tấm`)
        .join(", ")}.`}
      valueLabel={formatInteger}
    />
  </div>
);
