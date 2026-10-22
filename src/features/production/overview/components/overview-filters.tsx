import { cn } from "cn";
import { CalendarCog, CalendarRange } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { KpiCloseDays } from "@/contracts/production-scores";
import { Calendar } from "@/features/tasks/components/calendar";

import { dateToDay, dayToDate } from "../../format";
import { rangePresets } from "../../my-task-filters";
import { PeriodPicker } from "../../scores/components/kit";
import { formatDayRange } from "../../scores/periods";
import { touchTargets } from "../../ui";
import {
  activePreset,
  currentKpiPeriod,
  formatOverviewRange,
  overviewRangeOf,
  presetTime,
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

const chipClass = (active: boolean) =>
  cn(
    "rounded-full px-3 font-normal",
    active && "border-brand/50 bg-brand-soft font-medium text-brand-text hover:bg-brand-soft"
  );

/**
 * PD-076 time filter of "Tổng quan": quick presets (Hôm nay · Tuần này Mon–Sun · Tháng này · Tháng trước, the PD-068
 * presets), "Kỳ KPI" (the current period, then the scores' period picker: periods follow the settings' close days,
 * PD-074) and "Tùy chọn" (a Từ ngày – Đến ngày calendar, applied with "Áp dụng"). Organization-calendar days of Ngày nhận.
 */
export const OverviewTimeFilter = ({
  time,
  today,
  closeDays,
  onChange,
  className
}: {
  time: OverviewTime;
  today: string;
  closeDays: KpiCloseDays;
  onChange: (next: OverviewTime) => void;
  className?: string;
}) => {
  const preset = activePreset(time, today);
  const custom = time.kind === "range" && preset === null;
  const range = overviewRangeOf(time, today, closeDays);
  const latestPeriod = currentKpiPeriod(today, closeDays);
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="Thời gian">
        {rangePresets(today).map((item) => (
          <Button
            key={item.key}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={preset === item.key}
            onClick={() => onChange(presetTime(item))}
            className={chipClass(preset === item.key)}
          >
            {item.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={time.kind === "period"}
          onClick={() => {
            if (time.kind !== "period") onChange({ kind: "period", period: latestPeriod });
          }}
          className={chipClass(time.kind === "period")}
        >
          <CalendarCog aria-hidden="true" />
          Kỳ KPI
        </Button>
        <CustomRangeButton
          active={custom}
          label={custom ? formatOverviewRange(range, today) : null}
          range={range}
          today={today}
          onApply={(next) => onChange({ kind: "range", ...next })}
        />
      </div>
      {time.kind === "period" ? (
        <PeriodPicker
          value={time.period}
          latest={latestPeriod}
          closeDays={closeDays}
          onChange={(period) => onChange({ kind: "period", period })}
        />
      ) : null}
    </div>
  );
};

/** "Tùy chọn": a range calendar; the range applies with "Áp dụng" (one end picked = that single day). */
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
  const [draft, setDraft] = useState<{ from: string | null; to: string | null }>({
    from: range.from,
    to: range.to
  });
  const from = dayToDate(draft.from) ?? undefined;
  const to = dayToDate(draft.to) ?? undefined;
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={active}
            aria-label={label ? `Khoảng ngày tùy chọn: ${label}` : "Chọn khoảng ngày"}
            className={cn(chipClass(active), "tabular-nums")}
          />
        }
      >
        <CalendarRange aria-hidden="true" />
        {label ?? "Tùy chọn"}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("flex w-auto max-w-[calc(100vw-1.5rem)] flex-col gap-3 p-3", touchTargets)}
      >
        <p className="text-xs font-medium text-foreground-muted">Từ ngày – Đến ngày (Ngày nhận)</p>
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
        <p className="text-xs text-foreground-muted tabular-nums" aria-live="polite">
          {draft.from && draft.to
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
            disabled={!draft.from}
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
