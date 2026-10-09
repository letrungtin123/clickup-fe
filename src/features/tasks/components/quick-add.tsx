import { cn } from "cn";
import { CornerDownLeft, Plus } from "lucide-react";
import { useRef, useState } from "react";

import { Spinner } from "@/components/ui/spinner";

type QuickAddProps = {
  label?: string;
  placeholder?: string;
  /** Resolves when the task exists; rejects to keep the text for a retry. */
  onCreate: (title: string) => Promise<unknown>;
  variant?: "row" | "card";
  className?: string;
  indent?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Inline "add task" field. Enter creates and keeps the field open for the next one (rapid entry),
 * Escape or blurring an empty field closes it.
 */
export const QuickAdd = ({
  label = "Thêm công việc",
  placeholder = "Tên công việc… (Enter để tạo)",
  onCreate,
  variant = "row",
  className,
  indent = 0,
  open: controlledOpen,
  onOpenChange
}: QuickAddProps) => {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    setLocalOpen(next);
    onOpenChange?.(next);
  };
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = async () => {
    const title = value.trim();
    if (!title) return;
    setValue("");
    setPending((count) => count + 1);
    try {
      await onCreate(title.slice(0, 240));
    } catch {
      setValue((current) => current || title);
    } finally {
      setPending((count) => count - 1);
      inputRef.current?.focus();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={variant === "row" ? { paddingLeft: 8 + indent } : undefined}
        className={cn(
          "flex w-full items-center gap-2 text-[13px] text-foreground-subtle outline-none transition-colors duration-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          variant === "row" ? "h-8 rounded-md pr-2 hover:bg-surface-hover" : "h-8 rounded-lg px-2 hover:bg-surface-hover/80",
          className
        )}
      >
        <Plus className="size-3.5" aria-hidden="true" />
        {label}
      </button>
    );
  }

  return (
    <div
      style={variant === "row" ? { paddingLeft: 8 + indent } : undefined}
      className={cn(
        "flex items-center gap-2",
        variant === "row"
          ? "h-9 rounded-md bg-surface pr-2 ring-1 ring-brand/40"
          : "rounded-lg border bg-surface px-2.5 py-2 shadow-xs ring-1 ring-brand/30",
        className
      )}
    >
      {pending > 0 ? <Spinner className="size-3.5 text-foreground-muted" /> : <Plus className="size-3.5 text-foreground-subtle" aria-hidden="true" />}
      <input
        ref={inputRef}
        autoFocus
        value={value}
        maxLength={240}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setValue("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!value.trim() && pending === 0) setOpen(false);
        }}
        className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-foreground-subtle"
      />
      <kbd className="hidden items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground-muted sm:inline-flex">
        <CornerDownLeft className="size-3" aria-hidden="true" />
        Enter
      </kbd>
    </div>
  );
};
