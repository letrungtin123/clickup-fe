import { cn } from "cn";

import { UserAvatar } from "@/components/shared/user-avatar";
import type { JobSummary, ProductionTask } from "@/contracts/production-jobs";
import { colorForId, toneClass } from "@/lib/colors";

import { formatCredit, formatInteger } from "../../format";
import { monthLabel, monthTone, projectTitle, type PointsCell } from "../../job-list-model";
import { processTotalChips, type ProcessTotal } from "../../jobs-model";

/**
 * Small cells of the job List view (PD-067, ClickUp-like): coloured chips for the project, the shift ("Ca"), the process
 * ("Công đoạn") and the month group, a compact progress bar, the creator. One line each, so rows keep a fixed height.
 */

const chip =
  "inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-md bg-(--tone-soft) px-1.5 text-[11px] font-medium whitespace-nowrap text-(--tone-text)";

/** "Dự án": the project's code as a chip in its own colour (the name and client in the tooltip). */
export const ProjectChip = ({
  project,
  className
}: {
  project: JobSummary["project"];
  className?: string;
}) => (
  <span
    title={projectTitle(project)}
    className={cn(toneClass(colorForId(project.id)), chip, className)}
  >
    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-[2px] bg-(--tone)" />
    <span className="min-w-0 truncate">{project.code}</span>
  </span>
);

/** "Ca": the shift's name; blue for an official (points) shift, amber for a Khoán shift. */
export const ShiftChip = ({
  shift,
  className
}: {
  shift: ProductionTask["shift"];
  className?: string;
}) => (
  <span
    title={`${shift.name} — ${shift.payMode === "POINTS" ? "tính điểm" : "khoán"}`}
    className={cn(toneClass(shift.payMode === "POINTS" ? "sky" : "amber"), chip, className)}
  >
    <span className="min-w-0 truncate">{shift.name}</span>
  </span>
);

/** "Công đoạn" of a task: the process as a chip in its own colour. */
export const ProcessChip = ({
  process,
  className
}: {
  process: Pick<ProductionTask["process"], "id" | "name">;
  className?: string;
}) => (
  <span title={process.name} className={cn(toneClass(colorForId(process.id)), chip, className)}>
    <span className="min-w-0 truncate">{process.name}</span>
  </span>
);

/** The month group's pill: "THÁNG 10 · 2026" on the month's colour. */
export const MonthPill = ({ month, className }: { month: string; className?: string }) => (
  <span
    className={cn(
      toneClass(monthTone(month)),
      "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-(--tone-solid) px-2 text-[11px] font-bold tracking-[0.06em] whitespace-nowrap text-(--tone-on) uppercase shadow-xs",
      className
    )}
  >
    {monthLabel(month)}
  </span>
);

