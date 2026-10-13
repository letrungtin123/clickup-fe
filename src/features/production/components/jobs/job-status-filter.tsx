import { cn } from "cn";
import { Check, ChevronDownIcon, CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { JobStatus } from "@/contracts/production-catalog";
import { toneClass } from "@/lib/colors";

import { useJobStatuses } from "../../hooks";
import { jobStatusFilterGroups, sameIdSet, toggleJobStatusId } from "../../jobs-model";
import { touchTargets } from "../../ui";
import { JobStatusChip } from "./job-bits";

type QuickPick = { key: string; label: string; ids: readonly string[] };

/**
 * "Tất cả" (no filter), "Đang mở" (every open status) and "Đã đóng" (every closed one). The last two only when the
 * catalog has both kinds — otherwise they would mean the same as "Tất cả".
 */
const quickPicks = (groups: {
  openIds: readonly string[];
  closedIds: readonly string[];
}): QuickPick[] => [
  { key: "all", label: "Tất cả", ids: [] },
  ...(groups.openIds.length > 0 && groups.closedIds.length > 0
    ? [
        { key: "open", label: "Đang mở", ids: groups.openIds },
        { key: "closed", label: "Đã đóng", ids: groups.closedIds }
      ]
    : [])
];

/** What the trigger says: "Trạng thái", the one chosen name, "Đang mở" / "Đã đóng", or "N trạng thái". */
const summaryOf = (value: readonly string[], catalog: readonly JobStatus[], picks: QuickPick[]) => {
  if (value.length === 0) return null;
  if (value.length === 1) {
    const status = catalog.find((item) => item.id === value[0]);
    if (status) return status.name;
  }
  const pick = picks.find((item) => item.ids.length > 0 && sameIdSet(value, item.ids));
  return pick ? pick.label : `${value.length} trạng thái`;
};

/**
 * Job list filter "Trạng thái" (PD-038): any of the manual job statuses. Tablet / desktop: a compact trigger like the
 * other filter selects with a checklist (open statuses first, closed ones last) and quick picks. Phone filter sheet
 * (`stacked`): the statuses as wrapping toggle chips, each at least 40px tall.
 */
export const JobStatusFilter = ({
  value,
  onChange,
  stacked = false,
  className
}: {
  value: readonly string[];
  onChange: (ids: string[]) => void;
  stacked?: boolean;
  className?: string;
}) => {
  const statuses = useJobStatuses();
  const catalog = statuses.data?.items ?? [];
  const groups = jobStatusFilterGroups(catalog);
  const picks = quickPicks(groups);
  const toggle = (id: string) => onChange(toggleJobStatusId(value, id, catalog));

  // A failed background refresh keeps the catalog already loaded.
  const body = statuses.data ? (
    catalog.length === 0 ? (
      <p className="text-xs text-foreground-muted">Chưa có trạng thái job.</p>
    ) : null
  ) : statuses.isError ? (
    <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
      Không tải được danh sách trạng thái.
      <Button variant="outline" size="sm" onClick={() => void statuses.refetch()}>
        Thử lại
      </Button>
    </div>
  ) : (
    <div className="flex justify-center py-3" aria-busy="true">
      <Spinner className="text-foreground-muted" />
    </div>
  );

  const pickRow = (
    <div role="group" aria-label="Chọn nhanh" className="flex flex-wrap gap-1.5">
      {picks.map((pick) => {
        const pressed = sameIdSet(value, pick.ids);
        return (
          <button
            key={pick.key}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange([...pick.ids])}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
              stacked ? "min-h-10 px-3.5 text-[13px]" : "h-7 pointer-coarse:h-10",
              pressed
                ? "border-transparent bg-brand-soft text-brand-text"
                : "bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground"
            )}
          >
            {pressed ? <Check className="size-3 shrink-0" aria-hidden="true" /> : null}
            {pick.label}
          </button>
        );
      })}
    </div>
  );

  if (stacked) {
    return (
      <div className={cn("flex min-w-0 flex-col gap-2", className)}>
        {body ?? (
          <>
            {pickRow}
            <div role="group" aria-label="Trạng thái job" className="flex flex-wrap gap-1.5">
              {[...groups.open, ...groups.closed].map((status) => (
                <StatusToggle
                  key={status.id}
                  status={status}
                  pressed={value.includes(status.id)}
                  onClick={() => toggle(status.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const summary = summaryOf(value, catalog, picks);
  const chosen = catalog.filter((status) => value.includes(status.id)).slice(0, 3);
  return (
    <Popover>
      <PopoverTrigger
        data-slot="select-trigger"
        data-size="default"
        aria-label={`Lọc theo trạng thái job: ${summary ?? "tất cả"}`}
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10 dark:bg-input/30 dark:hover:bg-input/50",
          className
        )}
      >
        {summary ? (
          <span className="flex min-w-0 items-center gap-2" title={summary}>
            {chosen.length > 0 ? (
              <span aria-hidden="true" className="flex shrink-0 gap-0.5">
                {chosen.map((status) => (
                  <span
                    key={status.id}
                    className={cn(toneClass(status.color), "size-2 rounded-full bg-(--tone)")}
                  />
                ))}
              </span>
            ) : null}
            <span className="truncate">{summary}</span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">Trạng thái</span>
        )}
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "max-h-[min(26rem,var(--available-height))] w-64 max-w-[calc(100vw-2rem)] gap-2 overflow-y-auto p-2",
          touchTargets
        )}
      >
        {body ?? (
          <>
            {pickRow}
            <StatusChecklist
              label={groups.closed.length > 0 ? "Đang mở" : null}
              statuses={groups.open}
              value={value}
              onToggle={toggle}
            />
            <StatusChecklist
              label={groups.open.length > 0 ? "Đã đóng" : null}
              statuses={groups.closed}
              value={value}
              onToggle={toggle}
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

/** Popover rows: a checkbox and the status chip; the whole row toggles. */
const StatusChecklist = ({
  label,
  statuses,
  value,
  onToggle
}: {
  /** Group heading; null = no heading (the catalog has only one kind). */
  label: string | null;
  statuses: readonly JobStatus[];
  value: readonly string[];
  onToggle: (id: string) => void;
}) =>
  statuses.length === 0 ? null : (
    <div role="group" aria-label={label ?? "Trạng thái job"} className="flex flex-col">
      {label ? (
        <span
          aria-hidden="true"
          className="px-1.5 pt-1 pb-0.5 text-[11px] font-medium tracking-[0.04em] text-foreground-subtle uppercase"
        >
          {label}
        </span>
      ) : null}
      {statuses.map((status) => (
        <label
          key={status.id}
          className="flex min-h-8 min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-1.5 hover:bg-surface-hover pointer-coarse:min-h-10"
        >
          <Checkbox
            checked={value.includes(status.id)}
            onCheckedChange={() => onToggle(status.id)}
          />
          <JobStatusChip status={status} />
        </label>
      ))}
    </div>
  );

/** Phone toggle chip: outlined until chosen, then filled with the status colour and a check. */
const StatusToggle = ({
  status,
  pressed,
  onClick
}: {
  status: JobStatus;
  pressed: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    title={status.isClosed ? `${status.name} (đã đóng)` : status.name}
    className={cn(
      toneClass(status.color),
      "inline-flex min-h-10 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
      pressed
        ? "border-(--tone) bg-(--tone-soft) text-(--tone-text)"
        : "bg-surface text-foreground hover:border-border-strong"
    )}
  >
    {status.isClosed ? (
      <CircleCheck aria-hidden="true" className="size-3.5 shrink-0 text-(--tone)" />
    ) : (
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-(--tone)" />
    )}
    <span className="min-w-0 truncate">{status.name}</span>
    {pressed ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
  </button>
);
