import { cn } from "cn";

/**
 * Chart colors. Categorical series use a fixed 8-slot order validated for colour-vision deficiency
 * (adjacent pairs) on both surfaces — the dark column is the same hues stepped for the dark surface,
 * not an automatic flip. Assigned in slot order, never cycled: a 9th group folds into "Khác". A single
 * series uses the brand colour. Values and labels stay in text tokens; colour only marks identity.
 *
 * Exposed as CSS variables on a wrapper (`vizPalette`) so light/dark switch with the theme attribute.
 */
export const vizPalette = cn(
  "[--viz-1:#2a78d6] [--viz-2:#eb6834] [--viz-3:#1baf7a] [--viz-4:#eda100]",
  "[--viz-5:#e87ba4] [--viz-6:#008300] [--viz-7:#4a3aa7] [--viz-8:#e34948]",
  "dark:[--viz-1:#3987e5] dark:[--viz-2:#d95926] dark:[--viz-3:#199e70] dark:[--viz-4:#c98500]",
  "dark:[--viz-5:#d55181] dark:[--viz-6:#008300] dark:[--viz-7:#9085e9] dark:[--viz-8:#e66767]",
  "[--viz-other:#a3a29b] dark:[--viz-other:#6f6e69]"
);

export const seriesColor = (index: number, options: { single?: boolean; other?: boolean } = {}) => {
  if (options.other) return "var(--viz-other)";
  if (options.single) return "var(--brand)";
  return `var(--viz-${(index % 8) + 1})`;
};

/** Status colours (reserved: never a series colour), always shown with a label. */
export const statusColor = {
  good: "var(--success)",
  warning: "var(--warning)",
  critical: "var(--danger)",
  neutral: "var(--foreground-subtle)"
} as const;
