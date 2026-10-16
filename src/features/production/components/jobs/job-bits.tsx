import { cn } from "cn";
import { AlarmClock, CircleCheck, RotateCcw, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import type { JobStatusRef, ProductionStatusRef, TaskKind } from "@/contracts/production-jobs";
import type { UserRef } from "@/contracts/work";
import { toneClass } from "@/lib/colors";

import { formatInteger } from "../../format";
import { processTotalChips, type ProcessTotal } from "../../jobs-model";

/** Small presentational pieces shared by the job and task screens. */

export const StatusChip = ({
  status,
  className,
  size = "md"
}: {
  status: Pick<ProductionStatusRef, "name" | "color"> | null;
  className?: string;
  size?: "sm" | "md";
}) =>
  status ? (
    <span
      className={cn(
        toneClass(status.color),
        "inline-flex max-w-full items-center gap-1.5 rounded-full bg-(--tone-soft) font-medium whitespace-nowrap text-(--tone-text)",
        size === "md" ? "h-6 px-2.5 text-xs" : "h-5 px-2 text-[11px]",
        className
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tone)" />
      <span className="truncate">{status.name}</span>
    </span>
  ) : (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-dashed px-2.5 text-xs whitespace-nowrap text-foreground-subtle",
        className
      )}
    >
      Chưa chia
    </span>
  );

/**
 * A job's manual status (PD-038) as a coloured chip: always one line — a long name ends in "…" with the full name as
 * the tooltip — so table columns and card rows keep their width. Closed statuses ("đóng") show a check instead of the
 * dot. Tones come from the shared palette (readable in light and dark mode).
 */
export const JobStatusChip = ({
  status,
  className,
  size = "md"
}: {
  status: Pick<JobStatusRef, "name" | "color" | "isClosed">;
  className?: string;
  size?: "sm" | "md";
}) => (
  <span
    title={status.isClosed ? `${status.name} (đã đóng)` : status.name}
    className={cn(
      toneClass(status.color),
      "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-(--tone-soft) font-medium whitespace-nowrap text-(--tone-text)",
      size === "md" ? "h-6 px-2.5 text-xs" : "h-5 px-2 text-[11px]",
      className
    )}
  >
    {status.isClosed ? (
      <CircleCheck aria-hidden="true" className="size-3 shrink-0" />
    ) : (
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tone)" />
    )}
    <span className="min-w-0 truncate">{status.name}</span>
  </span>
);

const kindLabels: Record<Exclude<TaskKind, "NORMAL">, string> = {
  FB_WRONG: "FB sai",
  FB_EXTRA: "FB thêm"
};

/** Feedback task marker (PLAN §3: kind FB sai / FB thêm). */
export const KindBadge = ({ kind, className }: { kind: TaskKind; className?: string }) =>
  kind === "NORMAL" ? null : (
    <span
      title={
        kind === "FB_WRONG"
          ? "Làm lại theo feedback sai của khách"
          : "Làm thêm theo yêu cầu của khách"
      }
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-semibold",
        kind === "FB_WRONG" ? "bg-danger-soft text-danger" : "bg-warning-soft text-foreground",
        className
      )}
    >
      {kind === "FB_WRONG" ? (
        <RotateCcw className="size-3" aria-hidden="true" />
      ) : (
        <Sparkles className="size-3" aria-hidden="true" />
      )}
      {kindLabels[kind]}
    </span>
  );

export const LateBadge = ({ className, label = "Trễ" }: { className?: string; label?: string }) => (
  <span
    className={cn(
      "inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-danger-soft px-1.5 text-[11px] font-semibold text-danger",
      className
    )}
  >
    <AlarmClock className="size-3" aria-hidden="true" />
    {label}
  </span>
);

export const Person = ({
  user,
  className,
  size = "sm",
  fallback = "—"
}: {
  user: Pick<UserRef, "id" | "displayName" | "avatarUrl"> | null;
  className?: string;
  size?: "xs" | "sm";
  fallback?: string;
}) =>
  user ? (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <UserAvatar user={user} size={size} />
      <span className="truncate">{user.displayName}</span>
    </span>
  ) : (
    <span className={cn("text-foreground-subtle", className)}>{fallback}</span>
  );

/** Thin progress bar (value 0–100). */
export const MiniBar = ({
  value,
  tone = "brand",
  className
}: {
  value: number;
  tone?: "brand" | "success" | "muted" | "warning";
  className?: string;
}) => (
  <span
    aria-hidden="true"
    className={cn("block h-1 w-full overflow-hidden rounded-full bg-muted", className)}
  >
    <span
      className={cn(
        "block h-full rounded-full transition-[width] duration-300",
        tone === "brand" && "bg-brand",
        tone === "success" && "bg-success",
        tone === "muted" && "bg-foreground-subtle",
        tone === "warning" && "bg-warning"
      )}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </span>
);

