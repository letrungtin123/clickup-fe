import { cn } from "cn";
import {
  AlarmClock,
  BellRing,
  CircleCheckBig,
  CircleDashed,
  FilePlus2,
  MessageSquareWarning,
  ScanEye,
  Send,
  TimerOff,
  TriangleAlert,
  X,
  type LucideIcon
} from "lucide-react";

import { formatInteger } from "../../format";
import { sameFilter, type NeedItem, type NeedTone, type OverviewFilter } from "../model";

const toneClasses: Record<NeedTone, string> = {
  risk: "tone tone-orange",
  neutral: "tone tone-slate",
  qc: "tone tone-sky",
  feedback: "tone tone-pink",
  done: "tone tone-green",
  idle: "tone tone-amber",
  late: "tone tone-red"
};

/** An icon per item (the same ones as the table's flags), so the colour is never the only signal. */
const icons: Record<string, LucideIcon> = {
  atRisk: TriangleAlert,
  unassigned: CircleDashed,
  qcWait: ScanEye,
  feedback: MessageSquareWarning,
  ready: CircleCheckBig,
  stale: TimerOff,
  readyToDeliver: Send,
  clientLate: AlarmClock,
  newNotSplit: FilePlus2
};

/**
 * PD-080 / PD-082 "Cần bạn xử lý": under the cards, the work only the viewer can unblock (Leader / Account items, see the
 * model) as pill buttons of one size — icon, count, words. Zero items are hidden; with none left the bar is hidden.
 * Click = filter the table, again = clear (the pressed pill says so with its ×).
 */
export const NeedsBar = ({
  items,
  filter,
  onPick
}: {
  items: readonly NeedItem[];
  filter: OverviewFilter;
  onPick: (item: NeedItem) => void;
}) =>
  items.length === 0 ? null : (
    <section
      aria-label="Cần bạn xử lý"
      className="flex min-w-0 flex-col gap-2.5 rounded-xl border bg-surface px-3 py-3 shadow-xs sm:flex-row sm:items-start sm:gap-3 sm:px-4"
    >
      <span className="flex h-8 shrink-0 items-center gap-2 text-[13px] font-semibold whitespace-nowrap">
        <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
          <BellRing className="size-4" />
        </span>
        Cần bạn xử lý
      </span>
      <span aria-hidden="true" className="hidden h-8 w-px shrink-0 bg-border sm:block" />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {items.map((item) => {
          const pressed = sameFilter(filter, item.filter);
          const Icon = icons[item.key] ?? BellRing;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={pressed}
              onClick={() => onPick(item)}
              className={cn(
                toneClasses[item.tone],
                "inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:gap-1 max-sm:px-2.5 pointer-coarse:h-10",
                pressed
                  ? "border-(--tone) bg-(--tone-soft) text-(--tone-text) shadow-xs ring-1 ring-(--tone)"
                  : "border-(--tone)/25 bg-(--tone-soft) text-(--tone-text) hover:border-(--tone)/60"
              )}
            >
              <Icon aria-hidden="true" className="size-3.5 shrink-0 text-(--tone)" />
              <b className="font-semibold text-foreground tabular-nums">{formatInteger(item.count)}</b>
              <span className="min-w-0 truncate">{item.label}</span>
              {pressed ? <X aria-hidden="true" className="-mr-1 size-3.5 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
