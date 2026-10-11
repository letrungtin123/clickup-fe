import { cn } from "cn";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps
} from "recharts";

import type { ReportValueFormat } from "@/contracts/production-reports";

import { formatAxisValue, formatReportValue, tickLabel } from "../format";
import { seriesColor, vizPalette } from "../palette";
import type { ChartKind, ChartModel, ChartSeries } from "../pivot";

/**
 * Report charts (Recharts, loaded lazily so the library stays out of the main bundle). One y axis per
 * chart (one measure); series = "Cột" values in fixed categorical slots, a single series in the brand
 * colour. Entity categories draw as horizontal bars (long Vietnamese names stay readable), time
 * categories as columns / lines. Hover tooltips on every mark; the pivot table is the table view.
 */

type Props = {
  model: ChartModel;
  kind: ChartKind;
  format: ReportValueFormat;
  /** Title of the measure (single series legend / accessible summary). */
  measureLabel: string;
  stacked?: boolean;
  className?: string;
  /** Fixed plot height for compact cards (default: sized by the data). */
  height?: number;
};

const AXIS = { fontSize: 11, fill: "var(--foreground-muted)" } as const;

const colorOf = (series: ChartSeries, index: number, single: boolean) =>
  seriesColor(index, { single, other: series.other === true });

const Legend = ({
  series,
  single,
  label
}: {
  series: ChartSeries[];
  single: boolean;
  label: string;
}) =>
  single ? (
    // One series: still name the measure being drawn ("■ Giờ OT").
    <p className="flex min-w-0 items-center gap-1.5 text-xs text-foreground-muted">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-sm"
        style={{ background: series[0] ? colorOf(series[0], 0, true) : undefined }}
      />
      <span className="truncate">{label}</span>
    </p>
  ) : (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted"
      aria-label={`Chú giải: ${label}`}
    >
      {series.map((item, index) => (
        <li key={item.key} className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-sm"
            style={{ background: colorOf(item, index, single) }}
          />
          <span className="max-w-48 truncate">{item.label}</span>
        </li>
      ))}
    </ul>
  );

const TooltipBox = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <div className="max-w-72 min-w-40 rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10">
    <p className="mb-1.5 font-medium break-words">{title}</p>
    <dl className="flex flex-col gap-1 tabular-nums">{children}</dl>
  </div>
);

const TooltipRow = ({ color, label, value }: { color: string; label: string; value: string }) => (
  <div className="flex items-center gap-2">
    <span aria-hidden="true" className="size-2 shrink-0 rounded-sm" style={{ background: color }} />
    <dt className="min-w-0 flex-1 truncate text-foreground-muted">{label}</dt>
    <dd className="font-medium">{value}</dd>
  </div>
);

const CartesianTooltip = ({
  active,
  payload,
  model,
  format,
  measureLabel,
  single,
  stacked
}: TooltipContentProps & {
  model: ChartModel;
  format: ReportValueFormat;
  measureLabel: string;
  single: boolean;
  stacked: boolean;
}) => {
  const row = payload[0]?.payload as Record<string, string | number | null> | undefined;
  if (!active || !row) return null;
  const values = model.series.map((series) => row[series.key]);
  const total = values.reduce<number>(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0
  );
  return (
    <TooltipBox title={String(row.label ?? "")}>
      {model.series.map((series, index) => (
        <TooltipRow
          key={series.key}
          color={colorOf(series, index, single)}
          label={single ? measureLabel : series.label}
          value={formatReportValue(row[series.key], format)}
        />
      ))}
      {stacked && model.series.length > 1 ? (
        <div className="mt-0.5 flex items-center gap-2 border-t pt-1">
          <dt className="flex-1 text-foreground-muted">Tổng</dt>
          <dd className="font-semibold">{formatReportValue(total, format)}</dd>
        </div>
      ) : null}
    </TooltipBox>
  );
};

