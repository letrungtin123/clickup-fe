import { cn } from "cn";
import {
  Archive,
  ArchiveRestore,
  Ellipsis,
  Pencil,
  Plus,
  Search,
  type LucideIcon
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

import { settingsPageBySlug } from "../nav";
import { touchTargets } from "../ui";

/**
 * Building blocks shared by the production settings pages so every catalog looks and behaves the
 * same: page frame, section card, toolbar search, archived toggle, row menu, inline alerts.
 */

const ease = [0.22, 1, 0.36, 1] as const;

/** Page frame with a fade-in; `wide` for tables and the credit matrix. */
export const SettingsPage = ({
  children,
  wide = false,
  className
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2, ease }}
    className={cn(
      "mx-auto flex w-full min-w-0 flex-col gap-4 px-4 py-5 md:px-6 md:py-6",
      wide ? "max-w-none" : "max-w-5xl",
      touchTargets,
      className
    )}
  >
    {children}
  </motion.div>
);

/** Heading of one settings page (label/description from nav.ts) with page-level actions. */
export const PageIntro = ({
  slug,
  actions,
  children
}: {
  slug: string;
  actions?: ReactNode;
  children?: ReactNode;
}) => {
  const page = settingsPageBySlug(slug);
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
      {/* basis-64: on phones the actions wrap below instead of squeezing the title column. */}
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
        {page ? (
          <span className="mt-0.5 hidden size-9 shrink-0 items-center justify-center rounded-lg border bg-surface text-foreground-muted shadow-xs sm:flex [&_svg]:size-[18px]">
            <page.icon aria-hidden="true" strokeWidth={1.75} />
          </span>
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-base font-semibold tracking-[-0.01em]">{page?.label}</h2>
          <p className="text-[13px] text-foreground-muted">{children ?? page?.description}</p>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
};

export const SettingsSection = ({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) => (
  <section className={cn("min-w-0 rounded-xl border bg-surface shadow-xs", className)}>
    {title || actions ? (
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
          {description ? <p className="text-[13px] text-foreground-muted">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
        ) : null}
      </div>
    ) : null}
    <div className={bodyClassName}>{children}</div>
  </section>
);

export const SearchField = ({
  value,
  onChange,
  placeholder,
  label,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) => (
  <div className={cn("relative min-w-0 flex-1 sm:max-w-xs", className)}>
    <Search
      className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground-subtle"
      aria-hidden="true"
    />
    <Input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className="pl-8"
    />
  </div>
);

export const ArchivedToggle = ({
  checked,
  onChange,
  count
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  count: number;
}) =>
  count === 0 ? null : (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-foreground-muted select-none">
      <Switch size="sm" checked={checked} onCheckedChange={onChange} />
      Hiện mục đã lưu trữ ({count})
    </label>
  );

export const ActiveState = ({ active, className }: { active: boolean; className?: string }) => (
  <span className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", className)}>
    <span
      aria-hidden="true"
      className={cn("size-1.5 rounded-full", active ? "bg-success" : "bg-foreground-subtle")}
    />
    <span className={active ? "text-foreground-muted" : "text-foreground-subtle"}>
      {active ? "Đang dùng" : "Đã lưu trữ"}
    </span>
  </span>
);

/** Form-level error. Scrolls itself into view: in long dialogs it renders below the fold. */
export const FormAlert = ({ children, className }: { children: ReactNode; className?: string }) =>
  children ? <FormAlertBox className={className}>{children}</FormAlertBox> : null;

const FormAlertBox = ({
  children,
  className
}: {
  children: ReactNode;
  className?: string | undefined;
}) => {
  const ref = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [children]);
  return (
    <p
      ref={ref}
      role="alert"
      className={cn(
        "rounded-lg bg-danger-soft px-3 py-2 text-[13px] whitespace-pre-line text-danger",
        className
      )}
    >
      {children}
    </p>
  );
};

export const InfoNote = ({
  icon: Icon,
  children,
  tone = "muted",
  className
}: {
  icon: LucideIcon;
  children: ReactNode;
  tone?: "muted" | "warning" | "brand";
  className?: string;
}) => (
  <p
    className={cn(
      "flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] leading-relaxed",
      tone === "muted" && "bg-muted text-foreground-muted",
      tone === "warning" && "bg-warning-soft text-foreground",
      tone === "brand" && "bg-brand-soft text-foreground",
      className
    )}
  >
    <Icon
      className={cn(
        "mt-0.5 size-4 shrink-0",
        tone === "warning"
          ? "text-warning"
          : tone === "brand"
            ? "text-brand-text"
            : "text-foreground-subtle"
      )}
      aria-hidden="true"
    />
    <span className="min-w-0">{children}</span>
  </p>
);

export const RowsSkeleton = ({ rows = 5, className }: { rows?: number; className?: string }) => (
  <div className={cn("flex flex-col divide-y", className)} aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="flex items-center gap-3 px-4 py-3">
        <Skeleton className="size-7 rounded-lg" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5" style={{ width: `${40 + ((index * 23) % 30)}%` }} />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <Skeleton className="hidden h-6 w-20 sm:block" />
      </div>
    ))}
  </div>
);

