import { cn } from "cn";
import { X } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";
import { useRef, useState } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import type { UserRef } from "@/contracts/work";
import { useDebouncedValue } from "@/features/command/search-api";
import { useSessionContext } from "@/features/auth/hooks";

import { chatErrorMessage } from "../errors";
import { usePeopleSearch } from "../hooks/use-channels";

type PeoplePickerProps = {
  selected: readonly UserRef[];
  onChange: (users: UserRef[]) => void;
  /** People that cannot be picked (already members, the viewer). */
  excludeIds?: ReadonlySet<string>;
  max?: number;
  placeholder?: string;
  autoFocus?: boolean;
  /** Extra hint under the list when `max` is reached. */
  maxHint?: string;
  listClassName?: string;
};

/**
 * Multi-select people search: chips + type-ahead list (↑/↓ to move, Enter to toggle, Backspace on
 * an empty query removes the last chip). Results come from the server directory (never a full list).
 */
export const PeoplePicker = ({
  selected,
  onChange,
  excludeIds,
  max,
  placeholder = "Tìm theo tên hoặc email…",
  autoFocus = false,
  maxHint,
  listClassName
}: PeoplePickerProps) => {
  const session = useSessionContext();
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q, 180);
  const people = usePeopleSearch(debounced);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedIds = new Set(selected.map((user) => user.id));
  const atMax = max !== undefined && selected.length >= max;

  const results = (people.data?.items ?? []).filter(
    (user) => user.id !== session.user.id && !excludeIds?.has(user.id)
  );

  const toggle = (user: UserRef) => {
    if (selectedIds.has(user.id)) {
      onChange(selected.filter((entry) => entry.id !== user.id));
    } else if (!atMax) {
      onChange([...selected, user]);
      setQ("");
    }
    inputRef.current?.focus();
  };

  return (
    <Command shouldFilter={false} loop className="rounded-lg! border bg-background p-0">
      <div className="flex flex-wrap items-center gap-1.5 border-b px-2 py-1.5">
        {selected.map((user) => (
          <span
            key={user.id}
            className="inline-flex h-6 max-w-48 items-center gap-1.5 rounded-full bg-brand-soft py-0.5 pr-1 pl-0.5 text-xs font-medium text-brand-text"
          >
            <UserAvatar user={user} size="xs" />
            <span className="truncate">{user.displayName}</span>
            <button
              type="button"
              aria-label={`Bỏ chọn ${user.displayName}`}
              onClick={() => toggle(user)}
              className="flex size-4 items-center justify-center rounded-full outline-none hover:bg-brand/15 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <CommandPrimitive.Input
          ref={inputRef}
          value={q}
          autoFocus={autoFocus}
          onValueChange={setQ}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && q === "" && selected.length > 0) {
              onChange(selected.slice(0, -1));
            }
          }}
          placeholder={selected.length === 0 ? placeholder : "Thêm người…"}
          aria-label={placeholder}
          className="h-7 min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-subtle"
        />
        {people.isFetching ? <Spinner className="size-3.5 text-foreground-subtle" /> : null}
      </div>
      <CommandList className={cn("max-h-64 p-1", listClassName)}>
        {people.isError ? (
          <p className="px-3 py-6 text-center text-[13px] text-foreground-muted" role="alert">
            {chatErrorMessage(people.error)}
          </p>
        ) : (
          <CommandEmpty className="py-6 text-[13px] text-foreground-muted">
            {people.isPending ? "Đang tải…" : "Không tìm thấy người phù hợp."}
          </CommandEmpty>
        )}
        {results.map((user) => {
          const checked = selectedIds.has(user.id);
          return (
            <CommandItem
              key={user.id}
              value={user.id}
              data-checked={checked}
              disabled={!checked && atMax}
              onSelect={() => toggle(user)}
              className="gap-2.5 py-1.5"
            >
              <UserAvatar user={user} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium">{user.displayName}</span>
                {user.email ? (
                  <span className="truncate text-xs text-foreground-muted">{user.email}</span>
                ) : null}
              </span>
            </CommandItem>
          );
        })}
      </CommandList>
      {atMax && maxHint ? (
        <p className="border-t px-3 py-2 text-xs text-foreground-muted">{maxHint}</p>
      ) : null}
    </Command>
  );
};
