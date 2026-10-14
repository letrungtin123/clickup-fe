import { cn } from "cn";
import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  departmentLabels,
  departmentShortLabels,
  type Department
} from "@/contracts/departments";

import { toneClass } from "@/lib/colors";

import { useDepartment } from "../hooks";
import { departmentDescriptions, departmentIcons, departmentTones } from "../meta";
import { isDepartment } from "../model";

type Variant = "sidebar" | "rail" | "topbar";

const triggerClass: Record<Variant, string> = {
  // Full sidebar (desktop, tablet overlay, phone drawer): one compact full-width row under the account menu.
  sidebar:
    "flex h-8 w-full min-w-0 items-center gap-2 rounded-md bg-muted/60 pr-2 pl-1.5 text-[13px] font-medium text-foreground outline-none transition-colors duration-150 pointer-coarse:h-10 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted",
  // Icon rail (collapsed desktop / tablet): same footprint as the rail links.
  rail: "relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-foreground outline-none transition-colors duration-150 pointer-coarse:size-10 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted [&_svg]:size-[18px]",
  // Phone top bar: icon + short label, as tall as the icon buttons beside it.
  topbar:
    "inline-flex h-8 max-w-[8.5rem] shrink-0 items-center gap-1 rounded-lg px-1.5 text-[13px] font-medium text-foreground outline-none transition-colors duration-150 pointer-coarse:h-10 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted"
};

/**
 * "Photo Retouch ▾": switches the department shown (PD-041). Only rendered for people in more than one department;
 * the caller checks `canSwitch` so single-department users get no extra control at all.
 */
export const DepartmentSwitcher = ({ variant }: { variant: Variant }) => {
  const { current, departments, setDepartment } = useDepartment();
  if (!current) return null;
  const Icon = departmentIcons[current];
  const label = departmentLabels[current];
  const triggerLabel = `Phòng ban: ${label}. Đổi phòng ban`;

  const menu = (
    <DropdownMenuContent
      side={variant === "rail" ? "right" : "bottom"}
      align={variant === "topbar" ? "end" : "start"}
      sideOffset={variant === "rail" ? 8 : 4}
      // Wide enough for the one-line descriptions; never wider than a phone screen.
      className="w-72 max-w-[calc(100vw-1rem)]"
    >
      <DropdownMenuGroup>
        <DropdownMenuLabel>Phòng ban</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value: unknown) => {
            if (isDepartment(value)) setDepartment(value);
          }}
        >
          {departments.map((department) => (
            <DepartmentOption key={department} department={department} />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );

  if (variant === "rail") {
    return (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={<DropdownMenuTrigger aria-label={triggerLabel} className={triggerClass.rail} />}
          >
            <Icon
              className={cn(toneClass(departmentTones[current]), "text-(--tone-text)")}
              aria-hidden="true"
            />
          </TooltipTrigger>
          <TooltipContent side="right">Phòng ban: {label}</TooltipContent>
        </Tooltip>
        {menu}
      </DropdownMenu>
    );
  }

  if (variant === "topbar") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={triggerLabel} className={triggerClass.topbar}>
          <Icon
            className={cn(toneClass(departmentTones[current]), "size-4 shrink-0 text-(--tone-text)")}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">{departmentShortLabels[current]}</span>
          <ChevronDown
            className="size-3 shrink-0 text-foreground-subtle max-[359px]:hidden"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={triggerLabel} className={triggerClass.sidebar}>
        <DepartmentTile department={current} />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
      </DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  );
};

/** Department glyph on a soft tile in the department colour: "sm" in the sidebar trigger, "md" in the menu. */
const DepartmentTile = ({
  department,
  size = "sm"
}: {
  department: Department;
  size?: "sm" | "md";
}) => {
  const Icon = departmentIcons[department];
  return (
    <span
      aria-hidden="true"
      className={cn(
        toneClass(departmentTones[department]),
        "flex shrink-0 items-center justify-center bg-(--tone-soft) text-(--tone-text)",
        size === "sm" ? "size-5 rounded" : "size-7 rounded-md"
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={size === "sm" ? 2.25 : 2} />
    </span>
  );
};

const DepartmentOption = ({ department }: { department: Department }) => (
  <DropdownMenuRadioItem value={department} className="gap-2.5 py-1.5">
    <DepartmentTile department={department} size="md" />
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-[13px] font-medium">{departmentLabels[department]}</span>
      <span className="truncate text-xs text-foreground-muted">
        {departmentDescriptions[department]}
      </span>
    </span>
  </DropdownMenuRadioItem>
);