export const ReportChart = ({
  model,
  kind,
  format,
  measureLabel,
  stacked = false,
  className,
  height
}: Props) => {
  const single = model.series.length === 1 && !model.series[0]?.other;
  const horizontal = kind === "BAR" && !model.timeAxis;
  const summary = `Biểu đồ ${kind === "PIE" ? "tròn" : kind === "LINE" ? "đường" : "cột"}: ${measureLabel}, ${model.data.length} nhóm${model.series.length > 1 ? `, ${model.series.length} chuỗi` : ""}.`;

  if (kind === "PIE")
    return (
      <PieView
        model={model}
        format={format}
        measureLabel={measureLabel}
        className={className}
        summary={summary}
      />
    );

  const seriesCount = stacked ? 1 : model.series.length;
  const plotHeight =
    height ?? (horizontal ? Math.max(200, model.data.length * (seriesCount * 14 + 16) + 40) : 288);
  const tooltip = (props: TooltipContentProps) => (
    <CartesianTooltip
      {...props}
      model={model}
      format={format}
      measureLabel={measureLabel}
      single={single}
      stacked={stacked}
    />
  );
  // Largest |value| the value axis shows (stacks add up): one tick notation for the whole axis.
  const axisMax = Math.max(
    0,
    ...model.data.map((row) => {
      const values = model.series.map((series) => {
        const value = row[series.key];
        return typeof value === "number" ? Math.abs(value) : 0;
      });
      return stacked ? values.reduce((sum, value) => sum + value, 0) : Math.max(0, ...values);
    })
  );
  const compactAxis = axisMax >= 10_000;
  const valueAxisProps = {
    tickLine: false,
    axisLine: false,
    tick: AXIS,
    tickFormatter: (value: number) => formatAxisValue(value, format, compactAxis),
    allowDecimals: format !== "count" && format !== "images"
  };
  const tickEvery = Math.max(1, Math.ceil(model.data.length / 12));

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", vizPalette, className)}>
      <Legend series={model.series} single={single} label={measureLabel} />
      <div
        className={cn(
          "w-full min-w-0",
          horizontal && plotHeight > 640 && "max-h-[40rem] overflow-y-auto overscroll-contain"
        )}
        role="img"
        aria-label={summary}
      >
        <div style={{ height: plotHeight }} className="w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            {kind === "LINE" ? (
              <LineChart data={model.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  tick={AXIS}
                  tickFormatter={tickLabel}
                  interval={tickEvery - 1}
                  minTickGap={8}
                />
                <YAxis width={56} {...valueAxisProps} />
                <Tooltip
                  cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
                  content={tooltip}
                  isAnimationActive={false}
                />
                {model.series.map((series, index) => (
                  <Line
                    key={series.key}
                    type="linear"
                    dataKey={series.key}
                    name={series.label || measureLabel}
                    stroke={colorOf(series, index, single)}
                    strokeWidth={2}
                    dot={
                      model.data.length <= 31
                        ? { r: 3, strokeWidth: 0, fill: colorOf(series, index, single) }
                        : false
                    }
                    activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                    connectNulls={false}
                    animationDuration={500}
                  />
                ))}
              </LineChart>
            ) : horizontal ? (
              <BarChart
                data={model.data}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
                barCategoryGap={8}
                barGap={2}
              >
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" {...valueAxisProps} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={128}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  tick={AXIS}
                  tickFormatter={tickLabel}
                  interval={0}
                />
                <Tooltip
                  cursor={{ fill: "var(--surface-hover)" }}
                  content={tooltip}
                  isAnimationActive={false}
                />
                {model.series.map((series, index) => (
                  <Bar
                    key={series.key}
                    dataKey={series.key}
                    name={series.label || measureLabel}
                    fill={colorOf(series, index, single)}
                    {...(stacked ? { stackId: "stack" } : {})}
                    stroke="var(--surface)"
                    strokeWidth={stacked ? 1 : 0}
                    maxBarSize={22}
                    radius={stacked && index < model.series.length - 1 ? 0 : [0, 4, 4, 0]}
                    activeBar={false}
                    animationDuration={500}
                  />
                ))}
              </BarChart>
            ) : (
              <BarChart
                data={model.data}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                barCategoryGap="20%"
                barGap={2}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  tick={AXIS}
                  tickFormatter={tickLabel}
                  interval={tickEvery - 1}
                  minTickGap={4}
                />
                <YAxis width={56} {...valueAxisProps} />
                <Tooltip
                  cursor={{ fill: "var(--surface-hover)" }}
                  content={tooltip}
                  isAnimationActive={false}
                />
                {model.series.map((series, index) => (
                  <Bar
                    key={series.key}
                    dataKey={series.key}
                    name={series.label || measureLabel}
                    fill={colorOf(series, index, single)}
                    {...(stacked ? { stackId: "stack" } : {})}
                    stroke="var(--surface)"
                    strokeWidth={stacked ? 1 : 0}
                    maxBarSize={32}
                    radius={stacked && index < model.series.length - 1 ? 0 : [4, 4, 0, 0]}
                    activeBar={false}
                    animationDuration={500}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const PieView = ({
  model,
  format,
  measureLabel,
  className,
  summary
}: {
  model: ChartModel;
  format: ReportValueFormat;
  measureLabel: string;
  className?: string | undefined;
  summary: string;
}) => {
  const key = model.series[0]?.key ?? "s0";
  const slices = model.data.map((row, index) => ({
    label: String(row.label ?? ""),
    value: typeof row[key] === "number" ? row[key] : 0,
    other: row.category === "__other",
    index
  }));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const color = (slice: (typeof slices)[number]) =>
    seriesColor(slice.index, { other: slice.other });
  const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-center",
        vizPalette,
        className
      )}
    >
      <div className="aspect-square w-full max-w-64 shrink-0" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              isAnimationActive={false}
              content={({ active, payload }: TooltipContentProps) => {
                const slice = payload[0]?.payload as (typeof slices)[number] | undefined;
                if (!active || !slice) return null;
                return (
                  <TooltipBox title={slice.label}>
                    <TooltipRow
                      color={color(slice)}
                      label={measureLabel}
                      value={`${formatReportValue(slice.value, format)} · ${percent.format(total ? slice.value / total : 0)}`}
                    />
                  </TooltipBox>
                );
              }}
            />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="56%"
              outerRadius="92%"
              paddingAngle={slices.length > 1 ? 1 : 0}
              stroke="var(--surface)"
              strokeWidth={2}
              animationDuration={500}
            >
              {slices.map((slice) => (
                <Cell key={slice.index} fill={color(slice)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul
        className="flex w-full min-w-0 flex-col gap-1.5 text-sm sm:max-w-md"
        aria-label={`Chú giải: ${measureLabel}`}
      >
        {slices.map((slice) => (
          <li key={slice.index} className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: color(slice) }}
            />
            <span className="min-w-0 flex-1 truncate">{slice.label}</span>
            <span className="shrink-0 text-foreground-muted tabular-nums">
              {formatReportValue(slice.value, format)}
            </span>
            <span className="w-14 shrink-0 text-right text-xs text-foreground-muted tabular-nums">
              {percent.format(total ? slice.value / total : 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