const percent = (value: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;

/**
 * "Tiến độ": checked (green) over done (brand) as one thin bar, with the done share; the numbers in the tooltip.
 * `total` 0: "—".
 */
export const ProgressCell = ({
  done,
  checked,
  total,
  label
}: {
  done: number;
  checked: number;
  total: number;
  /** Tooltip / screen-reader text. */
  label: string;
}) => {
  if (total <= 0) return <span className="text-foreground-subtle">—</span>;
  const donePercent = percent(done, total);
  const checkedPercent = percent(checked, total);
  return (
    <span className="flex w-full min-w-0 items-center gap-2" title={label}>
      <span
        aria-hidden="true"
        className="relative block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-brand/70"
          style={{ width: `${donePercent}%` }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-success"
          style={{ width: `${checkedPercent}%` }}
        />
      </span>
      <span className="w-8 shrink-0 text-right text-[11px] text-foreground-muted tabular-nums">
        {donePercent}%
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
};

/**
 * "Điểm" (PD-070): the points, two decimals; an expected value (not recorded yet) muted with a dotted underline; "—"
 * otherwise. The reason is the tooltip and what screen readers hear.
 */
export const PointsValue = ({ cell, className }: { cell: PointsCell; className?: string }) =>
  cell.kind === "value" ? (
    <span
      title={cell.title}
      className={cn(
        "tabular-nums",
        cell.expected &&
          "text-foreground-muted underline decoration-foreground-subtle decoration-dotted underline-offset-[3px]",
        className
      )}
    >
      {formatCredit(cell.credits)}
      <span className="sr-only">
        {" "}
        điểm{cell.expected ? " dự kiến" : ""} — {cell.title}
      </span>
    </span>
  ) : (
    <span title={cell.title ?? undefined} className={cn("text-foreground-subtle", className)}>
      —{cell.title ? <span className="sr-only"> {cell.title}</span> : null}
    </span>
  );

/**
 * Phone cards (PD-070): "12,50 điểm", or "≈ 12,00 điểm dự kiến" (muted) — nothing when there is no number (the quantity /
 * shift beside it already tell why).
 */
export const PointsText = ({ cell, className }: { cell: PointsCell; className?: string }) =>
  cell.kind === "value" ? (
    <span
      title={cell.title}
      className={cn(
        "tabular-nums whitespace-nowrap",
        cell.expected ? "text-foreground-muted" : "text-foreground",
        className
      )}
    >
      {cell.expected ? "≈ " : null}
      <b className="font-semibold">{formatCredit(cell.credits)}</b> điểm
      {cell.expected ? " dự kiến" : null}
    </span>
  ) : null;

/** "Người tạo": avatar + name, "—" when unknown (imported jobs). */
export const CreatorCell = ({ creator }: { creator: JobSummary["createdBy"] }) =>
  creator ? (
    <span className="flex min-w-0 items-center gap-1.5" title={creator.displayName}>
      <UserAvatar user={creator} size="xs" />
      <span className="truncate">{creator.displayName}</span>
    </span>
  ) : (
    <span className="text-foreground-subtle">—</span>
  );

/** QC people of a job (its tasks'): small avatars, names in the tooltip; "—" when none. */
export const QcStack = ({ people }: { people: JobSummary["people"]["qc"] }) => {
  if (people.length === 0) return <span className="text-foreground-subtle">—</span>;
  const names = people.map((user) => user.displayName).join(", ");
  const shown = people.slice(0, 3);
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={`QC: ${names}`}>
      <span className="flex shrink-0 items-center -space-x-0.5">
        {shown.map((user) => (
          <UserAvatar key={user.id} user={user} size="xs" className="ring-2 ring-surface" />
        ))}
      </span>
      {people.length === 1 ? (
        <span className="truncate">{people[0]?.displayName}</span>
      ) : people.length > 3 ? (
        <span className="text-[11px] text-foreground-muted">+{people.length - 3}</span>
      ) : null}
      <span className="sr-only">QC: {names}</span>
    </span>
  );
};

/**
 * PD-048 "Tổng tấm" per process in one table line (PD-067): the largest process as a chip (its name ends in "…" when
 * the column is narrow), then "+N" with the rest in its tooltip; the whole list for screen readers.
 */
export const ProcessTotalsInline = ({ totals }: { totals: readonly ProcessTotal[] }) => {
  const { shown, hidden, hiddenText, text } = processTotalChips(totals, 1);
  const first = shown[0];
  if (!first) return <span className="text-foreground-subtle">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-1" title={text}>
      <span className="sr-only">Tổng tấm theo công đoạn: {text}</span>
      <span
        aria-hidden="true"
        className="inline-flex h-5 min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 text-[11px] whitespace-nowrap text-foreground-muted"
      >
        <span className="min-w-0 truncate">{first.process.name}</span>
        <span className="shrink-0 font-semibold text-foreground tabular-nums">
          {formatInteger(first.qty)}
        </span>
      </span>
      {hidden > 0 ? (
        <span
          aria-hidden="true"
          title={hiddenText}
          className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 text-[11px] font-medium text-foreground-muted"
        >
          +{hidden}
        </span>
      ) : null}
    </span>
  );
};
