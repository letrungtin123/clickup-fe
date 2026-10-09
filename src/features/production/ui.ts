import { cn } from "cn";

/**
 * Shared class recipes for the production screens (kept out of component files for fast refresh).
 *
 * Phones: every button (chips, row names, triggers), input and select inside gets a ≥ 40px touch
 * target; switches and checkboxes keep their size (their whole row is the label). Applied to page
 * roots and to portaled dialog/popover contents (they are not descendants of the page).
 */
export const touchTargets = cn(
  "max-sm:[&_button:not([role=switch]):not([data-slot=checkbox])]:min-h-10",
  "max-sm:**:data-[slot=button]:min-w-10 max-sm:**:data-[slot=input]:h-10 max-sm:**:data-[slot=select-trigger]:h-10"
);

/** Dialogs become bottom sheets on phones: full width, anchored to the bottom, scroll inside. */
export const sheetOnPhone = cn(
  "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0",
  "max-sm:max-h-[92dvh] max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)] max-sm:data-open:slide-in-from-bottom-8",
  touchTargets
);
