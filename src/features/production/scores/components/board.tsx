import { cn } from "cn";
import { Medal } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { Link } from "@/components/shared/router-link";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { ScoreBoard } from "@/contracts/production-scores";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { formatCredit, formatInteger, formatMoney } from "../../format";

/**
 * Public ranking (SPEC Phase 3 §5 /scores/board): official points rank people; Khoán images and
 * points are public, money only where the API returned it (own row, ADMIN, or money public). With
 * `hrefOf`, every person opens their "Điểm cá nhân" (PD-052).
 */

type Row = ScoreBoard["items"][number];

/** A person's cell / card: a link to their scores when `to` is given (hrefless router link). */
const PersonLink = ({
  to,
  className,
  children
}: {
  to: string | undefined;
  className: string;
  children: ReactNode;
}) =>
  to ? (
    <Link
      to={to}
      className={cn(
        "outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className
      )}
    >
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );

const medalTone = ["text-amber-500", "text-slate-400", "text-orange-700 dark:text-orange-400"];

export const RankBadge = ({ rank }: { rank: number }) =>
  rank <= 3 ? (
    <span className="flex size-7 items-center justify-center" aria-label={`Hạng ${rank}`}>
      <Medal className={cn("size-5", medalTone[rank - 1])} aria-hidden="true" />
    </span>
  ) : (
    <span className="flex size-7 items-center justify-center text-[13px] font-medium text-foreground-muted tabular-nums">
      {rank}
    </span>
  );

/** Top three as cards (the podium). */
export const Podium = ({
  rows,
  meId,
  hrefOf
}: {
  rows: readonly Row[];
  meId: string;
  hrefOf?: ((userId: string) => string) | undefined;
}) => {
  const top = rows.filter((row) => row.rank <= 3 && row.pointsOfficial > 0).slice(0, 3);
  if (top.length === 0) return null;
  return (
    <ol className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Ba người dẫn đầu">
      {top.map((row, index) => (
        <motion.li
          key={row.user.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: index * 0.05 }}
          className={cn(
            "flex min-w-0 rounded-xl border bg-surface shadow-xs",
            row.user.id === meId && "border-brand/40 bg-brand-soft/60"
          )}
        >
          <PersonLink
            to={hrefOf?.(row.user.id)}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center sm:px-3 sm:py-4"
          >
            <span className="relative">
              <UserAvatar user={row.user} size="lg" />
              <span className="absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full bg-surface shadow-xs ring-1 ring-border">
                <Medal className={cn("size-3.5", medalTone[row.rank - 1])} aria-hidden="true" />
              </span>
            </span>
            <span
              className="line-clamp-2 w-full text-[13px] leading-tight font-medium break-words"
              title={row.user.displayName}
            >
              {row.user.displayName}
            </span>
            <span className="text-base font-semibold tracking-[-0.01em] tabular-nums sm:text-lg">
              {formatCredit(row.pointsOfficial)}
            </span>
            <span className="w-full truncate text-[11px] text-foreground-muted">
              {row.teamName ?? "Chưa có team"}
            </span>
          </PersonLink>
        </motion.li>
      ))}
    </ol>
  );
};

export const BoardTable = ({
  rows,
  meId,
  showMoney,
  hrefOf
}: {
  rows: readonly Row[];
  meId: string;
  showMoney: boolean;
  hrefOf?: ((userId: string) => string) | undefined;
}) => {
  const breakpoint = useBreakpoint();
  const max = Math.max(1, ...rows.map((row) => row.pointsOfficial));

  if (breakpoint === "mobile") {
    return (
      <ol className="divide-y" aria-label="Bảng xếp hạng">
        {rows.map((row) => {
          const own = row.user.id === meId;
          return (
            <li key={row.user.id} className={cn(own && "bg-brand-soft/50")}>
              <PersonLink
                to={hrefOf?.(row.user.id)}
                className="flex min-h-12 items-center gap-3 px-3 py-2.5"
              >
                <RankBadge rank={row.rank} />
                <UserAvatar user={row.user} size="md" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-snug font-medium">
                    <span className="min-w-0 break-words">{row.user.displayName}</span>
                    {own ? <YouTag /> : null}
                  </span>
                  <span className="truncate text-xs text-foreground-muted">
                    {row.teamName ?? "Chưa có team"}
                  </span>
                  {row.qtyKhoan > 0 || row.pointsKhoan > 0 ? (
                    <span className="text-xs text-foreground-muted tabular-nums">
                      {`Khoán ${formatCredit(row.pointsKhoan)}\u00a0điểm · ${formatInteger(row.qtyKhoan)}\u00a0tấm`}
                      {row.money !== null && (showMoney || own) && row.money > 0
                        ? ` · ${formatMoney(row.money)}`
                        : ""}
                    </span>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatCredit(row.pointsOfficial)}
                </span>
              </PersonLink>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[40rem] text-[13px]">
        <caption className="sr-only">Bảng xếp hạng theo điểm chính thức</caption>
        <thead>
          <tr className="border-b text-xs whitespace-nowrap text-foreground-muted">
            <th scope="col" className="w-14 py-2.5 pl-4 text-left font-medium">
              Hạng
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Nhân viên
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Team
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium lg:w-[30%]">
              Điểm chính thức
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Tấm Khoán
            </th>
            <th
              scope="col"
              className={cn("py-2.5 pl-3 text-right font-medium", showMoney ? "px-3" : "pr-4")}
            >
              Điểm Khoán
            </th>
            {showMoney ? (
              <th scope="col" className="py-2.5 pr-4 pl-3 text-right font-medium">
                Tiền Khoán
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((row) => {
            const own = row.user.id === meId;
            return (
              <tr key={row.user.id} className={cn(own && "bg-brand-soft/50")}>
                <td className="py-2 pl-4">
                  <RankBadge rank={row.rank} />
                </td>
                <td className="px-3 py-2">
                  {hrefOf ? (
                    <Link
                      to={hrefOf(row.user.id)}
                      className="-mx-1 flex min-w-0 items-center gap-2 rounded px-1 py-0.5 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <UserAvatar user={row.user} size="sm" />
                      <span className="min-w-0 font-medium break-words">
                        {row.user.displayName}
                      </span>
                      {own ? <YouTag /> : null}
                    </Link>
                  ) : (
                    <span className="flex min-w-0 items-center gap-2">
                      <UserAvatar user={row.user} size="sm" />
                      <span className="min-w-0 font-medium break-words">
                        {row.user.displayName}
                      </span>
                      {own ? <YouTag /> : null}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-foreground-muted">
                  {row.teamName ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center justify-end gap-2.5">
                    <span
                      className="hidden h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-muted lg:block"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full bg-brand"
                        style={{ width: `${(row.pointsOfficial / max) * 100}%` }}
                      />
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatCredit(row.pointsOfficial)}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInteger(row.qtyKhoan)}</td>
                <td
                  className={cn("py-2 pl-3 text-right tabular-nums", showMoney ? "px-3" : "pr-4")}
                >
                  {formatCredit(row.pointsKhoan)}
                </td>
                {showMoney ? (
                  <td className="py-2 pr-4 pl-3 text-right whitespace-nowrap tabular-nums">
                    {row.money === null ? (
                      <span className="text-foreground-subtle">—</span>
                    ) : (
                      formatMoney(row.money)
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const YouTag = () => (
  <span className="shrink-0 rounded bg-brand px-1 py-px text-[10px] font-semibold text-brand-foreground">
    Bạn
  </span>
);
