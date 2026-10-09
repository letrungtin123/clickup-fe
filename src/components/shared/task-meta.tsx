import { cn } from "cn";
import { Flag } from "lucide-react";

import type { ColorToken, TaskPriority } from "@/contracts/work";
import { toneClass } from "@/lib/colors";
import { priorityMeta } from "@/lib/task-meta";

type StatusLike = {
  name: string;
  color: ColorToken | (string & {});
  category?: "active" | "done" | "closed";
};

/** Status chip colored by the status' contract color token. */
export const StatusPill = ({
  status,
  size = "sm",
  className
}: {
  status: StatusLike;
  size?: "xs" | "sm";
  className?: string;
}) => (
  <span
    className={cn(
      toneClass(status.color),
      "inline-flex max-w-full items-center gap-1.5 rounded-full bg-(--tone-soft) font-medium text-(--tone-text)",
      size === "sm" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[11px]",
      className
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status.category === "active" ? "border-[1.5px] border-(--tone)" : "bg-(--tone)"
      )}
    />
    <span className="truncate">{status.name}</span>
  </span>
);

/** Priority flag icon (+ optional label). */
export const PriorityFlag = ({
  priority,
  showLabel = false,
  className
}: {
  priority: TaskPriority;
  showLabel?: boolean;
  className?: string;
}) => {
  const meta = priorityMeta[priority];
  return (
    <span
      className={cn(
        toneClass(meta.color),
        "inline-flex items-center gap-1 text-xs text-foreground-muted",
        className
      )}
      title={showLabel ? undefined : `Ưu tiên: ${meta.label}`}
    >
      <Flag
        aria-hidden="true"
        className={cn(
          "size-3.5 text-(--tone)",
          priority === "urgent" || priority === "high" ? "fill-(--tone)" : ""
        )}
        strokeWidth={2}
      />
      {showLabel ? (
        <span>{meta.label}</span>
      ) : (
        <span className="sr-only">Ưu tiên: {meta.label}</span>
      )}
    </span>
  );
};
