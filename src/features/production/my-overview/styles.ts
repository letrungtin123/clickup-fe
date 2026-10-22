import type { Hint } from "./model";

/** Text colour of a deadline / wait hint (PD-081): red late, orange soon / waiting too long, green done. */
export const hintTone: Record<Hint["tone"], string> = {
  danger: "text-danger",
  warning: "text-[color-mix(in_oklch,var(--warning),var(--foreground)_30%)]",
  success: "text-success",
  muted: "text-foreground-muted"
};

/**
 * A row's first line (task, deadline / wait, status, action): wraps on phones; from md up a grid so the columns line up
 * from row to row.
 */
export const rowGrid =
  "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 md:grid md:grid-cols-[minmax(0,1fr)_9.5rem_8.5rem_minmax(11rem,auto)]";