type RowMenuProps = {
  label: string;
  active: boolean;
  onEdit?: (() => void) | undefined;
  onToggleActive?: (() => void) | undefined;
  extra?: ReactNode;
  disabled?: boolean;
};

/** "…" menu for a catalog row: edit + archive/restore (records are never hard-deleted). */
export const RowMenu = ({
  label,
  active,
  onEdit,
  onToggleActive,
  extra,
  disabled
}: RowMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      disabled={disabled}
      render={<Button variant="ghost" size="icon-sm" aria-label={`Tùy chọn cho ${label}`} />}
    >
      <Ellipsis />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-48">
      {onEdit ? (
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          Chỉnh sửa
        </DropdownMenuItem>
      ) : null}
      {extra}
      {onToggleActive ? (
        <>
          {onEdit || extra ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onClick={onToggleActive}>
            {active ? <Archive /> : <ArchiveRestore />}
            {active ? "Lưu trữ" : "Khôi phục"}
          </DropdownMenuItem>
        </>
      ) : null}
    </DropdownMenuContent>
  </DropdownMenu>
);

type InlineTextProps = {
  value: string;
  label: string;
  maxLength: number;
  /** Return an error message to keep the editor open, or null when the value is acceptable. */
  validate?: (next: string) => string | null;
  onSubmit: (next: string) => void;
  onCancel: () => void;
  pending?: boolean;
  className?: string;
};

/**
 * Rename-in-place input: Enter or blur saves (when changed), Escape cancels. The parent owns the
 * editing state so a row menu can start it.
 */
export const InlineText = ({
  value,
  label,
  maxLength,
  validate,
  onSubmit,
  onCancel,
  pending,
  className
}: InlineTextProps) => {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    const next = draft.trim();
    if (!next || next === value.trim()) {
      onCancel();
      return;
    }
    const problem = validate?.(next) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    onSubmit(next);
  };
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}>
      <Input
        autoFocus
        value={draft}
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={Boolean(error)}
        disabled={pending}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!error) commit();
        }}
        className="h-7"
      />
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
};

type QuickAddProps = {
  placeholder: string;
  label: string;
  buttonLabel: string;
  maxLength: number;
  validate?: (name: string) => string | null;
  /** Resolve true when created (clears the input). */
  onAdd: (name: string) => Promise<boolean>;
  children?: ReactNode;
};

/** One-line "add" form at the top of simple catalogs (teams, tags, processes). */
export const QuickAdd = ({
  placeholder,
  label,
  buttonLabel,
  maxLength,
  validate,
  onAdd,
  children
}: QuickAddProps) => {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    const next = name.trim();
    if (!next) {
      setError("Nhập tên trước khi thêm.");
      return;
    }
    const problem = validate?.(next) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    const created = await onAdd(next);
    setPending(false);
    if (created) setName("");
  };
  return (
    <form
      noValidate
      className="flex flex-col gap-1.5 border-b px-4 py-3 md:px-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          className="min-w-0 flex-1 sm:max-w-sm"
        />
        {children}
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : <Plus />}
          {buttonLabel}
        </Button>
      </div>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </form>
  );
};

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  destructive?: boolean;
};

export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  destructive = false
}: ConfirmDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent className={touchTargets}>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
        <Button
          variant={destructive ? "destructive" : "default"}
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? <Spinner /> : null}
          {confirmLabel}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/** Count + label used in toolbars ("12 dự án"). */
export const CountLabel = ({
  shown,
  total,
  noun
}: {
  shown: number;
  total: number;
  noun: string;
}) => (
  <span className="text-xs whitespace-nowrap text-foreground-muted tabular-nums">
    {shown === total ? `${total} ${noun}` : `${shown}/${total} ${noun}`}
  </span>
);
