import { cn } from "cn";
import { Plus, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { knowledgeLimits } from "@/contracts/knowledge";
import { foldText } from "@/features/search/model";

import { cleanTag } from "../model/tags";

/**
 * Tags of an item (max 10): type and press Enter or comma; suggestions are the tags already used in the
 * space (most used first). Backspace on an empty field removes the last tag.
 */
export const TagInput = ({
  value,
  onChange,
  suggestions,
  id,
  disabled
}: {
  value: readonly string[];
  onChange: (tags: string[]) => void;
  suggestions: readonly { name: string; count: number }[];
  id?: string;
  disabled?: boolean;
}) => {
  const listId = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const [term, setTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const full = value.length >= knowledgeLimits.tagsPerItem;
  const lower = useMemo(() => new Set(value.map((tag) => tag.toLocaleLowerCase("vi"))), [value]);

  const matches = useMemo(() => {
    const needle = foldText(term.trim());
    return suggestions
      .filter((tag) => !lower.has(tag.name.toLocaleLowerCase("vi")))
      .filter((tag) => !needle || foldText(tag.name).includes(needle))
      .slice(0, 6);
  }, [lower, suggestions, term]);

  const add = (raw: string) => {
    const tag = cleanTag(raw);
    setTerm("");
    setActive(0);
    if (!tag || full || lower.has(tag.toLocaleLowerCase("vi"))) return;
    onChange([...value, tag]);
  };

  const open = focused && !full && (matches.length > 0 || term.trim().length > 0);

  return (
    <div className="relative">
      <div
        onClick={() => input.current?.focus()}
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5 shadow-xs transition-[border-color,box-shadow] pointer-coarse:min-h-10",
          focused && "border-ring ring-3 ring-ring/30",
          disabled && "opacity-60"
        )}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-md bg-muted pr-0.5 pl-2 text-xs pointer-coarse:h-8">
            <span className="truncate">#{tag}</span>
            <button
              type="button"
              aria-label={`Bỏ tag ${tag}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onChange(value.filter((entry) => entry !== tag));
              }}
              className="flex size-5 shrink-0 items-center justify-center rounded text-foreground-subtle outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-7"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={id}
          value={term}
          disabled={disabled || full}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Thêm tag"
          placeholder={full ? `Tối đa ${knowledgeLimits.tagsPerItem} tag` : value.length === 0 ? "Thêm tag, Enter để thêm" : "Thêm tag…"}
          maxLength={knowledgeLimits.tagLength + 5}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (term.trim()) add(term);
          }}
          onChange={(event) => {
            const next = event.target.value;
            if (/[,#]/.test(next)) {
              add(next);
              return;
            }
            setTerm(next);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const pick = matches[active];
              add(pick && !term.trim() ? pick.name : pick && foldText(pick.name) === foldText(term.trim()) ? pick.name : term || (pick?.name ?? ""));
            } else if (event.key === "ArrowDown" && matches.length > 0) {
              event.preventDefault();
              setActive((index) => (index + 1) % matches.length);
            } else if (event.key === "ArrowUp" && matches.length > 0) {
              event.preventDefault();
              setActive((index) => (index - 1 + matches.length) % matches.length);
            } else if (event.key === "Tab" && open && matches[active] && term.trim()) {
              event.preventDefault();
              add(matches[active].name);
            } else if (event.key === "Backspace" && !term && value.length > 0) {
              onChange(value.slice(0, -1));
            } else if (event.key === "Escape") {
              setTerm("");
            }
          }}
          className="h-6 min-w-24 flex-1 bg-transparent text-[13px] outline-none placeholder:text-foreground-subtle disabled:cursor-not-allowed pointer-coarse:h-8"
        />
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Gợi ý tag"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
        >
          {term.trim() && !matches.some((tag) => foldText(tag.name) === foldText(term.trim())) ? (
            <li
              role="option"
              aria-selected={matches.length === 0}
              onMouseDown={(event) => {
                event.preventDefault();
                add(term);
              }}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] hover:bg-surface-hover pointer-coarse:h-10"
            >
              <Plus className="size-3.5 text-foreground-subtle" aria-hidden="true" />
              Thêm “{cleanTag(term)}”
            </li>
          ) : null}
          {matches.map((tag, index) => (
            <li
              key={tag.name}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                add(tag.name);
              }}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] hover:bg-surface-hover pointer-coarse:h-10",
                index === active && "bg-surface-hover"
              )}
            >
              <span className="min-w-0 flex-1 truncate">#{tag.name}</span>
              <span className="text-[11px] text-foreground-subtle tabular-nums">{tag.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
