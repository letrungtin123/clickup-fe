import { cn } from "cn";

import type { ColorToken } from "@/contracts/work";
import { toneClass } from "@/lib/colors";

type ColorDotProps = {
  color: ColorToken | (string & {}) | null | undefined;
  className?: string;
  /** "solid" filled dot, "ring" outlined dot (e.g. open/initial statuses). */
  variant?: "solid" | "ring";
  label?: string;
};

export const ColorDot = ({ color, className, variant = "solid", label }: ColorDotProps) => (
  <span
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    className={cn(
      toneClass(color),
      "inline-block size-2 shrink-0 rounded-full",
      variant === "solid" ? "bg-(--tone)" : "border-[1.5px] border-(--tone) bg-transparent",
      className
    )}
  />
);
