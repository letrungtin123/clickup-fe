import { cn } from "cn";
import { Check, Plus } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { productionRoleCodes, type ProductionRole } from "@/contracts/production-catalog";
import { toneClass } from "@/lib/colors";

import {
  productionRoleColors,
  productionRoleDescriptions,
  productionRoleLabels,
  sortRoles,
  toggleRole
} from "../roles";

export const RoleBadge = ({ role, className }: { role: ProductionRole; className?: string }) => (
  <span
    title={productionRoleDescriptions[role]}
    className={cn(
      toneClass(productionRoleColors[role]),
      "inline-flex h-5 shrink-0 items-center rounded-full bg-(--tone-soft) px-2 text-[11px] font-medium whitespace-nowrap text-(--tone-text)",
      className
    )}
  >
    {productionRoleLabels[role]}
  </span>
);

export const RoleBadges = ({
  roles,
  empty = "Chưa có vai trò",
  className
}: {
  roles: readonly ProductionRole[];
  empty?: string;
  className?: string;
}) =>
  roles.length === 0 ? (
    <span className={cn("text-xs text-foreground-subtle", className)}>{empty}</span>
  ) : (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {sortRoles(roles).map((role) => (
        <RoleBadge key={role} role={role} />
      ))}
    </span>
  );

type RoleToggleGroupProps = {
  value: readonly ProductionRole[];
  onChange: (roles: ProductionRole[]) => void;
  /** Roles that cannot be toggled, with the reason shown as a tooltip. */
  locked?: Partial<Record<ProductionRole, string>>;
  disabled?: boolean;
  /** Lets a form focus the first chip (`#id button`). */
  id?: string;
  className?: string;
} & ({ "aria-label": string } | { "aria-labelledby": string });

/**
 * Multi-select role chips: one click grants or removes a role. Each chip is a toggle button
 * (aria-pressed) so the group works with keyboard and screen readers.
 */
export const RoleToggleGroup = ({
  value,
  onChange,
  locked = {},
  disabled,
  id,
  className,
  ...aria
}: RoleToggleGroupProps) => (
  <div id={id} role="group" {...aria} className={cn("flex flex-wrap gap-1", className)}>
    {productionRoleCodes.map((role) => {
      const pressed = value.includes(role);
      const lockReason = locked[role];
      const chip = (
        <button
          key={role}
          type="button"
          aria-pressed={pressed}
          aria-disabled={disabled || lockReason !== undefined || undefined}
          onClick={() => {
            if (disabled || lockReason !== undefined) return;
            onChange(toggleRole(value, role));
          }}
          className={cn(
            toneClass(productionRoleColors[role]),
            "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap outline-none transition-[background-color,border-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
            pressed
              ? "border-transparent bg-(--tone-soft) text-(--tone-text)"
              : "border-dashed border-border-strong text-foreground-subtle hover:border-(--tone) hover:text-(--tone-text)",
            (disabled || lockReason !== undefined) &&
              "cursor-not-allowed opacity-60 hover:border-border-strong"
          )}
        >
          {pressed ? (
            <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <Plus className="size-3 opacity-60" aria-hidden="true" />
          )}
          {productionRoleLabels[role]}
        </button>
      );
      return lockReason ? (
        <Tooltip key={role}>
          <TooltipTrigger render={<span className="inline-flex" />}>{chip}</TooltipTrigger>
          <TooltipContent>{lockReason}</TooltipContent>
        </Tooltip>
      ) : (
        chip
      );
    })}
  </div>
);