/**
 * PD-058: a task without a quantity yet — a muted dashed chip in place of the number, one line and no wider than a
 * number column ("Chưa có SL"; screen readers hear "chưa có số lượng"). The worker fills it in, at the latest at Done.
 */
export const NoQtyChip = ({ className }: { className?: string | undefined }) => (
  <span
    title="Chưa có số lượng — người làm điền khi chuyển Done"
    className={cn(
      "inline-flex h-5 shrink-0 items-center rounded-md border border-dashed border-border-strong bg-muted/50 px-1.5 text-[11px] leading-none font-medium whitespace-nowrap text-foreground-muted",
      className
    )}
  >
    <span aria-hidden="true">Chưa có SL</span>
    <span className="sr-only">chưa có số lượng</span>
  </span>
);

/** A task's quantity: the number (tabular), or the "Chưa có SL" chip while it has none (PD-058). */
export const QtyValue = ({
  value,
  className,
  chipClassName
}: {
  value: number | null;
  className?: string | undefined;
  chipClassName?: string | undefined;
}) =>
  value === null ? (
    <NoQtyChip className={chipClassName} />
  ) : (
    <span className={cn("tabular-nums", className)}>{formatInteger(value)}</span>
  );

/** PD-058 beside a total: "2 task chưa có số lượng" (the total counts known numbers only); nothing when 0. */
export const MissingQtyNote = ({
  count,
  short = false,
  className
}: {
  count: number;
  /** Narrow cells: "2 chưa có SL" (the full sentence is the tooltip and what screen readers hear). */
  short?: boolean;
  className?: string | undefined;
}) => {
  if (count <= 0) return null;
  const full = `${formatInteger(count)} task chưa có số lượng`;
  return (
    <span
      title={full}
      className={cn("block truncate text-[11px] text-foreground-muted tabular-nums", className)}
    >
      {short ? (
        <>
          <span aria-hidden="true">{formatInteger(count)} chưa có SL</span>
          <span className="sr-only">{full}</span>
        </>
      ) : (
        full
      )}
    </span>
  );
};

/** Label/value pair used in detail headers. */
export const Fact = ({
  label,
  children,
  className
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
    <dt className="text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase">
      {label}
    </dt>
    <dd className="min-w-0 text-[13px]">{children}</dd>
  </div>
);

/**
 * PD-048 "Tổng tấm" per process ("Công đoạn"): one chip per process — its name (ending in "…" when long) and its images
 * — largest first, as the API sends them. `max`: at most that many chips, then "+N" whose tooltip lists the rest (the
 * whole list is the group's tooltip and what screen readers hear). `layout="stack"`: one chip per line with the "+N"
 * after the last one, so a table cell knows its height (two lines with max 2).
 */
export const ProcessTotalChips = ({
  totals,
  max,
  size = "sm",
  layout = "wrap",
  className
}: {
  totals: readonly ProcessTotal[];
  max?: number | undefined;
  size?: "sm" | "md";
  layout?: "wrap" | "stack";
  className?: string;
}) => {
  if (totals.length === 0) return null;
  const { shown, hidden, hiddenText, text } = processTotalChips(totals, max);
  const chip = cn(
    "inline-flex max-w-full min-w-0 items-center gap-1 rounded-md bg-muted whitespace-nowrap text-foreground-muted",
    size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[11px]"
  );
  const more =
    hidden > 0 ? (
      <span className={cn(chip, "shrink-0 font-medium")} title={hiddenText}>
        +{hidden}
      </span>
    ) : null;
  const chips = shown.map((total) => (
    <span key={total.process.id} className={chip}>
      <span className="min-w-0 truncate">{total.process.name}</span>
      <span className="shrink-0 font-semibold text-foreground tabular-nums">
        {formatInteger(total.qty)}
      </span>
    </span>
  ));
  const last = chips.length - 1;
  return (
    <span title={text} className={cn("flex min-w-0", className)}>
      <span className="sr-only">Tổng tấm theo công đoạn: {text}</span>
      <span
        aria-hidden="true"
        className={cn(
          "flex min-w-0",
          layout === "stack" ? "flex-col items-start gap-1" : "flex-wrap gap-1"
        )}
      >
        {layout === "stack" ? (
          <>
            {chips.slice(0, last)}
            <span className="flex max-w-full min-w-0 items-center gap-1">
              {chips[last]}
              {more}
            </span>
          </>
        ) : (
          <>
            {chips}
            {more}
          </>
        )}
      </span>
    </span>
  );
};
