import { cn } from "cn";
import { CalendarRange, X } from "lucide-react";
import { useState } from "react";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { MyTaskDateBasis } from "@/contracts/production-jobs";
import { Calendar } from "@/features/tasks/components/calendar";

import { dateToDay, dayToDate, formatDay } from "../format";
import {
  basisLabels,
  emptyDateRange,
  hasDateRange,
  matchingPreset,
  rangeLabel,
  rangePresets,
  type DateRange
} from "../my-task-filters";
import { touchTargets } from "../ui";

/** Range days: the ends filled, the days between tinted (overrides the single-day "selected" look). */
const rangeClassNames = {
  selected: "",
  range_start:
    "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
  range_end:
    "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
  range_middle:
    "bg-brand-soft [&>button]:rounded-none [&>button]:text-brand-text [&>button]:hover:bg-brand-soft"
};

/**
 * PD-068 "Từ ngày – Đến ngày" of a list: one compact trigger ("Thời gian", or "Nhận 01/10 – 19/10" once set, with a clear
 * button) opening a popover with the basis ("Theo Ngày nhận" / "Theo Ngày giao"), quick presets (Hôm nay, Tuần này,
 * Tháng này, Tháng trước) and a range calendar. Days are organization-calendar days, both ends included.
 */
export const DateRangeFilter = ({
  value,
  onChange,
  today,
  className
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  /** Today in the organization timezone (YYYY-MM-DD): presets and the calendar's start. */
  today: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const active = hasDateRange(value);
  const label = rangeLabel(value, today);
  const preset = matchingPreset(value, today);
  const from = dayToDate(value.from) ?? undefined;
  const to = dayToDate(value.to) ?? undefined;
  const summary = active
    ? `${basisLabels[value.by].long}: ${value.from ? formatDay(value.from) : "…"} → ${value.to ? formatDay(value.to) : "…"}`
    : "Chọn một khoảng ngày hoặc bấm nhanh bên trên.";
  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              aria-label={label ? `Lọc theo ngày: ${label}` : "Lọc theo khoảng ngày"}
              className={cn(
                "min-w-0 shrink justify-start font-normal",
                active && "border-brand/40 text-brand-text",
                active && "rounded-r-none"
              )}
            />
          }
        >
          <CalendarRange aria-hidden="true" />
          <span className="truncate tabular-nums">{label ?? "Thời gian"}</span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn("flex w-auto max-w-[calc(100vw-1.5rem)] flex-col gap-3 p-3", touchTargets)}
        >
          <SegmentedControl<MyTaskDateBasis>
            aria-label="Lọc theo"
            value={value.by}
            onChange={(by) => onChange({ ...value, by })}
            className="w-full"
            options={[
              { value: "received", label: basisLabels.received.long },
              { value: "deadline", label: basisLabels.deadline.long }
            ]}
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn nhanh">
            {rangePresets(today).map((item) => (
              <Button
                key={item.key}
                type="button"
                variant="outline"
                size="xs"
                aria-pressed={preset?.key === item.key}
                onClick={() => onChange({ ...value, from: item.from, to: item.to })}
                className={cn(
                  "rounded-full",
                  preset?.key === item.key && "border-brand/50 bg-brand-soft text-brand-text"
                )}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={from ? { from, to } : undefined}
            defaultMonth={from ?? dayToDate(today) ?? new Date()}
            onSelect={(range) =>
              onChange({
                ...value,
                from: range?.from ? dateToDay(range.from) : null,
                to: range?.to ? dateToDay(range.to) : range?.from ? dateToDay(range.from) : null
              })
            }
            classNames={rangeClassNames}
            className="self-center"
          />
          <p className="text-xs text-foreground-muted tabular-nums" aria-live="polite">
            {summary}
          </p>
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!active}
              onClick={() => onChange({ ...emptyDateRange, by: value.by })}
            >
              Xóa ngày
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Xong
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {active ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Bỏ lọc theo ngày"
          title="Bỏ lọc theo ngày"
          onClick={() => onChange({ ...emptyDateRange, by: value.by })}
          className="-ml-px shrink-0 rounded-l-none border-brand/40 text-brand-text"
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
};
