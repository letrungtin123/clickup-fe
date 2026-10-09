import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { vi } from "react-day-picker/locale";

/** react-day-picker styled with the product tokens (Vietnamese, weeks start Monday). */
export const Calendar = ({ className, classNames, ...props }: DayPickerProps) => (
  <DayPicker
    locale={vi}
    weekStartsOn={1}
    showOutsideDays
    fixedWeeks
    className={cn("w-fit select-none", className)}
    classNames={{
      months: "relative flex flex-col",
      month: "flex flex-col gap-2",
      nav: "absolute inset-x-0 top-0 flex h-7 items-center justify-between",
      button_previous:
        "inline-flex size-7 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
      button_next:
        "inline-flex size-7 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
      month_caption: "flex h-7 items-center justify-center",
      caption_label: "text-[13px] font-semibold first-letter:uppercase",
      month_grid: "border-collapse",
      weekdays: "flex",
      weekday: "w-8 text-center text-[11px] font-medium text-foreground-subtle uppercase",
      week: "mt-0.5 flex",
      day: "relative size-8 p-0 text-center text-[13px]",
      day_button:
        "inline-flex size-8 items-center justify-center rounded-md outline-none transition-colors duration-100 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
      selected:
        "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
      today: "[&>button]:font-semibold [&>button]:text-brand-text [&>button]:ring-1 [&>button]:ring-brand/40",
      outside: "text-foreground-subtle/70",
      disabled: "text-foreground-subtle/40 line-through",
      hidden: "invisible",
      ...classNames
    }}
    components={{
      Chevron: ({ orientation }) =>
        orientation === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />
    }}
    {...props}
  />
);
