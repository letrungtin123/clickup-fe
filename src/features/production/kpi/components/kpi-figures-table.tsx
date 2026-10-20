import { cn } from "cn";
import { CircleCheck, CircleDashed, CircleDotDashed, CircleX } from "lucide-react";
import type { ReactNode } from "react";

import { useBreakpoint } from "@/hooks/use-breakpoint";

import { formatCredit, formatMoney } from "../../format";
import { formatPercent, progressWidth } from "../../scores/forecast";
import { rollupStatusInfo, type KpiFigures, type RollupStatus } from "../report";

/**
 * KPI figures (SPEC Phase 6 §4, PD-066): KPI, official points, shortfall ("Thiếu"), points topped up from Khoán ("Bù từ
 * Khoán"), total, % đạt and the Khoán money earned / paid — one row per person (report) or per period (own results).
 * Money only shows when the API sent it (the owner or "Xem tiền Khoán người khác"); Khoán is never shown as points of
 * its own. Table on tablet/desktop, cards on phones.
 */

export type KpiFiguresRow = KpiFigures & {
  key: string;
  label: ReactNode;
  sublabel?: ReactNode;
  /** settled = closed by a settlement run; provisional = what a settlement would give now. */
  state?: "settled" | "provisional" | undefined;
  met?: boolean | undefined;
  /** Quarter / year rows: whole period settled, provisional or not finished (SPEC §8.4). */
  rollupStatus?: RollupStatus | null | undefined;
  /** Total rows (team / organization): bold, tinted. */
  total?: boolean | undefined;
  highlight?: boolean | undefined;
};

/** "Đã chốt" / "Tạm tính" / "Chưa hết kỳ" of a quarter / year (also used beside the period picker). */
export const RollupStatusBadge = ({
  status,
  className
}: {
  status: RollupStatus;
  className?: string;
}) => {
  const Icon =
    status === "SETTLED" ? CircleCheck : status === "PROVISIONAL" ? CircleDashed : CircleDotDashed;
  return (
    <span
      title={rollupStatusInfo[status].hint}
      className={cn(
        "inline-flex items-center gap-1 text-xs whitespace-nowrap",
        status === "SETTLED" ? "font-medium text-success" : "text-foreground-muted",
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {rollupStatusInfo[status].label}
    </span>
  );
};

const StateBadge = ({ row }: { row: KpiFiguresRow }) => {
  if (row.rollupStatus) return <RollupStatusBadge status={row.rollupStatus} />;
  if (!row.state) return null;
  if (row.state === "provisional") {
    return (
      <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-foreground-muted">
        <CircleDashed className="size-3.5" aria-hidden="true" />
        Tạm tính
      </span>
    );
  }
  const toppedUp =
    row.khoanPointsConverted > 0 ? (
      <span className="pl-[1.125rem] text-[11px] leading-tight text-foreground-muted">
        {row.met ? "có bù từ Khoán" : "đã bù hết Khoán"}
      </span>
    ) : null;
  return row.met ? (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-success">
        <CircleCheck className="size-3.5" aria-hidden="true" />
        Đạt
      </span>
      {toppedUp}
    </span>
  ) : (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-danger">
        <CircleX className="size-3.5" aria-hidden="true" />
        Không đạt
      </span>
      {toppedUp}
    </span>
  );
};

/**
 * % đạt with its bar. A settled "Không đạt" never shows green (rows of runs before PD-066 could reach 100 % with
 * converted Khoán and still be "Không đạt").
 */
const Percent = ({ value, met }: { value: number | null; met?: boolean | undefined }) => {
  const tone =
    value === null
      ? "muted"
      : value >= 100 && met !== false
        ? "success"
        : value < 80
          ? "danger"
          : "warning";
  return (
    <span className="inline-flex min-w-16 flex-col items-end gap-1">
      <span
        className={cn(
          "font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger"
        )}
      >
        {formatPercent(value)}
      </span>
      <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-warning"
          )}
          style={{ width: `${progressWidth(value)}%` }}
        />
      </span>
    </span>
  );
};

