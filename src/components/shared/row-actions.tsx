import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode, type RefObject } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export type RowAction = {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  variant?: "default" | "destructive";
  shortcut?: string;
  disabled?: boolean;
  /** Draw a separator above this item. */
  separated?: boolean;
};

type ActionsDropdownProps = {
  actions: readonly RowAction[];
  trigger: ReactNode;
  triggerClassName?: string;
  triggerLabel: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element focused when the menu closes (defaults to the trigger). */
  finalFocus?: RefObject<HTMLElement | null>;
  align?: "start" | "end";
};

/** "…" menu for a row. Shares the action model with the right-click menu below. */
export const ActionsDropdown = ({
  actions,
  trigger,
  triggerClassName,
  triggerLabel,
  open,
  onOpenChange,
  finalFocus,
  align = "start"
}: ActionsDropdownProps) => (
  <DropdownMenu
    {...(open === undefined ? {} : { open })}
    {...(onOpenChange ? { onOpenChange } : {})}
  >
    <DropdownMenuTrigger
      aria-label={triggerLabel}
      tabIndex={-1}
      className={triggerClassName}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {trigger}
    </DropdownMenuTrigger>
    <DropdownMenuContent align={align} className="w-52" {...(finalFocus ? { finalFocus } : {})}>
      {actions.map((action) => (
        <Fragment key={action.key}>
          {action.separated ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            variant={action.variant ?? "default"}
            disabled={action.disabled ?? false}
            onClick={action.onSelect}
          >
            {action.icon ? <action.icon /> : null}
            {action.label}
            {action.shortcut ? (
              <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut>
            ) : null}
          </DropdownMenuItem>
        </Fragment>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

/** Right-click menu wrapper around a row. */
export const ActionsContextMenu = ({
  actions,
  children
}: {
  actions: readonly RowAction[];
  children: ReactNode;
}) => {
  if (actions.length === 0) {
    return <>{children}</>;
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div />}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {actions.map((action) => (
          <Fragment key={action.key}>
            {action.separated ? <ContextMenuSeparator /> : null}
            <ContextMenuItem
              variant={action.variant ?? "default"}
              disabled={action.disabled ?? false}
              onClick={action.onSelect}
            >
              {action.icon ? <action.icon /> : null}
              {action.label}
              {action.shortcut ? (
                <ContextMenuShortcut>{action.shortcut}</ContextMenuShortcut>
              ) : null}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
};
