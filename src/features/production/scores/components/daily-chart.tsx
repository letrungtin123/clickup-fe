import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type XAxisTickContentProps
} from "recharts";

import type { ScoreSummary } from "@/contracts/production-scores";

import { formatCredit } from "../../format";

/**
 * Daily points (SPEC Phase 3 §5): stacked columns, official points at the base and Khoán points on
 * top, one column per business day of the range. Loaded lazily (recharts stays out of the main
 * bundle). Two steps of the brand hue: official = solid, Khoán = a lighter step; legend + tooltip
 * carry identity, the entries list below is the table view.
 */

type Day = ScoreSummary["byDay"][number];

const OFFICIAL = "var(--brand)";
// Mixed with white (not the surface) so the lighter step stays visible on the dark theme too.
const KHOAN = "color-mix(in oklab, var(--brand) 42%, white)";
const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const weekday = (day: string) => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return weekdays[new Date(Date.UTC(year, month - 1, date)).getUTCDay()] ?? "";
};
const dayMonth = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
type TooltipValue = number | string | readonly (number | string)[];

const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

const ChartTooltip = ({ active, payload }: TooltipContentProps<TooltipValue, string | number>) => {
  const row = payload[0]?.payload as Day | undefined;
  if (!active || !row) return null;
  const total = row.pointsOfficial + row.pointsKhoan;
  return (
    <div className="min-w-40 rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10">
      <p className="mb-1.5 font-medium">
        {weekday(row.day)}, {dayMonth(row.day)}
      </p>
      <dl className="flex flex-col gap-1 tabular-nums">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-sm" style={{ background: OFFICIAL }} />
          <dt className="flex-1 text-foreground-muted">Chính thức</dt>
          <dd className="font-medium">{formatCredit(row.pointsOfficial)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-sm" style={{ background: KHOAN }} />
          <dt className="flex-1 text-foreground-muted">Khoán</dt>
          <dd className="font-medium">{formatCredit(row.pointsKhoan)}</dd>
        </div>
        <div className="mt-0.5 flex items-center gap-2 border-t pt-1">
          <dt className="flex-1 text-foreground-muted">Tổng</dt>
          <dd className="font-semibold">{formatCredit(total)}</dd>
        </div>
      </dl>
    </div>
  );
};

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
      {day.slice(8, 10)}
    </text>
  );
};

export const DailyPointsChart = ({ days, today }: { days: readonly Day[]; today: string }) => {
  const totalOfficial = days.reduce((sum, row) => sum + row.pointsOfficial, 0);
  const totalKhoan = days.reduce((sum, row) => sum + row.pointsKhoan, 0);
  const tickEvery = days.length > 20 ? 3 : days.length > 10 ? 2 : 1;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: OFFICIAL }} />
          Chính thức
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: KHOAN }} />
          Khoán
        </li>
      </ul>
      <div
        className="h-56 w-full sm:h-64"
        role="img"
        aria-label={`Biểu đồ điểm theo ngày: tổng ${formatCredit(totalOfficial)} điểm chính thức và ${formatCredit(totalKhoan)} điểm Khoán trong ${days.length} ngày.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={days}
            margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
            barCategoryGap="22%"
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              interval={0}
              tick={(props: XAxisTickContentProps) => (
                <DayTick {...props} every={tickEvery} today={today} />
              )}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
              tickFormatter={(value: number) => compact.format(value)}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-hover)" }}
              content={(props) => <ChartTooltip {...props} />}
              isAnimationActive={false}
            />
            <Bar
              dataKey="pointsOfficial"
              name="Chính thức"
              stackId="points"
              fill={OFFICIAL}
              stroke="var(--surface)"
              strokeWidth={1}
              maxBarSize={24}
              radius={[3, 3, 0, 0]}
              activeBar={false}
              animationDuration={500}
            />
            <Bar
              dataKey="pointsKhoan"
              name="Khoán"
              stackId="points"
              fill={KHOAN}
              stroke="var(--surface)"
              strokeWidth={1}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              activeBar={false}
              animationDuration={500}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Điểm theo ngày</caption>
        <thead>
          <tr>
            <th scope="col">Ngày</th>
            <th scope="col">Chính thức</th>
            <th scope="col">Khoán</th>
          </tr>
        </thead>
        <tbody>
          {days
            .filter((row) => row.pointsOfficial !== 0 || row.pointsKhoan !== 0)
            .map((row) => (
              <tr key={row.day}>
                <th scope="row">{dayMonth(row.day)}</th>
                <td>{formatCredit(row.pointsOfficial)}</td>
                <td>{formatCredit(row.pointsKhoan)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
};
