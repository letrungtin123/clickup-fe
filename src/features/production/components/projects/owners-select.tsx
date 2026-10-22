import { cn } from "cn";
import { Lock, Plus, X } from "lucide-react";
import { useState } from "react";

import { UserAvatar, type AvatarUser } from "@/components/shared/user-avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { foldText } from "../../catalog";

/**
 * PD-079 — the owners ("Người phụ trách") of a Project, several at once (the organization superadmin's picker): the chosen
 * people as removable chips in order (the first is shown first and pre-filled as a job's Leader), "+ Thêm" opens a
 * searchable list of the candidates (members holding LEADER or ADMIN) to tick.
 */
export const OwnersMultiSelect = ({
  id,
  candidates,
  value,
  onChange,
  invalid,
  disabled
}: {
  id?: string;
  candidates: readonly AvatarUser[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  invalid?: boolean;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = new Set(value);
  const byId = new Map(candidates.map((person) => [person.id, person]));
  const q = foldText(query);
  const filtered = q
    ? candidates.filter((person) => foldText(person.displayName).includes(q))
    : candidates;
  const toggle = (personId: string) =>
    onChange(
      selected.has(personId) ? value.filter((item) => item !== personId) : [...value, personId]
    );

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-input px-1.5 py-1 dark:bg-input/30",
        invalid && "border-destructive ring-3 ring-destructive/20"
      )}
    >
      {value.map((personId, index) => {
        const person = byId.get(personId) ?? { id: personId, displayName: "…" };
        return (
          <span
            key={personId}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-1 text-xs"
          >
            <UserAvatar user={person} size="xs" />
            <span className="truncate">{person.displayName}</span>
            {index === 0 && value.length > 1 ? (
              <span className="text-[10px] text-foreground-subtle">chính</span>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => toggle(personId)}
              aria-label={`Bỏ ${person.displayName}`}
              className="rounded p-0.5 text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        );
      })}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          id={id}
          disabled={disabled}
          aria-label="Thêm người phụ trách"
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <Plus className="size-3" aria-hidden="true" />
          {value.length === 0 ? "Chọn người phụ trách" : "Thêm"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command shouldFilter={false} loop>
            <CommandInput
              placeholder="Tìm Leader, Quản trị…"
              value={query}
              onValueChange={setQuery}
              autoFocus
            />
            <CommandList>
              <CommandEmpty>Không có người phù hợp.</CommandEmpty>
              {filtered.length > 0 ? (
                <CommandGroup>
                  {filtered.map((person) => (
                    <CommandItem
                      key={person.id}
                      value={person.id}
                      data-checked={selected.has(person.id)}
                      onSelect={() => toggle(person.id)}
                    >
                      <UserAvatar user={person} size="xs" />
                      <span className="truncate">{person.displayName}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

/** The owners shown read-only (avatars, names), with the reason they cannot be changed here. */
export const OwnersDisplay = ({
  owners,
  note
}: {
  owners: readonly AvatarUser[];
  note: string;
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-sm">
      {owners.length > 0 ? (
        owners.map((owner) => (
          <span key={owner.id} className="inline-flex min-w-0 items-center gap-1.5">
            <UserAvatar user={owner} size="xs" />
            <span className="truncate">{owner.displayName}</span>
          </span>
        ))
      ) : (
        <span className="min-w-0 flex-1 truncate text-foreground-muted">
          Chưa có người phụ trách
        </span>
      )}
      <Lock aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-foreground-subtle" />
    </div>
    <p className="text-xs text-foreground-muted">{note}</p>
  </div>
);
