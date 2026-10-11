import { cn } from "cn";
import { AlarmClock, CircleAlert, Pin, ShieldAlert, TriangleAlert } from "lucide-react";

import type { KnowledgeImportance, KnowledgeStatus } from "@/contracts/knowledge";
import { toneClass } from "@/lib/colors";

import { importanceMeta, statusGroupMeta } from "../model/labels";

/**
 * Importance badge (PD-031 §03): the same colors on every list. "Bình thường" is quiet by default
 * (`showNormal` to render it anyway, e.g. on the item page).
 */
export const ImportanceBadge = ({
  importance,
  size = "sm",
  showNormal = false,
  className
}: {
  importance: KnowledgeImportance;
  size?: "xs" | "sm";
  showNormal?: boolean;
  className?: string;
}) => {
  if (importance === "normal" && !showNormal) return null;
  const meta = importanceMeta[importance];
  const Icon = importance === "critical" ? ShieldAlert : importance === "important" ? CircleAlert : null;
  return (
    <span
      title={`Mức quan trọng: ${meta.label}`}
      className={cn(
        toneClass(meta.color),
        "inline-flex max-w-full shrink-0 items-center gap-1 rounded-md font-medium whitespace-nowrap",
        importance === "normal"
          ? "bg-muted text-foreground-muted"
          : importance === "critical"
            ? "bg-(--tone-soft) text-(--tone-text) ring-1 ring-(--tone)/30 ring-inset"
            : "bg-(--tone-soft) text-(--tone-text)",
        size === "sm" ? "h-6 px-2 text-xs [&_svg]:size-3.5" : "h-5 px-1.5 text-[11px] [&_svg]:size-3",
        className
      )}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span className="truncate">{meta.label}</span>
    </span>
  );
};

/** Status chip: the space's own color + a group-specific dot (ring = draft, solid = active, slashed = retired). */
export const KnowledgeStatusChip = ({
  status,
  size = "sm",
  className
}: {
  status: Pick<KnowledgeStatus, "name" | "color" | "group">;
  size?: "xs" | "sm";
  className?: string;
}) => (
  <span
    title={`${status.name} · ${statusGroupMeta[status.group].label}`}
    className={cn(
      toneClass(status.color),
      "inline-flex max-w-full items-center gap-1.5 rounded-full bg-(--tone-soft) font-medium text-(--tone-text)",
      size === "sm" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[11px]",
      status.group === "retired" && "line-through decoration-(--tone)/60",
      className
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status.group === "draft" ? "border-[1.5px] border-(--tone)" : "bg-(--tone)"
      )}
    />
    <span className="truncate">{status.name}</span>
  </span>
);

export const ReviewDueBadge = ({ size = "sm", className }: { size?: "xs" | "sm"; className?: string }) => (
  <span
    title="Đã tới hạn rà soát: người phụ trách cần xem lại nội dung"
    className={cn(
      "inline-flex shrink-0 items-center gap-1 rounded-md bg-warning-soft font-medium whitespace-nowrap text-foreground",
      size === "sm" ? "h-6 px-2 text-xs [&_svg]:size-3.5" : "h-5 px-1.5 text-[11px] [&_svg]:size-3",
      className
    )}
  >
    <AlarmClock aria-hidden="true" className="text-warning" />
    Tới hạn rà soát
  </span>
);

export const PinnedMark = ({ className }: { className?: string }) => (
  <Pin aria-label="Đã ghim" className={cn("size-3.5 shrink-0 rotate-45 fill-brand/25 text-brand-text", className)} />
);

/** "Hết hiệu lực" warning shown on top of a retired item (and in lists as a muted row). */
export const RetiredBanner = ({ statusName, className }: { statusName: string; className?: string }) => (
  <div
    role="note"
    className={cn(
      "flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-foreground",
      className
    )}
  >
    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="font-semibold text-danger">Hết hiệu lực</p>
      <p className="text-foreground-muted">
        Mục đang ở trạng thái “{statusName}”: nội dung không còn áp dụng và chỉ được giữ để tra cứu.
      </p>
    </div>
  </div>
);
