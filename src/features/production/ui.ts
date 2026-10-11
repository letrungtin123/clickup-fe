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

/**
 * Production dialogs on phones. DialogContent is already a bottom sheet below `sm` (full width,
 * rises above the iOS keyboard via --keyboard-inset, home-indicator inset, scrolls inside), so this
 * adds the touch targets and pins the sticky footer flush with the sheet's bottom edge (`bottom-0`
 * stops at the sheet's 16px padding and leaves a band under the actions). It used to re-anchor the
 * sheet to `bottom-0` (hidden behind the iOS keyboard) and zero its bottom padding (the footer's
 * -mb-4 then overflowed by 16px and focusing a field scrolled the title away).
 */
export const sheetOnPhone = cn(touchTargets, "max-sm:**:data-[slot=dialog-footer]:-bottom-4");

/**
 * Max height for the inner flex column of tall dialogs (DialogContent `p-0 overflow-hidden` with a
 * scrolling body): the phone sheet's own max height minus its home-indicator border, so the header
 * and the actions stay on screen, above the keyboard too.
 */
export const phoneSheetColumn =
  "max-sm:max-h-[calc(100dvh-var(--keyboard-inset)-env(safe-area-inset-top)-0.5rem-var(--safe-bottom))]";
