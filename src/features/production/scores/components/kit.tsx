import { cn } from "cn";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

import { useTeams } from "../../hooks";
import { touchTargets } from "../../ui";
import {
  formatDayRange,
  periodLabel,
  periodRange,
  periodsBetween,
  shiftPeriod
} from "../periods";

const ease = [0.22, 1, 0.36, 1] as const;

/** Scrollable page body with the module's fade-in; phones get ≥ 40px touch targets. */
export const PageBody = ({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className="min-h-0 flex-1 overflow-y-auto">
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease }}
      className={cn(
        "mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-4 md:px-6 md:py-6",
        touchTargets,
        className
      )}
    >
      {children}
    </motion.div>
  </div>
);

/** Card frame used by every block on the score screens. */
export const Panel = ({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  labelledBy
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  labelledBy?: string;
}) => (
  <section
    aria-labelledby={labelledBy}
    className={cn("min-w-0 rounded-xl border bg-surface shadow-xs", className)}
  >
    {title || actions ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {title ? (
            <h2 id={labelledBy} className="text-sm font-semibold">
              {title}
            </h2>
          ) : null}
          {description ? <p className="text-xs text-foreground-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={bodyClassName}>{children}</div>
  </section>
);

/** One headline figure with its label and a quiet secondary line. */
export const StatCard = ({
  label,
  icon: Icon,
  value,
  unit,
  children,
  className,
  accent = false
}: {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  unit?: string;
  children?: ReactNode;
  className?: string;
  accent?: boolean;
}) => (
  <div
    className={cn(
      "flex min-w-0 flex-col gap-2 rounded-xl border bg-surface p-3.5 shadow-xs sm:p-4",
      accent && "border-brand/30 bg-[color-mix(in_oklch,var(--brand-soft),var(--surface)_40%)]",
      className
    )}
  >
    <p className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </p>
    <p className="flex min-w-0 items-baseline gap-1">
      <span className="truncate text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{value}</span>
      {unit ? <span className="shrink-0 text-xs text-foreground-muted">{unit}</span> : null}
    </p>
    {children ? (
      <div className="flex min-w-0 flex-col gap-0.5 text-xs text-foreground-muted">{children}</div>
    ) : null}
  </div>
);

/**
 * KPI period picker: previous / next arrows around a select of recent periods, with the period's
 * day range. Periods after `latest` (the current one) cannot be chosen.
 */
export const PeriodPicker = ({
  value,
  onChange,
  latest,
  closeDay,
  count = 24,
  className
}: {
  value: string;
  onChange: (period: string) => void;
  latest: string;
  closeDay: number;
  count?: number;
  className?: string;
}) => {
  const recent = periodsBetween(shiftPeriod(latest, -(count - 1)), latest).reverse();
  const periods = recent.includes(value) ? recent : [value, ...recent];
  const items = periods.map((period) => ({ value: period, label: periodLabel(period) }));
  const range = periodRange(value, closeDay);
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <div className="flex min-w-0 items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Kỳ trước"
          onClick={() => onChange(shiftPeriod(value, -1))}
        >
          <ChevronLeft />
        </Button>
        <Select
          items={items}
          value={value}
          onValueChange={(next: string | null) => {
            if (next) onChange(next);
          }}
        >
          <SelectTrigger aria-label="Chọn kỳ KPI" className="w-36 font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          aria-label="Kỳ sau"
          disabled={value >= latest}
          onClick={() => onChange(shiftPeriod(value, 1))}
        >
          <ChevronRight />
        </Button>
        {value !== latest ? (
          <Button variant="ghost" size="sm" onClick={() => onChange(latest)}>
            Kỳ hiện tại
          </Button>
        ) : null}
      </div>
      <span className="text-xs text-foreground-muted tabular-nums">
        {formatDayRange(range.from, range.to)}
      </span>
    </div>
  );
};

export const ALL_TEAMS = "all";

/** Team filter fed by GET /production/teams (readable by every production member). */
export const TeamSelect = ({
  value,
  onChange,
  className
}: {
  value: string | null;
  onChange: (teamId: string | null) => void;
  className?: string;
}) => {
  const teams = useTeams();
  const items = [
    { value: ALL_TEAMS, label: "Tất cả team" },
    ...(teams.data?.items ?? [])
      .filter((team) => team.active || team.id === value)
      .map((team) => ({ value: team.id, label: team.name }))
  ];
  return (
    <Select
      items={items}
      value={value ?? ALL_TEAMS}
      onValueChange={(next: string | null) => onChange(!next || next === ALL_TEAMS ? null : next)}
    >
      <SelectTrigger aria-label="Lọc theo team" className={cn("w-full sm:w-44", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/** Thin progress bar; the fill colour follows the tone family. */
export const ProgressBar = ({
  value,
  tone,
  label,
  className
}: {
  value: number;
  tone: "success" | "warning" | "danger" | "muted" | "brand";
  label: string;
  className?: string;
}) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value)}
    className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
  >
    <motion.div
      className={cn(
        "h-full rounded-full",
        tone === "success" && "bg-success",
        tone === "warning" && "bg-warning",
        tone === "danger" && "bg-danger",
        tone === "muted" && "bg-foreground-subtle",
        tone === "brand" && "bg-brand"
      )}
      initial={{ width: 0 }}
      animate={{ width: `${value}%` }}
      transition={{ duration: 0.5, ease }}
    />
  </div>
);
