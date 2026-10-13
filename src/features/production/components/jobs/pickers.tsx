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
  "aria-label": label
}: {
  people: readonly Person[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** Adds a "none" choice with this label (e.g. "Chưa gán QC"). */
  noneLabel?: string;
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
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/** Simple id/name select (projects, processes, shifts, statuses, tags). */
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
  "aria-label": label
}: {
  options: readonly { id: string; label: string; hint?: string | null | undefined }[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  noneLabel?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  "aria-label"?: string;
}) => {
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
