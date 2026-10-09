import { cn } from "cn";
import type { ColorToken } from "@/contracts/work";
import { toneClass } from "@/lib/colors";

import { isProjectIconKey, projectIcons } from "./project-icons";

type ProjectIconProps = {
  color: ColorToken | (string & {}) | null | undefined;
  icon?: string | null | undefined;
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  xs: "size-4 rounded-[4px] text-[9px] [&_svg]:size-2.5",
  sm: "size-5 rounded-[5px] text-[10px] [&_svg]:size-3",
  md: "size-7 rounded-md text-xs [&_svg]:size-4",
  lg: "size-10 rounded-lg text-sm [&_svg]:size-5"
} as const;

/** Project glyph: chosen lucide icon (or the name's initial) on the project's color token. */
export const ProjectIcon = ({ color, icon, name, size = "sm", className }: ProjectIconProps) => {
  const Icon = isProjectIconKey(icon) ? projectIcons[icon] : null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        toneClass(color),
        "inline-flex shrink-0 items-center justify-center bg-(--tone-solid) font-semibold text-(--tone-on) select-none",
        sizeClasses[size],
        className
      )}
    >
      {Icon ? <Icon strokeWidth={2.25} /> : (name.trim()[0] ?? "?").toLocaleUpperCase("vi")}
    </span>
  );
};