/** "Thiếu": red while a shortfall is left; "—" without a KPI. */
const Shortfall = ({ row }: { row: KpiFiguresRow }) =>
  row.target === null ? (
    <span className="text-foreground-subtle">—</span>
  ) : (
    <span className={cn("tabular-nums", row.shortfall > 0 && "text-danger")}>
      {formatCredit(row.shortfall)}
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
  const showState = rows.some((row) => row.state !== undefined || Boolean(row.rollupStatus));
  const settledMet = (row: KpiFiguresRow) => (row.state === "settled" ? row.met : undefined);

  if (breakpoint === "mobile") {
    return (
      <ul className="divide-y" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={row.key}
            className={cn(
              "flex flex-col gap-2 px-4 py-3",
              row.highlight && "bg-brand-soft/50",
              row.total && "bg-muted/60"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "truncate text-[13px]",
                    row.total ? "font-semibold" : "font-medium"
                  )}
                >
                  {row.label}
                </span>
                {row.sublabel ? (
                  <span className="truncate text-xs text-foreground-muted">{row.sublabel}</span>
                ) : null}
              </div>
              <Percent value={row.percent} met={settledMet(row)} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums">
              <Figure label="KPI" value={formatCredit(row.target)} />
              <Figure label="Chính thức" value={formatCredit(row.pointsOfficial)} />
              <Figure label="Thiếu" value={<Shortfall row={row} />} />
              <Figure label="Bù từ Khoán" value={formatCredit(row.khoanPointsConverted)} />
              <Figure label="Tổng" value={formatCredit(row.totalPoints)} strong />
              {showMoney ? (
                <>
                  <Figure label="Khoán đã làm" value={formatMoney(row.khoanMoneyEarned)} />
                  <Figure label="Khoán nhận" value={formatMoney(row.khoanMoneyPaid)} strong />
                </>
              ) : null}
            </dl>
            {showState ? <StateBadge row={row} /> : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className={cn("w-full text-[13px]", showMoney ? "min-w-[60rem]" : "min-w-[48rem]")}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b text-right text-xs text-foreground-muted">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-surface py-2.5 pr-3 pl-4 text-left font-medium"
            >
              {firstColumn}
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              KPI
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Chính thức
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Thiếu
            </th>
            {/* Two lines at most ("Bù từ / Khoán"), never three. */}
            <th scope="col" className="min-w-20 px-3 py-2.5 font-medium">
              Bù từ Khoán
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Tổng
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              % đạt
            </th>
            {showMoney ? (
              <>
                <th scope="col" className="min-w-24 px-3 py-2.5 font-medium">
                  Tiền Khoán đã làm
                </th>
                <th scope="col" className="min-w-24 px-3 py-2.5 font-medium">
                  Tiền Khoán nhận
                </th>
              </>
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
            <tr
              key={row.key}
              className={cn(
                "text-right tabular-nums",
                row.highlight && "bg-brand-soft/50",
                row.total && "bg-muted/60 font-medium"
              )}
            >
              <th
                scope="row"
                className={cn(
                  "sticky left-0 z-10 max-w-60 py-2.5 pr-3 pl-4 text-left font-normal",
                  row.highlight
                    ? "bg-[color-mix(in_oklab,var(--brand-soft),var(--surface)_50%)]"
                    : row.total
                      ? "bg-[color-mix(in_oklab,var(--muted),var(--surface)_40%)]"
                      : "bg-surface"
                )}
              >
                <span className={cn("block truncate", row.total ? "font-semibold" : "font-medium")}>
                  {row.label}
                </span>
                {row.sublabel ? (
                  <span className="block truncate text-xs text-foreground-muted">
                    {row.sublabel}
                  </span>
                ) : null}
              </th>
              <td className="px-3 py-2.5 text-foreground-muted">{formatCredit(row.target)}</td>
              <td className="px-3 py-2.5">{formatCredit(row.pointsOfficial)}</td>
              <td className="px-3 py-2.5">
                <Shortfall row={row} />
              </td>
              <td className="px-3 py-2.5">{formatCredit(row.khoanPointsConverted)}</td>
              <td className="px-3 py-2.5 font-semibold">{formatCredit(row.totalPoints)}</td>
              <td className="px-3 py-2.5">
                <Percent value={row.percent} met={settledMet(row)} />
              </td>
              {showMoney ? (
                <>
                  <td className="px-3 py-2.5 whitespace-nowrap text-foreground-muted">
                    {formatMoney(row.khoanMoneyEarned)}
                  </td>
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                    {formatMoney(row.khoanMoneyPaid)}
                  </td>
                </>
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

const Figure = ({
  label,
  value,
  strong = false
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-2">
    <dt className="text-foreground-muted">{label}</dt>
    <dd className={cn(strong && "font-semibold")}>{value}</dd>
  </div>
);
