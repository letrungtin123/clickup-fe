import { cn } from "cn";

import { UserAvatar } from "@/components/shared/user-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

import type { Person } from "../../people";

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
      <SelectContent className="max-h-72">
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
