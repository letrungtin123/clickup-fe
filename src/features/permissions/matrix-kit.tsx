import { cn } from "cn";
import { Info, Lock, Save, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";

/**
 * Building blocks of the permission matrices (PD-042): a card whose table scrolls inside itself (both axes, so the
 * header row stays sticky and a phone never scrolls the page sideways), a sticky first column with the feature
 * and its description (hover or tap), 40px check cells, read-only marks and the shared "Lưu thay đổi" bar.
 */

export const fixedRuleHint = "Đang cố định theo vai trò";

export const MatrixCard = ({
  title,
  description,
  actions,
  children,
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={cn("min-w-0 overflow-hidden rounded-xl border bg-surface shadow-xs", className)}>
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b px-4 py-3 md:px-5">
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-[13px] text-foreground-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
    {children}
  </section>
);

/** The scroll box of one matrix: sticky header and first column live inside it. */
export const MatrixTable = ({
  caption,
  head,
  children,
  minWidth
}: {
  caption: string;
  head: ReactNode;
  children: ReactNode;
  /** Narrower than this, the table scrolls sideways inside the card. */
  minWidth: string;
}) => (
  <div
    role="region"
    aria-label={caption}
    // Focusable so keyboard users can scroll it (axe: scrollable-region-focusable).
    tabIndex={0}
    className="max-h-[calc(100dvh-11rem)] overflow-auto overscroll-x-contain outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
  >
    <table
      className="w-full border-separate border-spacing-0 text-[13px]"
      style={{ minWidth }}
    >
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th
            scope="col"
            className="sticky top-0 left-0 z-30 w-36 min-w-36 border-r border-b bg-surface px-3 py-2 text-left text-xs font-medium text-foreground-muted sm:w-64 sm:min-w-64 md:px-4"
          >
            Tính năng
          </th>
          {head}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

/** A role column header (sticky top). */
export const HeadCell = ({ children, className }: { children: ReactNode; className?: string }) => (
  <th
    scope="col"
    className={cn(
      "sticky top-0 z-20 border-b bg-surface px-1.5 py-2 text-center align-bottom text-xs font-medium",
      className
    )}
  >
    {children}
  </th>
);

/**
 * A group heading row spanning the table; its title and one-line explanation stick to the left edge while the
 * matrix scrolls sideways (phones), so they use the visible width instead of the narrow first column.
 */
export const GroupRow = ({
  title,
  description,
  span
}: {
  title: string;
  description?: string;
  span: number;
}) => (
  <tr>
    <th scope="rowgroup" colSpan={span + 1} className="border-b bg-muted p-0 text-left font-normal">
      <span className="sticky left-0 block w-[min(40rem,calc(100vw-4.5rem))] px-3 pt-3 pb-2 md:px-4">
        <span className="block text-xs font-semibold tracking-wide text-foreground uppercase">
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-snug text-foreground-muted">
            {description}
          </span>
        ) : null}
      </span>
    </th>
  </tr>
);

/** The sticky first cell of a row: the feature, its description on hover / tap (a lock when it is fixed). */
export const RowHead = ({
  label,
  description,
  locked = false,
  lockedHint = fixedRuleHint
}: {
  label: string;
  description: string;
  locked?: boolean;
  /** First line of the description of a locked row. */
  lockedHint?: string;
}) => (
  <th
    scope="row"
    className="sticky left-0 z-10 border-r border-b bg-surface px-2 py-0.5 text-left font-normal md:px-3"
  >
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={250}
        closeDelay={80}
        className="group flex min-h-10 w-full items-center gap-1.5 rounded-md px-1 text-left outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-surface-hover"
      >
        <span className="min-w-0 flex-1 leading-snug">{label}</span>
        {locked ? (
          <Lock className="size-3.5 shrink-0 text-foreground-subtle" aria-label={lockedHint} />
        ) : (
          <Info
            className="size-3.5 shrink-0 text-foreground-subtle opacity-70 group-hover:opacity-100"
            aria-hidden="true"
          />
        )}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 gap-1.5 text-xs">
        {locked ? (
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Lock className="size-3.5 text-foreground-muted" aria-hidden="true" />
            {lockedHint}
          </p>
        ) : null}
        <p className="leading-relaxed text-foreground-muted">{description}</p>
      </PopoverContent>
    </Popover>
  </th>
);

const cellClass = "border-b px-1 py-0.5 text-center align-middle";

/** One permission of one role: a 40px tap target around the checkbox; changed cells are tinted. */
export const CheckCell = ({
  checked,
  label,
  disabled,
  changed = false,
  lockReason,
  onChange
}: {
  checked: boolean;
  label: string;
  disabled: boolean;
  changed?: boolean;
  /** Why the cell cannot be changed (title on hover). */
  lockReason?: string | undefined;
  onChange?: (checked: boolean) => void;
}) => (
  <td className={cellClass}>
    <label
      title={disabled ? lockReason : undefined}
      data-changed={changed || undefined}
      className={cn(
        "mx-auto flex size-10 items-center justify-center rounded-md transition-colors duration-150",
        disabled ? "cursor-default" : "cursor-pointer hover:bg-surface-hover",
        changed && "bg-brand-soft ring-1 ring-brand/50 hover:bg-brand-soft"
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        className={disabled ? "opacity-60" : undefined}
        aria-label={label}
        onCheckedChange={(next) => onChange?.(next)}
      />
    </label>
  </td>
);

/** A fixed rule's cell: the same (locked) checkbox, or "Một phần" with what the part is. */
export const MarkCell = ({
  value,
  label
}: {
  value: boolean | { partial: string };
  label: string;
}) =>
  typeof value === "boolean" ? (
    <CheckCell checked={value} disabled label={label} lockReason={fixedRuleHint} />
  ) : (
    <td className={cellClass}>
      <Popover>
        <PopoverTrigger
          openOnHover
          delay={200}
          closeDelay={80}
          aria-label={`${label}: một phần — ${value.partial}`}
          className="mx-auto flex min-h-10 items-center justify-center rounded-md px-1.5 text-[11px] leading-tight font-medium text-warning outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
        >
          Một phần
        </PopoverTrigger>
        <PopoverContent side="bottom" className="w-60 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            <Lock className="size-3.5 text-foreground-muted" aria-hidden="true" />
            {fixedRuleHint}
          </p>
          <p className="leading-relaxed text-foreground-muted">{value.partial}</p>
        </PopoverContent>
      </Popover>
    </td>
  );

/** Sticky bottom bar while something is changed: count, "Hoàn tác", "Lưu thay đổi". */
export const SaveBar = ({
  count,
  saving,
  onUndo,
  onSave
}: {
  count: number;
  saving: boolean;
  onUndo: () => void;
  onSave: () => void;
}) => (
  <AnimatePresence>
    {count > 0 ? (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.18 }}
        role="status"
        className="sticky bottom-4 z-40 flex flex-wrap items-center gap-3 rounded-xl border bg-surface-raised px-4 py-3 shadow-lg"
      >
        <span className="flex min-w-0 flex-1 items-center gap-3 text-[13px] max-sm:basis-full">
          <Info className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
          {count} thay đổi chưa lưu.
        </span>
        <Button
          type="button"
          variant="ghost"
          className="max-sm:ml-auto"
          disabled={saving}
          onClick={onUndo}
        >
          <Undo2 />
          Hoàn tác
        </Button>
        <Button type="button" disabled={saving} onClick={onSave}>
          {saving ? <Spinner /> : <Save />}
          Lưu thay đổi
        </Button>
      </motion.div>
    ) : null}
  </AnimatePresence>
);
