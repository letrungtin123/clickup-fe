import { cn } from "cn";
import { CalendarRange } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { JobListScope } from "@/contracts/production-jobs";
import { overviewDaySpan, overviewMaxDays } from "@/contracts/production-overview";
import { Calendar } from "@/features/tasks/components/calendar";

import { dateToDay, dayToDate, formatInteger } from "../../format";
import { formatDayRange } from "../../scores/periods";
import { touchTargets } from "../../ui";
import {
  activeOverviewPreset,
  formatRange,
  overviewPresets,
  overviewRangeOf,
  presetToTime,
  type OverviewTime
} from "../model";

/** Range days: the ends filled, the days between tinted (as the "Từ ngày – Đến ngày" filter of PD-068). */
const rangeClassNames = {
  selected: "",
  range_start:
    "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
  range_end:
    "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
  range_middle:
    "bg-brand-soft [&>button]:rounded-none [&>button]:text-brand-text [&>button]:hover:bg-brand-soft"
};

/** One segment of a segmented control (PD-082: shares the width on phones). */
const segmentClass = (active: boolean) =>
  cn(
    "inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-9 max-sm:min-w-0 max-sm:flex-1 max-sm:px-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0",
    active
      ? "bg-surface text-foreground shadow-xs ring-1 ring-border"
      : "text-foreground-muted hover:bg-surface/60 hover:text-foreground"
  );

export const Segmented = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <div
    role="group"
    aria-label={label}
    className={cn("inline-flex max-w-full items-center gap-0.5 rounded-lg border bg-muted/60 p-0.5", className)}
  >
    {children}
  </div>
);

/**
 * PD-080 time filter of "Tổng quan" (top right): Hôm nay · Tuần này (Mon–Sun) · Tháng này · Tùy chọn (a Từ ngày – Đến
 * ngày calendar applied with "Áp dụng", at most `overviewMaxDays` days). Default Hôm nay.
 */
export const OverviewTimeControl = ({
  time,
  today,
  onChange
}: {
  time: OverviewTime;
  today: string;
  onChange: (next: OverviewTime) => void;
}) => {
  const preset = activeOverviewPreset(time, today);
  const range = overviewRangeOf(time, today);
  return (
    <Segmented label="Thời gian" className="max-sm:flex max-sm:w-full">
      {overviewPresets(today).map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={preset === item.key}
          className={segmentClass(preset === item.key)}
          onClick={() => onChange(presetToTime(item))}
        >
          {item.label}
        </button>
      ))}
      <CustomRangeButton
        active={preset === null}
        label={preset === null ? formatRange(range, today) : null}
        range={range}
        today={today}
        onApply={(next) => onChange({ kind: "range", ...next })}
      />
    </Segmented>
  );
};

/** "Tùy chọn": a range calendar; applied with "Áp dụng" (one end picked = that single day; longer than the limit: refused). */
const CustomRangeButton = ({
  active,
  label,
  range,
  today,
  onApply
}: {
  active: boolean;
  label: string | null;
  range: { from: string; to: string };
  today: string;
  onApply: (next: { from: string; to: string }) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ from: string | null; to: string | null }>({ from: range.from, to: range.to });
  const from = dayToDate(draft.from) ?? undefined;
  const to = dayToDate(draft.to) ?? undefined;
  const tooLong = draft.from !== null && draft.to !== null && overviewDaySpan(draft.from, draft.to) > overviewMaxDays;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft({ from: range.from, to: range.to });
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-pressed={active}
            aria-label={label ? `Khoảng ngày tùy chọn: ${label}` : "Tùy chọn khoảng ngày"}
            className={cn(segmentClass(active), "tabular-nums")}
          />
        }
      >
        <CalendarRange aria-hidden="true" />
        {label ?? "Tùy chọn"}
      </PopoverTrigger>
      <PopoverContent align="end" className={cn("flex w-auto max-w-[calc(100vw-1.5rem)] flex-col gap-3 p-3", touchTargets)}>
        <p className="text-xs font-medium text-foreground-muted">
          Từ ngày – Đến ngày (tối đa {overviewMaxDays} ngày)
        </p>
        <Calendar
          mode="range"
          selected={from ? { from, to } : undefined}
          defaultMonth={from ?? dayToDate(today) ?? new Date()}
          onSelect={(next) =>
            setDraft({
              from: next?.from ? dateToDay(next.from) : null,
              to: next?.to ? dateToDay(next.to) : next?.from ? dateToDay(next.from) : null
            })
          }
          classNames={rangeClassNames}
          className="self-center"
        />
        <p className={cn("text-xs tabular-nums", tooLong ? "text-danger" : "text-foreground-muted")} aria-live="polite">
          {tooLong
            ? `Chọn tối đa ${overviewMaxDays} ngày.`
            : draft.from && draft.to
              ? formatDayRange(draft.from, draft.to)
              : "Chọn ngày bắt đầu và ngày kết thúc."}
        </p>
        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!draft.from || tooLong}
            onClick={() => {
              if (!draft.from) return;
              onApply({ from: draft.from, to: draft.to ?? draft.from });
              setOpen(false);
            }}
          >
            Áp dụng
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** "Project của tôi N · Tất cả M" (holders of LEADER / ADMIN). */
export const ScopeSwitch = ({
  scope,
  counts,
  onChange
}: {
  scope: JobListScope;
  counts: { mine: number; all: number } | null;
  onChange: (next: JobListScope) => void;
}) => (
  <Segmented label="Phạm vi" className="max-sm:flex max-sm:w-full">
    {(
      [
        ["mine", "Project của tôi"],
        ["all", "Tất cả"]
      ] as const
    ).map(([key, label]) => (
      <button key={key} type="button" aria-pressed={scope === key} className={segmentClass(scope === key)} onClick={() => onChange(key)}>
        {label}
        {counts ? (
          <span
            className={cn(
              "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
              scope === key ? "bg-brand-soft text-brand-text" : "bg-muted text-foreground-muted"
            )}
          >
            {formatInteger(counts[key])}
          </span>
        ) : null}
      </button>
    ))}
  </Segmented>
);

export { CustomRangeButton };
