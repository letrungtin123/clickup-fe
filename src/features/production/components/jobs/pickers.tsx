import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

import { matchesQuery } from "../../catalog";
import type { Person } from "../../people";
import { touchTargets } from "../../ui";

const NONE = "__none__";

/** Lists longer than this get a search box (owner, 2026-10-15: "Dự án" had to be scrolled). */
export const SEARCHABLE_FROM = 10;

/** The select trigger look, shared by the searchable pickers (same height / border / dark mode as SelectTrigger). */
export const triggerClass =
  "flex w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 pointer-coarse:h-10 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

/** Person select (avatars) for assignee / QC / leader pickers. */
export const PersonSelect = ({
  people,
  value,
  onChange,
  placeholder = "Chọn người",
  noneLabel,
  invalid,
  disabled,
  id,
  size = "default",
  className,
  badges,
  "aria-label": label
}: {
  people: readonly Person[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** Adds a "none" choice with this label (e.g. a disabled "Task Checking — không có QC"). */
  noneLabel?: string | undefined;
  /** A short note shown after some people in the list (PD-079: "phụ trách Project"), by person id. */
  badges?: ReadonlyMap<string, string> | undefined;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  "aria-label"?: string;
}) => {
  const items = [
    ...(noneLabel ? [{ value: NONE, label: noneLabel }] : []),
    ...people.map((person) => ({ value: person.id, label: person.displayName }))
  ];
  const selected = people.find((person) => person.id === value) ?? null;
  return (
    <Select
      items={items}
      value={value ?? (noneLabel ? NONE : null)}
      onValueChange={(next: string | null) => onChange(!next || next === NONE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        className={cn("w-full min-w-0", className)}
        aria-invalid={invalid}
        aria-label={label}
      >
        <SelectValue>
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <UserAvatar user={selected} size="xs" />
              <span className="truncate">{selected.displayName}</span>
            </span>
          ) : (
            <span className="truncate text-muted-foreground">
              {value === null && noneLabel ? noneLabel : placeholder}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {noneLabel ? (
          <SelectItem value={NONE}>
            <span className="text-foreground-muted">{noneLabel}</span>
          </SelectItem>
        ) : null}
        {people.map((person) => (
          <SelectItem key={person.id} value={person.id}>
            <UserAvatar user={person} size="xs" />
            <span className="truncate">{person.displayName}</span>
            {badges?.get(person.id) ? (
              <span className="ml-auto pl-3 text-[11px] whitespace-nowrap text-foreground-subtle">
                {badges.get(person.id)}
              </span>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

type Option = { id: string; label: string; hint?: string | null | undefined };

/**
 * Simple id/name select (projects, processes, shifts, statuses, tags). A long list (from SEARCHABLE_FROM options, e.g.
 * every "Dự án") opens with a search box instead (accents and case ignored, matches the label and the hint).
 */
export const OptionSelect = ({
  options,
  value,
  onChange,
  placeholder,
  noneLabel,
  invalid,
  disabled,
  id,
  size = "default",
  className,
  searchable,
  searchPlaceholder = "Tìm…",
  "aria-label": label
}: {
  options: readonly Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  noneLabel?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  /** Force the search box on / off; default: on from SEARCHABLE_FROM options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  "aria-label"?: string;
}) => {
  if (searchable ?? options.length >= SEARCHABLE_FROM) {
    return (
      <SearchableOptionSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        noneLabel={noneLabel}
        invalid={invalid}
        disabled={disabled}
        id={id}
        size={size}
        className={className}
        searchPlaceholder={searchPlaceholder}
        aria-label={label}
      />
    );
  }
  const items = [
    ...(noneLabel ? [{ value: NONE, label: noneLabel }] : []),
    ...options.map((option) => ({ value: option.id, label: option.label }))
  ];
  const selected = options.find((option) => option.id === value);
  return (
    <Select
      items={items}
      value={value ?? (noneLabel ? NONE : null)}
      onValueChange={(next: string | null) => onChange(!next || next === NONE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        className={cn("w-full min-w-0", className)}
        aria-invalid={invalid}
        aria-label={label}
      >
        <SelectValue>
          {selected ? (
            <span className="truncate">{selected.label}</span>
          ) : (
            <span className="truncate text-muted-foreground">
              {value === null && noneLabel ? noneLabel : placeholder}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      {/* Narrow filter triggers (w-32/w-40): the list may grow to show the label and its hint. */}
      <SelectContent className="max-h-72 w-auto max-w-[min(20rem,var(--available-width))] min-w-(--anchor-width)">
        {noneLabel ? (
          <SelectItem value={NONE}>
            <span className="text-foreground-muted">{noneLabel}</span>
          </SelectItem>
        ) : null}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span className="truncate">{option.label}</span>
            {option.hint ? (
              <span className="ml-auto pl-3 text-xs text-foreground-subtle">{option.hint}</span>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/** OptionSelect's long-list variant: a select-looking trigger opening a searchable list (Popover + Command). */
const SearchableOptionSelect = ({
  options,
  value,
  onChange,
  placeholder,
  noneLabel,
  invalid,
  disabled,
  id,
  size,
  className,
  searchPlaceholder,
  "aria-label": label
}: {
  options: readonly Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  noneLabel?: string | undefined;
  invalid?: boolean | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  size: "sm" | "default";
  className?: string | undefined;
  searchPlaceholder: string;
  "aria-label"?: string | undefined;
}) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const selected = options.find((option) => option.id === value) ?? null;
  const visible = options.filter((option) =>
    matchesQuery(term, option.label, option.hint ?? undefined)
  );
  const pick = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setTerm("");
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTerm("");
      }}
    >
      <PopoverTrigger
        id={id}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid}
        aria-label={label}
        data-slot="select-trigger"
        data-size={size}
        className={cn(triggerClass, size === "sm" ? "h-7" : "h-8", className)}
      >
        <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : value === null && noneLabel ? noneLabel : placeholder}
        </span>
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "w-(--anchor-width) min-w-64 max-w-[calc(100vw-2rem)] gap-0 p-0",
          touchTargets
        )}
      >
        <Command shouldFilter={false} loop>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder.replace(/…$/, "")}
            autoFocus
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Không tìm thấy.</CommandEmpty>
            <CommandGroup>
              {noneLabel && term.trim() === "" ? (
                <CommandItem value={NONE} data-checked={value === null} onSelect={() => pick(null)}>
                  <span className="text-foreground-muted">{noneLabel}</span>
                </CommandItem>
              ) : null}
              {visible.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  data-checked={option.id === value}
                  onSelect={() => pick(option.id)}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="ml-auto pl-3 text-xs text-foreground-subtle">
                      {option.hint}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Searchable person filter (job list "Mọi nhân viên"): looks like the other filter selects, the list
 * has a search box (name or e-mail, accents ignored) since a company has many more staff than leaders.
 */
export const PersonFilterPicker = ({
  people,
  value,
  onChange,
  noneLabel,
  className,
  "aria-label": label
}: {
  people: readonly Person[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** The "no filter" choice, e.g. "Mọi nhân viên". */
  noneLabel: string;
  className?: string;
  "aria-label"?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const selected = people.find((person) => person.id === value) ?? null;
  const visible = people.filter((person) => matchesQuery(term, person.displayName, person.email));
  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setTerm("");
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTerm("");
      }}
    >
      <PopoverTrigger
        data-slot="select-trigger"
        data-size="default"
        aria-label={label}
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10 dark:bg-input/30 dark:hover:bg-input/50",
          className
        )}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar user={selected} size="xs" />
            <span className="truncate">{selected.displayName}</span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">
            {value ? "Nhân viên đã chọn" : noneLabel}
          </span>
        )}
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-64 max-w-[calc(100vw-2rem)] gap-0 p-0", touchTargets)}
      >
        <Command shouldFilter={false} loop>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Tìm nhân viên…"
            aria-label="Tìm nhân viên"
            autoFocus
          />
          <CommandList>
            <CommandEmpty>Không tìm thấy ai.</CommandEmpty>
            <CommandGroup>
              {term.trim() === "" ? (
                <CommandItem value={NONE} data-checked={value === null} onSelect={() => pick(null)}>
                  <span className="text-foreground-muted">{noneLabel}</span>
                </CommandItem>
              ) : null}
              {visible.map((person) => (
                <CommandItem
                  key={person.id}
                  value={person.id}
                  data-checked={person.id === value}
                  onSelect={() => pick(person.id)}
                >
                  <UserAvatar user={person} size="xs" />
                  <span className="min-w-0 truncate">{person.displayName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
