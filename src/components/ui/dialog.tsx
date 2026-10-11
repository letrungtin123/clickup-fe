import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-(--scrim) duration-150 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  );
}

/**
 * Phone layouts (< 640px) for dialogs:
 *   sheet       bottom sheet: full width, rises above the on-screen keyboard, home-indicator inset,
 *               scrolls when taller than the screen (default — forms, confirmations)
 *   fullscreen  covers the screen (long, tabbed or list-heavy dialogs; the palette)
 *   center      the desktop card, kept centered (media viewers that size themselves)
 * From `sm` up every dialog is the centered card.
 */
type DialogMobileLayout = "sheet" | "fullscreen" | "center";

const mobileLayoutClass: Record<DialogMobileLayout, string> = {
  sheet: cn(
    "max-sm:top-auto max-sm:bottom-(--keyboard-inset) max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0",
    "max-sm:max-h-[calc(100dvh-var(--keyboard-inset)-env(safe-area-inset-top)-0.5rem)] max-sm:overflow-y-auto max-sm:overscroll-contain",
    "max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-b-(length:--safe-bottom) max-sm:border-transparent",
    "max-sm:data-open:zoom-in-100 max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:zoom-out-100 max-sm:data-closed:slide-out-to-bottom-10"
  ),
  fullscreen: cn(
    "max-sm:top-0 max-sm:left-0 max-sm:h-[calc(100dvh-var(--keyboard-inset))] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0",
    "max-sm:rounded-none max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-(--safe-bottom) max-sm:ring-0",
    "max-sm:data-open:zoom-in-100 max-sm:data-open:slide-in-from-bottom-6 max-sm:data-closed:zoom-out-100 max-sm:data-closed:slide-out-to-bottom-6"
  ),
  center: "max-sm:max-h-[calc(100dvh-var(--keyboard-inset)-2rem)]"
};

function DialogContent({
  className,
  children,
  showCloseButton = true,
  mobileLayout = "sheet",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  mobileLayout?: DialogMobileLayout;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-mobile-layout={mobileLayout}
        // grid-cols-1 = minmax(0, 1fr): a long unbreakable line (file name, URL) truncates inside the
        // card instead of widening the grid past the screen (it pushed the lightbox close button off).
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full grid-cols-1 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 duration-150 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          mobileLayoutClass[mobileLayout],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2 max-sm:in-data-[mobile-layout=fullscreen]:top-[calc(env(safe-area-inset-top)+0.5rem)]"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Đóng</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        // Phone sheets scroll as a whole: the actions stay pinned (opaque so content never shows through).
        "max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:rounded-b-none max-sm:bg-[color-mix(in_oklch,var(--muted)_50%,var(--surface-raised))]",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Đóng</DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
};
