import { cn } from "cn";
import { Check } from "lucide-react";

import { toneClass } from "@/lib/colors";

type StatusLike = { color: string; category: "active" | "done" | "closed"; name?: string };

/**
 * Compact status glyph (rows, cards, subtasks): open = colored ring, done = filled with a check,
 * closed = filled muted. Purely visual; wrap it in a button to make it interactive.
 */
export const StatusIcon = ({
  status,
  size = "md",
  className
}: {
  status: StatusLike;
  size?: "sm" | "md" | "lg";
  className?: string | undefined;
}) => (
  <span
    aria-hidden="true"
    className={cn(
      toneClass(status.color),
      "inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150",
      size === "sm" ? "size-3" : size === "md" ? "size-3.5" : "size-4",
      status.category === "active"
        ? "border-[1.75px] border-(--tone) bg-(--tone-soft)"
        : status.category === "done"
          ? "bg-(--tone) text-(--tone-on)"
          : "bg-(--tone) text-(--tone-on) opacity-70",
      className
    )}
  >
    {status.category === "active" ? null : (
      <Check className={size === "lg" ? "size-3" : "size-2.5"} strokeWidth={3.25} />
    )}
  </span>
);
