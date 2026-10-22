import { cn } from "cn";
import { AlarmClock, Check, ChevronDown, CircleCheckBig, CircleDashed, CirclePlay, Info, Layers, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";

import type { ProductionOverview } from "@/contracts/production-overview";

import { formatInteger } from "../../format";
import { hoursLabel, percentOf, type OverviewCardKey, type OverviewFilter } from "../model";

type CardDef = {
  key: OverviewCardKey;
  label: string;
  icon: LucideIcon;
  value: string;
  unit: string;
  extra?: { value: string; unit: string } | undefined;
  sub: string;
  /** Bar width 0–100. */
  share: number;
  strong?: boolean;
};

/** One colour per card — the same as the progress bars of the table (done green, in progress amber…). */
const cardTones: Record<OverviewCardKey, { badge: string; bar: string }> = {
  total: { badge: "bg-brand-soft text-brand-text", bar: "bg-brand" },
  unassigned: { badge: "bg-muted text-foreground-muted ring-1 ring-border ring-inset", bar: "bg-foreground-subtle" },
  inProgress: { badge: "bg-warning-soft text-warning", bar: "bg-warning" },
  done: { badge: "bg-success-soft text-success", bar: "bg-success" },
  overdue: { badge: "bg-danger-soft text-danger", bar: "bg-danger" }
};

/** Phones 1 + 2 + 2, small tablets 3 + 2, wider 5 in a row (container widths, so the sidebar does not matter). */
const cardSpans: Record<OverviewCardKey, string> = {
  total: "col-span-2 @lg:col-span-2 @4xl:col-span-1",
  unassigned: "col-span-1 @lg:col-span-2 @4xl:col-span-1",
  inProgress: "col-span-1 @lg:col-span-2 @4xl:col-span-1",
  done: "col-span-1 @lg:col-span-3 @4xl:col-span-1",
  overdue: "col-span-1 @lg:col-span-3 @4xl:col-span-1"
};

const cardDefs = (cards: ProductionOverview["cards"]): CardDef[] => {
  const total = cards.total.tasks;
  return [
    {
      key: "total",
      label: "Tổng task",
      icon: Layers,
      value: formatInteger(total),
      unit: "task",
      sub: `${formatInteger(cards.total.images)} tấm trong task · ${formatInteger(cards.total.jobs)} job`,
      share: total > 0 ? 100 : 0
    },
    {
      key: "unassigned",
      label: "Chưa chia",
      icon: CircleDashed,
      value: formatInteger(cards.unassigned.jobs),
      unit: "Job Code",
      sub: cards.unassigned.jobs > 0 ? `${formatInteger(cards.unassigned.images)} tấm chưa có task` : "Job Code nào cũng đã có task",
      share: percentOf(cards.unassigned.jobs, cards.total.jobs)
    },
    {
      key: "inProgress",
      label: "Đang làm",
      icon: CirclePlay,
      value: formatInteger(cards.inProgress.tasks),
      unit: "task",
      sub: `${formatInteger(cards.inProgress.images)} tấm · ${percentOf(cards.inProgress.tasks, total)}% tổng task`,
      share: percentOf(cards.inProgress.tasks, total)
    },
    {
      key: "done",
      label: "Xong",
      icon: CircleCheckBig,
      value: formatInteger(cards.done.tasks),
      unit: "task",
      sub: `${formatInteger(cards.done.images)} tấm · ${percentOf(cards.done.tasks, total)}% tổng task`,
      share: percentOf(cards.done.tasks, total)
    },
    {
      key: "overdue",
      label: "Trễ",
      icon: AlarmClock,
      value: formatInteger(cards.overdue.tasks),
      unit: "task",
      extra: { value: formatInteger(cards.overdue.clientJobs), unit: "job trễ khách" },
      sub: `${formatInteger(cards.overdue.images)} tấm quá hạn task`,
      share: percentOf(cards.overdue.tasks, total),
      strong: cards.overdue.tasks + cards.overdue.clientJobs > 0
    }
  ];
};

const figure = "text-[26px] leading-8 font-semibold tracking-[-0.02em] tabular-nums";

/**
 * PD-080 / PD-082 — the five cards (each one a filter of the table: click = filter, click again = back to Tổng), equal
 * heights with the figure, the sub-line and the bar on the same lines in every card; then "Cách tính" — the definitions,
 * folded away, so the whole team reads the numbers the same way.
 */
export const OverviewCardsRow = ({
  overview,
  filter,
  onPick
}: {
  overview: Pick<ProductionOverview, "cards" | "stageNames" | "clock">;
  filter: OverviewFilter;
  onPick: (card: OverviewCardKey) => void;
}) => (
  <section aria-label="Số liệu" className="@container flex min-w-0 flex-col gap-2">
    <div className="grid grid-cols-2 gap-2.5 @lg:grid-cols-6 @4xl:grid-cols-5 @4xl:gap-3">
      {cardDefs(overview.cards).map((card) => {
        const pressed = filter.card === card.key;
        // "Tổng task" pressed without a status picked is the unfiltered page: selected, but no "Đang lọc" mark.
        const filtering = pressed && (card.key !== "total" || filter.sub !== null);
        const tone = cardTones[card.key];
        const Icon = card.icon;
        return (
          <button
            key={card.key}
            type="button"
            aria-pressed={pressed}
            onClick={() => onPick(card.key)}
            className={cn(
              cardSpans[card.key],
              "group relative flex h-full min-w-0 flex-col rounded-xl border bg-surface p-3 text-left shadow-xs transition-[border-color,box-shadow,background-color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-3.5",
              pressed
                ? "border-brand bg-[color-mix(in_oklab,var(--surface),var(--brand)_5%)] shadow-sm ring-1 ring-brand"
                : "hover:border-border-strong hover:shadow-sm"
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", tone.badge)}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground-muted group-aria-pressed:text-foreground">
                {card.label}
              </span>
              {filtering ? (
                <span
                  title="Đang lọc bảng theo thẻ này — bấm lần nữa để bỏ lọc"
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground"
                >
                  <Check aria-hidden="true" className="size-3" strokeWidth={3} />
                  <span className="sr-only">Đang lọc</span>
                </span>
              ) : null}
            </span>
            <span className="mt-2.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5">
              <span className={cn(figure, card.strong ? "text-danger" : "text-foreground")}>{card.value}</span>
              <span className="text-xs text-foreground-muted">{card.unit}</span>
              {card.extra ? (
                <>
                  <span aria-hidden="true" className="px-0.5 text-xs text-foreground-subtle">
                    +
                  </span>
                  <span className={cn(figure, card.strong ? "text-danger" : "text-foreground")}>{card.extra.value}</span>
                  <span className="text-xs text-foreground-muted">{card.extra.unit}</span>
                </>
              ) : null}
            </span>
            <span className="mt-auto flex min-w-0 flex-col gap-2 pt-2">
              <span className="truncate text-xs text-foreground-muted tabular-nums" title={card.sub}>
                {card.sub}
              </span>
              <span aria-hidden="true" className="flex h-1 overflow-hidden rounded-full bg-muted">
                <span className={cn("h-full rounded-full transition-[width] duration-300", tone.bar)} style={{ width: `${card.share}%` }} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
    <HowItCounts overview={overview} />
  </section>
);

/** "Cách tính": the definitions of the cards, folded under a small link. */
const HowItCounts = ({ overview }: { overview: Pick<ProductionOverview, "stageNames" | "clock"> }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const name = (stage: string) => overview.stageNames.find((item) => item.stage === stage)?.name ?? stage;
  const terms: [string, string][] = [
    ["Tổng task", "task hiện trong khoảng đã chọn · số tấm không cộng task Checking"],
    ["Chưa chia", "Job Code chưa có task nào"],
    [
      "Đang làm",
      `${["ASSIGNED", "PROCESSING", "REWORK", "WAITING_QC", "QC_CHECKING", "FEEDBACK"].map(name).join(" · ")} (task vừa Done chờ QC vẫn tính Đang làm)`
    ],
    ["Xong", `${name("CHECKED")} · ${name("COMPLETE")}`],
    ["Trễ", "task quá hạn chưa Done + job quá deadline khách chưa giao"],
    [
      "Đồng hồ chờ",
      `tính trong giờ lõi ${overview.clock.coreStart}–${overview.clock.coreEnd}, cảnh báo sau ${hoursLabel(overview.clock.alertHours)}`
    ]
  ];
  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-foreground-muted outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info aria-hidden="true" className="size-3.5" />
        Cách tính số liệu
        <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open ? (
        <dl
          id={id}
          className="grid w-full gap-x-6 gap-y-2 rounded-xl border bg-surface px-4 py-3 text-xs leading-relaxed shadow-xs sm:grid-cols-2 xl:grid-cols-3"
        >
          {terms.map(([term, definition]) => (
            <div key={term} className="flex min-w-0 flex-col gap-0.5">
              <dt className="font-semibold text-foreground">{term}</dt>
              <dd className="text-foreground-muted">{definition}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
};
