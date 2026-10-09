import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { CustomField, CustomValues } from "@/contracts/production-catalog";
import { toneClass } from "@/lib/colors";

import { foldText } from "../catalog";
import { formatCustomValue, isEmptyValue, type CustomValue } from "../custom-fields";
import type { CustomFieldOption } from "../types";
import { DateField } from "./date-field";

/**
 * Shared custom-field editors (SPEC Phase 1 §5: <CustomFieldsForm>, <CustomFieldsColumns>). Values
 * stay loosely typed while editing (numbers as typed text); `toCustomValuesPayload` normalizes them
 * before sending and the API validates again. Reused by jobs and tasks in later phases.
 */

const NONE = "__none__";

const OptionChip = ({ option }: { option: CustomFieldOption }) => (
  <span
    className={cn(
      toneClass(option.color ?? "gray"),
      "inline-flex h-5 max-w-40 items-center gap-1 rounded-md bg-(--tone-soft) px-1.5 text-[11px] font-medium text-(--tone-text)"
    )}
  >
    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tone)" />
    <span className="truncate">{option.label}</span>
  </span>
);

type CustomFieldInputProps = {
  field: CustomField;
  value: CustomValue | undefined;
  onChange: (value: CustomValue) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean | undefined;
  /** Organization "today" for the date picker shortcut. */
  today?: string | undefined;
};

/** One input for one field, chosen by type. */
export const CustomFieldInput = ({
  field,
  value,
  onChange,
  id,
  invalid = false,
  disabled,
  today
}: CustomFieldInputProps) => {
  switch (field.type) {
    case "NUMBER":
      return (
        <Input
          id={id}
          inputMode="decimal"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          disabled={disabled}
          className="tabular-nums"
        />
      );
    case "DATE":
      return (
        <DateField
          id={id}
          value={typeof value === "string" && value ? value : null}
          onChange={(day) => onChange(day)}
          clearable
          today={today}
          disabled={disabled}
          aria-invalid={invalid}
        />
      );
    case "SELECT": {
      const items = [
        { value: NONE, label: "Không chọn" },
        ...field.options.map((option) => ({ value: option.value, label: option.label }))
      ];
      const current = typeof value === "string" && value ? value : NONE;
      const selected = field.options.find((option) => option.value === current);
      return (
        <Select
          items={items}
          value={current}
          onValueChange={(next: string | null) => onChange(!next || next === NONE ? null : next)}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
            <SelectValue>
              {selected ? (
                <OptionChip option={selected} />
              ) : (
                <span className="text-muted-foreground">Chọn…</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              <span className="text-foreground-muted">Không chọn</span>
            </SelectItem>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <OptionChip option={option} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "MULTISELECT":
      return (
        <MultiSelectInput
          id={id}
          field={field}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          invalid={invalid}
          disabled={disabled}
        />
      );
    default:
      return (
        <Input
          id={id}
          value={
            typeof value === "string"
              ? value
              : value === null || value === undefined
                ? ""
                : String(value)
          }
          maxLength={2000}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          disabled={disabled}
        />
      );
  }
};

const MultiSelectInput = ({
  id,
  field,
  value,
  onChange,
  invalid,
  disabled
}: {
  id?: string | undefined;
  field: CustomField;
  value: readonly string[];
  onChange: (value: string[]) => void;
  invalid: boolean;
  disabled?: boolean | undefined;
}) => {
  const [query, setQuery] = useState("");
  const selected = new Set(value);
  const q = foldText(query);
  const options = q
    ? field.options.filter((option) => foldText(option.label).includes(q))
    : field.options;
  const chosen = field.options.filter((option) => selected.has(option.value));
  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-invalid={invalid}
        className={cn(
          "flex min-h-8 w-full items-center gap-1 rounded-lg border border-input px-2 py-1 text-left text-sm outline-none transition-colors hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30",
          invalid && "border-destructive"
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {chosen.length > 0 ? (
            chosen.map((option) => <OptionChip key={option.value} option={option} />)
          ) : (
            <span className="text-muted-foreground">Chọn…</span>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command shouldFilter={false} loop>
          <CommandInput
            placeholder="Tìm lựa chọn…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>Không có lựa chọn phù hợp.</CommandEmpty>
            {options.length > 0 ? (
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    data-checked={selected.has(option.value)}
                    onSelect={() =>
                      onChange(
                        selected.has(option.value)
                          ? value.filter((item) => item !== option.value)
                          : [...value, option.value]
                      )
                    }
                  >
                    <OptionChip option={option} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

type CustomFieldsFormProps = {
  /** Active fields of one entity, in display order (see `fieldsFor`). */
  fields: readonly CustomField[];
  values: CustomValues;
  onChange: (values: CustomValues) => void;
  errors?: Record<string, string>;
  disabled?: boolean | undefined;
  idPrefix: string;
  today?: string | undefined;
  className?: string;
};

/** Labelled grid of custom-field inputs for one record. Renders nothing when there are no fields. */
export const CustomFieldsForm = ({
  fields,
  values,
  onChange,
  errors = {},
  disabled,
  idPrefix,
  today,
  className
}: CustomFieldsFormProps) => {
  if (fields.length === 0) return null;
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {fields.map((field) => {
        const id = `${idPrefix}-cf-${field.key}`;
        const error = errors[field.key];
        return (
          <Field
            key={field.id}
            data-invalid={Boolean(error)}
            className={cn(field.type === "TEXT" && "sm:col-span-2")}
          >
            <FieldLabel htmlFor={id}>
              {field.label}
              {field.required ? (
                <span className="text-danger" aria-label="bắt buộc">
                  *
                </span>
              ) : null}
            </FieldLabel>
            <CustomFieldInput
              id={id}
              field={field}
              value={values[field.key]}
              onChange={(value) => onChange({ ...values, [field.key]: value })}
              invalid={Boolean(error)}
              disabled={disabled}
              today={today}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        );
      })}
    </div>
  );
};

/** Read-only value for table cells (SELECT / MULTISELECT as colored chips). */
export const CustomFieldValue = ({
  field,
  value,
  className
}: {
  field: CustomField;
  value: CustomValue | undefined;
  className?: string;
}) => {
  if (isEmptyValue(value)) {
    return <span className={cn("text-foreground-subtle", className)}>—</span>;
  }
  if (field.type === "SELECT" || field.type === "MULTISELECT") {
    const values = Array.isArray(value) ? value : [String(value)];
    return (
      <span className={cn("flex min-w-0 flex-wrap gap-1", className)}>
        {values.map((item) => {
          const option = field.options.find((candidate) => candidate.value === item) ?? {
            value: item,
            label: item
          };
          return <OptionChip key={item} option={option} />;
        })}
      </span>
    );
  }
  return (
    <span className={cn("truncate", field.type === "NUMBER" && "tabular-nums", className)}>
      {formatCustomValue(field, value)}
    </span>
  );
};
