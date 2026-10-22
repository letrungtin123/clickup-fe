import { cn } from "cn";

import { formatInteger } from "../../format";
import { myOverviewCopy as copy } from "../copy";
import type { MyOverviewFilter, NeedItem, TagCard } from "../model";

const toneDot: Record<TagCard["tone"], string> = {
  brand: "bg-brand",
  warning: "bg-warning",
  info: "bg-[oklch(0.62_0.13_250)]",
  success: "bg-success",
  danger: "bg-danger"
};

/**
 * The tags (fixed order; "Chờ tôi QC" only for QC holders): each a number and a filter — a click filters the list, the
 * chosen tag again goes back to "Việc của tôi". Phones: two per row.
 */
export const TagCards = ({
  cards,
  active,
  onPick
}: {
  cards: readonly TagCard[];
  active: MyOverviewFilter["tag"];
  onPick: (key: TagCard["key"]) => void;
}) => (
  <div
    role="group"
    aria-label={copy.tags.region}
    className={cn(
      "grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3",
      cards.length === 5 ? "md:grid-cols-5" : "md:grid-cols-4"
    )}
  >
    {cards.map((card) => {
      const chosen = active === card.key;
      return (
        <button
          key={card.key}
          type="button"
          aria-pressed={chosen}
          title={copy.tags.filterHint}
          onClick={() => onPick(card.key)}
          className={cn(
            "flex min-w-0 flex-col gap-1.5 rounded-xl border bg-surface p-3 text-left shadow-xs outline-none transition-[border-color,background-color,box-shadow] duration-150 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring sm:p-3.5",
            chosen &&
              "border-brand/60 bg-[color-mix(in_oklch,var(--brand-soft),var(--surface)_45%)] ring-1 ring-brand/30",
            // Five tags on a phone: "Việc của tôi" takes the first row.
            card.key === "mine" && cards.length === 5 && "col-span-2 md:col-span-1"
          )}
        >
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-foreground-muted">
              {card.label}
            </span>
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0 rounded-full", toneDot[card.tone])}
            />
          </span>
          <span className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "text-2xl leading-none font-semibold tracking-[-0.02em] tabular-nums sm:text-[28px]",
                card.strong && "text-danger"
              )}
            >
              {formatInteger(card.count)}
            </span>
            <span className="text-xs text-foreground-muted">{copy.tags.unit}</span>
          </span>
          <span className="truncate text-xs text-foreground-muted">{card.sub}</span>
        </button>
      );
    })}
  </div>
);

const needTone: Record<NeedItem["tone"], string> = {
  danger: "bg-danger-soft text-danger [&>i]:bg-danger",
  warning:
    "bg-warning-soft text-[color-mix(in_oklch,var(--warning),var(--foreground)_35%)] [&>i]:bg-warning",
  info: "bg-[oklch(0.62_0.13_250/0.14)] text-[oklch(0.5_0.12_250)] dark:text-[oklch(0.8_0.09_250)] [&>i]:bg-[oklch(0.62_0.13_250)]"
};

/** "Cần bạn xử lý": one pill per item with a count; each leads to its filter. Hidden when nothing needs the user. */
export const NeedsBar = ({
  items,
  onPick
}: {
  items: readonly NeedItem[];
  onPick: (filter: MyOverviewFilter) => void;
}) =>
  items.length === 0 ? null : (
    <section
      aria-label={copy.needs.region}
      className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-brand/35 bg-surface px-3 py-2.5 shadow-xs sm:px-4"
    >
      <h2 className="mr-1 text-[13px] font-semibold">{copy.needs.title}</h2>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onPick(item.filter)}
          className={cn(
            "inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-full px-3 text-[12.5px] font-medium outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-110",
            needTone[item.tone]
          )}
        >
          <i aria-hidden="true" className="size-2 shrink-0 rounded-full" />
          <span className="truncate">{item.text}</span>
        </button>
      ))}
    </section>
  );
