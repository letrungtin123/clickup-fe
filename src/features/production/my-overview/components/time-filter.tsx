import { cn } from "cn";
import { CalendarRange } from "lucide-react";
import { useState } from "react";
import type { DateRange as DayRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { myOverviewMaxDays } from "@/contracts/production-my-overview";
import { Calendar } from "@/features/tasks/components/calendar";

import { dateToDay, dayToDate } from "../../format";
import { touchTargets } from "../../ui";
import { myOverviewCopy as copy } from "../copy";
import {
  myOverviewRangeOf,
  shortDay,
  type MyOverviewRangeKey,
  type MyOverviewTime
} from "../model";

const presets: readonly Exclude<MyOverviewRangeKey, "custom">[] = ["today", "week", "month"];

const rangeClassNames = {
  selected: "",
  range_start:
    "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
  range_end:
    "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
  range_middle:
    "bg-brand-soft [&>button]:rounded-none [&>button]:text-brand-text [&>button]:hover:bg-brand-soft"
};

const segment = (active: boolean) =>
  cn(
    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] sm:shrink-0 sm:px-3 font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-9 [&_svg]:size-3.5",
    active
      ? "bg-surface text-foreground shadow-sm ring-1 ring-border/70 dark:bg-input dark:ring-0"
      : "text-foreground-muted hover:text-foreground"
  );

/**
 * Hôm nay · Tuần này · Tháng này · Tùy chọn (a calendar range applied with "Áp dụng", at most 92 days). Days are
 * organization-calendar days; the choice lives in the URL.
 */
export const MyOverviewTimeFilter = ({
  time,
  today,
  onChange,
  className
}: {
  time: MyOverviewTime;
  today: string;
  onChange: (next: MyOverviewTime) => void;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const current = myOverviewRangeOf(time, today);
  const [draft, setDraft] = useState<DayRange | undefined>(undefined);
  const openCustom = (next: boolean) => {
    setOpen(next);
    if (next)
      setDraft({
        from: dayToDate(current.from) ?? undefined,
        to: dayToDate(current.to) ?? undefined
      });
  };
  const draftFrom = draft?.from ? dateToDay(draft.from) : null;
  const draftTo = draft?.to ? dateToDay(draft.to) : draftFrom;
  const customLabel =
    time.key === "custom"
      ? current.from === current.to
        ? shortDay(current.from, today)
        : `${shortDay(current.from, today)} – ${shortDay(current.to, today)}`
      : copy.ranges.custom;
  return (
    <div
      role="group"
      aria-label={copy.rangeGroup}
      className={cn(
        "grid w-full min-w-0 grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.5 sm:inline-flex sm:w-auto",
        className
      )}
    >
      {presets.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={time.key === key}
          className={segment(time.key === key)}
          onClick={() => onChange({ key, from: null, to: null })}
        >
          {copy.ranges[key]}
        </button>
      ))}
      <Popover open={open} onOpenChange={openCustom}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-pressed={time.key === "custom"}
              className={cn(segment(time.key === "custom"), "tabular-nums")}
            />
          }
        >
          <CalendarRange aria-hidden="true" className="max-sm:hidden" />
          <span className="truncate">{customLabel}</span>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className={cn("flex w-auto max-w-[calc(100vw-1.5rem)] flex-col gap-3 p-3", touchTargets)}
        >
          <p className="text-[13px] font-semibold">{copy.customTitle}</p>
          <Calendar
            mode="range"
            selected={draft}
            defaultMonth={draft?.from ?? dayToDate(today) ?? new Date()}
            onSelect={setDraft}
            classNames={rangeClassNames}
            className="self-center"
          />
          <p className="max-w-64 text-xs text-foreground-muted">
            {copy.customHint(myOverviewMaxDays)}
          </p>
          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {copy.customCancel}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!draftFrom}
              onClick={() => {
                if (!draftFrom) return;
                onChange({ key: "custom", from: draftFrom, to: draftTo ?? draftFrom });
                setOpen(false);
              }}
            >
              {copy.customApply}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
