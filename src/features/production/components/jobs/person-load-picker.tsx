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

import { matchesQuery } from "../../catalog";
import type { Person } from "../../people";
import { touchTargets } from "../../ui";
import { triggerClass } from "./pickers";

/** What the picker shows next to a name (PD-080 team load); absent = the name only. */
export type PersonLoadInfo = {
  /** "Rảnh", "20 AXP - 5 BRX", "+2 task chưa có SL". */
  load: string;
  /** "Nghỉ cả ngày" / "Nghỉ sáng" / "Nghỉ chiều", or null. */
  leave: string | null;
  /** On leave now / all day: greyed and not selectable. */
  unavailable: boolean;
};

/**
 * PD-080 "Nhân viên thực hiện" of "Chia task": a searchable person picker (type a name or e-mail, accents ignored) showing
 * each person's load ("Tên · Rảnh", "Tên · 20 AXP - 5 BRX"); people on leave are greyed with their leave and cannot be
 * picked (they move to the end of the list). Without load data it lists the names only. Looks like the other selects
 * (role combobox, id on the trigger so a FieldLabel names it).
 */
export const PersonLoadPicker = ({
  id,
  people,
  infoOf,
  value,
  onChange,
  placeholder = "Chọn nhân viên",
  invalid,
  disabled,
  className
}: {
  id?: string;
  people: readonly Person[];
  infoOf?: ((personId: string) => PersonLoadInfo | null) | undefined;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const selected = people.find((person) => person.id === value) ?? null;
  const selectedInfo = selected ? (infoOf?.(selected.id) ?? null) : null;
  const visible = people
    .filter((person) => matchesQuery(term, person.displayName, person.email))
    .map((person) => ({ person, info: infoOf?.(person.id) ?? null }))
    // Available people first; the list order is kept otherwise.
    .sort((a, b) => Number(a.info?.unavailable ?? false) - Number(b.info?.unavailable ?? false));
  const pick = (next: string) => {
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
        data-slot="select-trigger"
        data-size="default"
        className={cn(triggerClass, "h-8", className)}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar user={selected} size="xs" />
            <span className="truncate">{selected.displayName}</span>
            {selectedInfo ? (
              <span
                className={cn(
                  "truncate text-xs text-foreground-subtle",
                  selectedInfo.unavailable && "text-warning"
                )}
              >
                · {selectedInfo.unavailable ? selectedInfo.leave : selectedInfo.load}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "w-(--anchor-width) max-w-[calc(100vw-2rem)] min-w-72 gap-0 p-0",
          touchTargets
        )}
      >
        <Command shouldFilter={false} loop>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Gõ tên để tìm…"
            aria-label="Tìm nhân viên"
            autoFocus
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Không tìm thấy ai.</CommandEmpty>
            <CommandGroup>
              {visible.map(({ person, info }) => (
                <CommandItem
                  key={person.id}
                  value={person.id}
                  disabled={info?.unavailable ?? false}
                  data-checked={person.id === value}
                  onSelect={() => pick(person.id)}
                >
                  <UserAvatar user={person} size="xs" />
                  <span className="min-w-0 truncate">
                    {person.displayName}
                    {info ? (
                      <span
                        className={cn(
                          "text-foreground-subtle",
                          info.load === "Rảnh" && !info.unavailable && "text-success"
                        )}
                      >
                        {" "}
                        · {info.load}
                      </span>
                    ) : null}
                  </span>
                  {info?.leave ? (
                    <span className="ml-auto shrink-0 pl-2 text-[11px] font-medium whitespace-nowrap text-warning">
                      {info.leave}
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
