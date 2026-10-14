import { cn } from "cn";

import { departmentLabels, departmentShortLabels, type Department } from "@/contracts/departments";
import { toneClass } from "@/lib/colors";

import { departmentTones } from "../meta";

/** Small tag in the department colour naming a department ("Photo Retouch" / "Production"; the short form on phones). */
export const DepartmentBadge = ({
  department,
  className
}: {
  department: Department;
  className?: string | undefined;
}) => (
  <span
    title={`Phòng ban ${departmentLabels[department]}`}
    className={cn(
      toneClass(departmentTones[department]),
      "inline-flex h-4 max-w-full shrink-0 items-center rounded-sm bg-(--tone-soft) px-1 text-[10px] leading-none font-medium text-(--tone-text)",
      className
    )}
  >
    <span className="sr-only">Phòng ban </span>
    <span className="truncate sm:hidden">{departmentShortLabels[department]}</span>
    <span className="truncate max-sm:hidden">{departmentLabels[department]}</span>
  </span>
);
