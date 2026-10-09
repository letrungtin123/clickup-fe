import { cn } from "cn";
import { CalendarDays, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/features/tasks/components/calendar";

import { dateToDay, dayToDate, formatDay } from "../format";

type DateFieldProps = {
  /** YYYY-MM-DD or null. */
  value: string | null;
  onChange: (day: string | null) => void;
  /** Shown when empty. */
  placeholder?: string;
  /** Adds a "clear" affordance (only for optional dates). */
  clearable?: boolean;
  /** Quick pick for "today" in the organization calendar (YYYY-MM-DD). */
  today?: string | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string;
  size?: "sm" | "default";
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean | undefined;
};

/** Calendar-day picker (business days, no time) used by credit rules and DATE custom fields. */
export const DateField = ({
  value,
  onChange,
  placeholder = "Chọn ngày",
  clearable = false,
  today,
  disabled,
  id,
  className,
  size = "default",
  ...aria
}: DateFieldProps) => {
  const [open, setOpen] = useState(false);
  const selected = dayToDate(value) ?? undefined;
  const pick = (day: string | null) => {
    onChange(day);
    setOpen(false);
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              size={size}
              disabled={disabled}
              className={cn(
                "min-w-0 flex-1 justify-start font-normal tabular-nums",
                !value && "text-muted-foreground"
              )}
              {...aria}
            />
          }
        >
          <CalendarDays aria-hidden="true" />
          <span className="truncate">{value ? formatDay(value) : placeholder}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? dayToDate(today) ?? new Date()}
            onSelect={(date) => pick(date ? dateToDay(date) : null)}
            autoFocus
          />
          {today && value !== today ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => pick(today)}
            >
              Hôm nay
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
      {clearable && value && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Xóa ngày"
          onClick={() => onChange(null)}
          className="text-foreground-subtle"
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
};
