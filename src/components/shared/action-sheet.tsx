import { cn } from "cn";
import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";

/**
 * Touch action sheet: a bottom sheet with a grab handle, a short header and thumb-sized rows.
 * The tap alternative to hover toolbars / row menus (opened by a long press, see useLongPress).
 */
export const ActionSheet = ({
  open,
  onOpenChange,
  title,
  description,
  leading,
  className,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Before the title (e.g. a back button for a nested view). */
  leading?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="bottom"
      showCloseButton={false}
      className={cn(
        "max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-(--safe-bottom)",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong"
      />
      <SheetHeader className="flex-row items-center gap-2 px-4 pt-2 pb-3">
        {leading}
        <div className="flex min-w-0 flex-col gap-0.5">
          <SheetTitle className="line-clamp-2 text-sm">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-xs">{description}</SheetDescription>
          ) : null}
        </div>
      </SheetHeader>
      {children}
    </SheetContent>
  </Sheet>
);

export const ActionSheetItem = ({
  icon,
  destructive = false,
  onClick,
  children
}: {
  icon: ReactNode;
  destructive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5 [&_svg]:shrink-0",
      destructive
        ? "text-danger [&_svg]:text-danger"
        : "text-foreground [&_svg]:text-foreground-muted"
    )}
  >
    {icon}
    {children}
  </button>
);
