import { cn } from "cn";

import type { KnowledgeStatusGroup } from "@/contracts/knowledge";
import type { ColorToken } from "@/contracts/work";
import { toneClass } from "@/lib/colors";

/**
 * The status dot with its group shape, like KnowledgeStatusChip: ring = Bản nháp, solid = Đang áp
 * dụng, faded = Hết hiệu lực. Decorative: the group is always written next to it.
 */
export const StatusGroupDot = ({
  group,
  color,
  className
}: {
  group: KnowledgeStatusGroup;
  color: ColorToken;
  className?: string;
}) => (
  <span
    aria-hidden="true"
    className={cn(
      toneClass(color),
      "inline-block size-2.5 shrink-0 rounded-full",
      group === "draft" ? "border-2 border-(--tone)" : "bg-(--tone)",
      group === "retired" && "opacity-50",
      className
    )}
  />
);
