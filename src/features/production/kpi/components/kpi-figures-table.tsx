import { cn } from "cn";
import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import type { ReactNode } from "react";

import { useBreakpoint } from "@/hooks/use-breakpoint";

import { formatCredit, formatMoney } from "../../format";
import { formatPercent, formatSignedCredit, progressWidth } from "../../scores/forecast";

/**
 * KPI figures (SPEC Phase 6 §4): target, official points, Khoán converted to points, total, % đạt,
 * vượt/thiếu and Khoán money — one row per person (report) or per period (own results). Money only
 * shows when the API sent it (ADMIN or the owner). Table on tablet/desktop, cards on phones.
 */

export type KpiFiguresRow = {
  key: string;
  label: ReactNode;
  sublabel?: ReactNode;
  target: number | null;
  pointsOfficial: number;
  khoanPointsConverted: number;
  totalPoints: number;
  percent: number | null;
  difference: number | null;
  khoanMoney: number | null;
  /** settled = closed by a settlement run; provisional = what a settlement would give now. */
  state?: "settled" | "provisional" | undefined;
  met?: boolean | undefined;
  highlight?: boolean | undefined;
};

const StateBadge = ({ row }: { row: KpiFiguresRow }) => {
  if (!row.state) return null;
  if (row.state === "provisional") {
    return (
      <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-foreground-muted">
        <CircleDashed className="size-3.5" aria-hidden="true" />
        Tạm tính
      </span>
    );
  }
  return row.met ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-success">
      <CircleCheck className="size-3.5" aria-hidden="true" />
      Đạt
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-danger">
      <CircleX className="size-3.5" aria-hidden="true" />
      Không đạt
    </span>
  );
};

const Percent = ({ value }: { value: number | null }) => (
  <span className="inline-flex min-w-20 flex-col items-end gap-1">
    <span
      className={cn(
        "font-semibold tabular-nums",
        value !== null && value >= 100 && "text-success",
        value !== null && value < 80 && "text-danger"
      )}
    >
      {formatPercent(value)}
    </span>
    <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span
        className={cn(
          "block h-full rounded-full",
          value !== null && value >= 100 ? "bg-success" : value !== null && value < 80 ? "bg-danger" : "bg-warning"
        )}
        style={{ width: `${progressWidth(value)}%` }}
      />
    </span>
  </span>
);

const Difference = ({ value }: { value: number | null }) => (
  <span
    className={cn(
      "tabular-nums",
      value !== null && value > 0 && "text-success",
      value !== null && value < 0 && "text-danger"
    )}
  >
    {formatSignedCredit(value)}
  </span>
);

export const KpiFiguresTable = ({
  rows,
  firstColumn,
  showMoney,
  caption
}: {
  rows: readonly KpiFiguresRow[];
  firstColumn: string;
  showMoney: boolean;
  caption: string;
}) => {
  const breakpoint = useBreakpoint();
  const showState = rows.some((row) => row.state !== undefined);

  if (breakpoint === "mobile") {
    return (
      <ul className="divide-y" aria-label={caption}>
        {rows.map((row) => (
          <li key={row.key} className={cn("flex flex-col gap-2 px-4 py-3", row.highlight && "bg-brand-soft/50")}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium">{row.label}</span>
                {row.sublabel ? (
                  <span className="truncate text-xs text-foreground-muted">{row.sublabel}</span>
                ) : null}
              </div>
              <Percent value={row.percent} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums">
              <Figure label="Chỉ tiêu" value={formatCredit(row.target)} />
              <Figure label="Chính thức" value={formatCredit(row.pointsOfficial)} />
              <Figure label="Khoán quy điểm" value={formatCredit(row.khoanPointsConverted)} />
              <Figure label="Tổng" value={formatCredit(row.totalPoints)} strong />
              <Figure label="Vượt / thiếu" value={<Difference value={row.difference} />} />
              {showMoney ? <Figure label="Tiền Khoán" value={formatMoney(row.khoanMoney)} /> : null}
            </dl>
            {showState ? <StateBadge row={row} /> : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[52rem] text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b text-right text-xs text-foreground-muted">
            <th scope="col" className="sticky left-0 z-10 bg-surface py-2.5 pr-3 pl-4 text-left font-medium">
              {firstColumn}
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Chỉ tiêu
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Chính thức
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Khoán quy điểm
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Tổng
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              % đạt
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Vượt / thiếu
            </th>
            {showMoney ? (
              <th scope="col" className="px-3 py-2.5 font-medium">
                Tiền Khoán
              </th>
            ) : null}
            {showState ? (
              <th scope="col" className="py-2.5 pr-4 pl-3 text-left font-medium">
                Trạng thái
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((row) => (
            <tr key={row.key} className={cn("text-right tabular-nums", row.highlight && "bg-brand-soft/50")}>
              <th
                scope="row"
                className={cn(
                  "sticky left-0 z-10 max-w-60 py-2.5 pr-3 pl-4 text-left font-normal",
                  row.highlight ? "bg-[color-mix(in_oklch,var(--brand-soft),var(--surface)_50%)]" : "bg-surface"
                )}
              >
                <span className="block truncate font-medium">{row.label}</span>
                {row.sublabel ? (
                  <span className="block truncate text-xs text-foreground-muted">{row.sublabel}</span>
                ) : null}
              </th>
              <td className="px-3 py-2.5 text-foreground-muted">{formatCredit(row.target)}</td>
              <td className="px-3 py-2.5">{formatCredit(row.pointsOfficial)}</td>
              <td className="px-3 py-2.5">{formatCredit(row.khoanPointsConverted)}</td>
              <td className="px-3 py-2.5 font-semibold">{formatCredit(row.totalPoints)}</td>
              <td className="px-3 py-2.5">
                <Percent value={row.percent} />
              </td>
              <td className="px-3 py-2.5">
                <Difference value={row.difference} />
              </td>
              {showMoney ? (
                <td className="px-3 py-2.5 whitespace-nowrap">{formatMoney(row.khoanMoney)}</td>
              ) : null}
              {showState ? (
                <td className="py-2.5 pr-4 pl-3 text-left">
                  <StateBadge row={row} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Figure = ({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-2">
    <dt className="text-foreground-muted">{label}</dt>
    <dd className={cn(strong && "font-semibold")}>{value}</dd>
  </div>
);
