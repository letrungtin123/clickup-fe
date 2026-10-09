import { cn } from "cn";
import { Plus, Tag as TagIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toneClass } from "@/lib/colors";

import { foldText } from "../catalog";
import type { Tag } from "../types";

export const TagChip = ({
  tag,
  className
}: {
  tag: Pick<Tag, "name" | "color" | "active">;
  className?: string;
}) => (
  <span
    className={cn(
      toneClass(tag.color),
      "inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded-md bg-(--tone-soft) px-1.5 text-[11px] font-medium text-(--tone-text)",
      !tag.active && "opacity-60",
      className
    )}
    title={tag.active ? tag.name : `${tag.name} (đã lưu trữ)`}
  >
    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tone)" />
    <span className="truncate">{tag.name}</span>
  </span>
);

/** Read-only list of the tags behind `tagIds` (unknown ids are skipped). */
export const TagChips = ({
  tags,
  tagIds,
  max = 3,
  className
}: {
  tags: readonly Tag[];
  tagIds: readonly string[];
  max?: number;
  className?: string;
}) => {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const selected = tagIds.flatMap((id) => {
    const tag = byId.get(id);
    return tag ? [tag] : [];
  });
  if (selected.length === 0) return null;
  const rest = selected.length - max;
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {selected.slice(0, max).map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
      {rest > 0 ? (
        <span
          className="text-[11px] text-foreground-muted"
          title={selected
            .slice(max)
            .map((tag) => tag.name)
            .join(", ")}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
};

type TagPickerProps = {
  tags: readonly Tag[];
  value: readonly string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
  /** Compact trigger for table cells. */
  variant?: "field" | "cell";
  "aria-label"?: string;
  className?: string;
};

/**
 * Multi-tag picker (SPEC Phase 1 §5 <TagPicker>): searchable list of active tags; archived tags
 * already on the record stay listed so they can be removed.
 */
export const TagPicker = ({
  tags,
  value,
  onChange,
  disabled,
  variant = "field",
  className,
  ...aria
}: TagPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = new Set(value);
  const choices = tags.filter((tag) => tag.active || selected.has(tag.id));
  const q = foldText(query);
  const filtered = q ? choices.filter((tag) => foldText(tag.name).includes(q)) : choices;
  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        aria-label={aria["aria-label"] ?? "Chọn tag"}
        className={cn(
          "flex min-w-0 items-center gap-1 rounded-lg text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
          variant === "field"
            ? "min-h-8 w-full flex-wrap border border-input px-2 py-1 hover:border-border-strong dark:bg-input/30"
            : "min-h-7 w-full flex-wrap px-1 py-0.5 hover:bg-surface-hover",
          className
        )}
      >
        {value.length > 0 ? (
          <TagChips tags={tags} tagIds={value} max={variant === "cell" ? 2 : 8} />
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-foreground-subtle">
            {variant === "cell" ? (
              <Plus className="size-3" aria-hidden="true" />
            ) : (
              <TagIcon className="size-3.5" aria-hidden="true" />
            )}
            {variant === "cell" ? "Tag" : "Chọn tag"}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command shouldFilter={false} loop>
          <CommandInput placeholder="Tìm tag…" value={query} onValueChange={setQuery} autoFocus />
          <CommandList>
            <CommandEmpty>
              {choices.length === 0
                ? "Chưa có tag nào. Quản trị tạo tag trong Cấu hình."
                : "Không có tag phù hợp."}
            </CommandEmpty>
            {filtered.length > 0 ? (
              <CommandGroup>
                {filtered.map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={tag.id}
                    data-checked={selected.has(tag.id)}
                    onSelect={() => toggle(tag.id)}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        toneClass(tag.color),
                        "size-2 shrink-0 rounded-full bg-(--tone)"
                      )}
                    />
                    <span className="truncate">{tag.name}</span>
                    {!tag.active ? (
                      <span className="text-xs text-foreground-subtle">đã lưu trữ</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
        {value.length > 0 ? (
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-foreground-muted"
              onClick={() => onChange([])}
            >
              Bỏ chọn tất cả
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
