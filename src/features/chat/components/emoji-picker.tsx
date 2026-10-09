import { cn } from "cn";
import { EmojiPicker as Frimousse } from "frimousse";
import { SmilePlus } from "lucide-react";
import { useState, type ReactElement, type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useTouchPrimary } from "@/hooks/use-pointer";

/**
 * Emoji data pinned to an exact emojibase-data release (SEC-INF-15): frimousse defaults to `@latest`,
 * which would change (or be swapped) under us. Bump deliberately; the CSP allows this CDN for
 * connect-src only.
 */
const EMOJIBASE_URL = "https://cdn.jsdelivr.net/npm/emojibase-data@17.0.0";

/** Quick reactions offered in the message toolbar. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅"] as const;

/** Full emoji picker (frimousse, Vietnamese labels, searchable, keyboard navigable). */
export const EmojiPickerPanel = ({
  onSelect,
  className,
  autoFocusSearch = true
}: {
  onSelect: (emoji: string) => void;
  className?: string;
  /** Off on touch: focusing the search would raise the keyboard over the picker. */
  autoFocusSearch?: boolean;
}) => (
  <Frimousse.Root
    locale="vi"
    emojibaseUrl={EMOJIBASE_URL}
    columns={8}
    onEmojiSelect={({ emoji }) => onSelect(emoji)}
    className={cn("isolate flex h-[340px] w-[18.5rem] flex-col", className)}
  >
    <Frimousse.Search
      autoFocus={autoFocusSearch}
      placeholder="Tìm biểu cảm…"
      aria-label="Tìm biểu cảm"
      className="mx-2 mt-2 h-8 appearance-none rounded-md border bg-background px-2.5 text-sm outline-none placeholder:text-foreground-subtle focus-visible:ring-2 focus-visible:ring-ring"
    />
    <Frimousse.Viewport className="relative mt-1 flex-1 outline-hidden">
      <Frimousse.Loading className="absolute inset-0 flex items-center justify-center text-foreground-muted">
        <Spinner className="size-4" />
      </Frimousse.Loading>
      <Frimousse.Empty className="absolute inset-0 flex items-center justify-center text-[13px] text-foreground-muted">
        Không tìm thấy biểu cảm
      </Frimousse.Empty>
      <Frimousse.List
        className="pb-1.5 select-none"
        components={{
          CategoryHeader: ({ category, ...props }) => (
            <div
              className="bg-popover px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-foreground-subtle uppercase"
              {...props}
            >
              {category.label}
            </div>
          ),
          Row: ({ children, ...props }) => (
            <div className="scroll-my-1.5 px-1.5" {...props}>
              {children}
            </div>
          ),
          Emoji: ({ emoji, ...props }) => (
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-surface-hover"
              {...props}
            >
              {emoji.emoji}
            </button>
          )
        }}
      />
    </Frimousse.Viewport>
  </Frimousse.Root>
);

/** Button + popover hosting the picker. */
export const EmojiPickerPopover = ({
  onSelect,
  trigger,
  label = "Thêm biểu cảm",
  side = "top",
  align = "end",
  onOpenChange,
  children
}: {
  onSelect: (emoji: string) => void;
  /** Custom trigger element (its content goes in children). */
  trigger?: ReactElement;
  children?: ReactNode;
  label?: string;
  side?: "top" | "bottom";
  align?: "start" | "end";
  onOpenChange?: (open: boolean) => void;
}) => {
  const [open, setOpen] = useState(false);
  const touch = useTouchPrimary();
  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger
        aria-label={label}
        render={
          trigger ?? (
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-surface-hover"
            />
          )
        }
      >
        {children ?? <SmilePlus className="size-4" aria-hidden="true" />}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-auto overflow-hidden p-0">
        {open ? (
          <EmojiPickerPanel
            autoFocusSearch={!touch}
            onSelect={(emoji) => {
              onSelect(emoji);
              change(false);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
