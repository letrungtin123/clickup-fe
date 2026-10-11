import { cn } from "cn";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  FilterX,
  ListFilter,
  Plus,
  Tag as TagIcon,
  X
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import type { CustomField, CustomValues } from "@/contracts/production-catalog";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { toneClass } from "@/lib/colors";

import {
  customFieldTypeLabels,
  formatCustomValue,
  isEmptyValue,
  isOptionType
} from "../custom-fields";
import {
  activeFieldFilters,
  activeListFilterCount,
  describeFieldFilter,
  EMPTY_FILTER_VALUE,
  emptyFieldFilter,
  emptyListFilters,
  isFieldFilterActive,
  withFieldFilter,
  type FieldFilter,
  type ListFilters
} from "../list-filters";
import type { Tag } from "../types";
import { touchTargets } from "../ui";
import { DateField } from "./date-field";

/**
 * Custom-field columns / chips and the tag + custom-field filters of the production lists (PLAN §8:
 * "trường hiện trong form, bảng và bộ lọc"). Desktop and tablet get a row of filter chips ("Ưu tiên:
 * Gấp ×") with a "Lọc thêm" picker; phones get the same editors stacked inside a bottom sheet.
 */

// Chips on cards ------------------------------------------------------------------------------------------------

/**
 * "Label: value" chips for cards (phones, card lists) — the fields marked "hiện trong bảng" that
 * have a value. Option values keep their colour dot.
 */
export const CustomFieldChips = ({
  fields,
  values,
  max = 4,
  className
}: {
  /** Active fields of the entity (fieldsFor); only `showInTable` ones are shown. */
  fields: readonly CustomField[];
  values: CustomValues;
  max?: number;
  className?: string;
}) => {
  const shown = fields.filter((field) => field.showInTable && !isEmptyValue(values[field.key]));
  if (shown.length === 0) return null;
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {shown.slice(0, max).map((field) => {
        const value = values[field.key];
        const option =
          field.type === "SELECT" && typeof value === "string"
            ? field.options.find((item) => item.value === value)
            : undefined;
        const text = formatCustomValue(field, value);
        return (
          <span
            key={field.id}
            title={`${field.label}: ${text}`}
            className={cn(
              toneClass(option?.color ?? "gray"),
              "inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 text-[11px]"
            )}
          >
            {option?.color ? (
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tone)" />
            ) : null}
            <span className="shrink-0 text-foreground-muted">{field.label}:</span>
            <span className="truncate font-medium text-foreground">{text}</span>
          </span>
        );
      })}
      {shown.length > max ? (
        <span className="text-[11px] text-foreground-muted">+{shown.length - max}</span>
      ) : null}
    </span>
  );
};

// Editors -------------------------------------------------------------------------------------------------------

const ToggleChip = ({
  pressed,
  onClick,
  children,
  className
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    className={cn(
      "inline-flex h-7 max-w-full min-w-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
      pressed
        ? "border-transparent bg-brand-soft text-brand-text"
        : "bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground",
      className
    )}
  >
    {pressed ? <Check className="size-3 shrink-0" aria-hidden="true" /> : null}
    <span className="truncate">{children}</span>
  </button>
);

/** Text kept locally while typing; committed after a short pause (one request per pause). */
const useDraft = (value: string, commit: (next: string) => void, delay = 400) => {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // The URL changed from elsewhere (cleared, back button): show it.
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  useEffect(() => {
    if (draft === value) return undefined;
    const timer = window.setTimeout(() => commit(draft), delay);
    return () => window.clearTimeout(timer);
  }, [draft, value, commit, delay]);
  return [draft, setDraft] as const;
};

const toggleValue = (values: readonly string[], value: string) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

/** Editor of one field's filter, by type. "Chưa có" matches records without a value. */
export const FieldFilterEditor = ({
  field,
  filter = emptyFieldFilter,
  onChange,
  today
}: {
  field: CustomField;
  filter?: FieldFilter | undefined;
  onChange: (next: FieldFilter) => void;
  today?: string | undefined;
}) => {
  const empty = filter.values.includes(EMPTY_FILTER_VALUE);
  const emptyChip = (
    <ToggleChip
      pressed={empty}
      onClick={() =>
        onChange({ ...filter, values: toggleValue(filter.values, EMPTY_FILTER_VALUE) })
      }
    >
      Chưa có
    </ToggleChip>
  );

  if (isOptionType(field.type)) {
    return (
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={field.label}>
        {field.options.map((option) => (
          <ToggleChip
            key={option.value}
            pressed={filter.values.includes(option.value)}
            onClick={() =>
              onChange({ ...filter, values: toggleValue(filter.values, option.value) })
            }
          >
            <span
              className={cn(toneClass(option.color ?? "gray"), "inline-flex items-center gap-1")}
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-(--tone)" />
              {option.label}
            </span>
          </ToggleChip>
        ))}
        {emptyChip}
      </div>
    );
  }
  if (field.type === "TEXT") {
    return <TextFilter field={field} filter={filter} onChange={onChange} emptyChip={emptyChip} />;
  }
  if (field.type === "NUMBER") {
    return <NumberFilter field={field} filter={filter} onChange={onChange} emptyChip={emptyChip} />;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <DateField
          value={filter.from}
          onChange={(from) => onChange({ ...filter, from })}
          placeholder="Từ ngày"
          clearable
          today={today}
          aria-label={`${field.label} từ ngày`}
          className="min-w-0 flex-1"
        />
        <span aria-hidden="true" className="text-foreground-subtle">
          –
        </span>
        <DateField
          value={filter.to}
          onChange={(to) => onChange({ ...filter, to })}
          placeholder="Đến ngày"
          clearable
          today={today}
          aria-label={`${field.label} đến ngày`}
          className="min-w-0 flex-1"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">{emptyChip}</div>
    </div>
  );
};

type TypedEditorProps = {
  field: CustomField;
  filter: FieldFilter;
  onChange: (next: FieldFilter) => void;
  emptyChip: ReactNode;
};

const TextFilter = ({ field, filter, onChange, emptyChip }: TypedEditorProps) => {
  const text = filter.values.find((value) => value !== EMPTY_FILTER_VALUE) ?? "";
  const empty = filter.values.includes(EMPTY_FILTER_VALUE);
  const [draft, setDraft] = useDraft(text, (next) =>
    onChange({
      ...filter,
      values: [...(next.trim() ? [next.trim()] : []), ...(empty ? [EMPTY_FILTER_VALUE] : [])]
    })
  );
  return (
    <div className="flex flex-col gap-2">
      <Input
        value={draft}
        maxLength={200}
        placeholder="Chứa…"
        aria-label={`${field.label} chứa`}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">{emptyChip}</div>
    </div>
  );
};

const NumberFilter = ({ field, filter, onChange, emptyChip }: TypedEditorProps) => {
  const [from, setFrom] = useDraft(filter.from ?? "", (next) =>
    onChange({ ...filter, from: next.trim() || null })
  );
  const [to, setTo] = useDraft(filter.to ?? "", (next) =>
    onChange({ ...filter, to: next.trim() || null })
  );
  const bad = (value: string) => value.trim() !== "" && !/^-?\d+([.,]\d+)?$/.test(value.trim());
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Input
          value={from}
          inputMode="decimal"
          placeholder="Từ"
          aria-label={`${field.label} từ`}
          aria-invalid={bad(from)}
          onChange={(event) => setFrom(event.target.value)}
          className="min-w-0 flex-1 tabular-nums"
        />
        <span aria-hidden="true" className="text-foreground-subtle">
          –
        </span>
        <Input
          value={to}
          inputMode="decimal"
          placeholder="Đến"
          aria-label={`${field.label} đến`}
          aria-invalid={bad(to)}
          onChange={(event) => setTo(event.target.value)}
          className="min-w-0 flex-1 tabular-nums"
        />
      </div>
      {bad(from) || bad(to) ? (
        <p className="text-xs text-danger">Nhập một số, ví dụ 24 hoặc 1,5.</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">{emptyChip}</div>
    </div>
  );
};

/** Tag filter: any of the chosen tags matches. Archived tags stay listed while chosen. */
export const TagFilterEditor = ({
  tags,
  value,
  onChange
}: {
  tags: readonly Tag[];
  value: readonly string[];
  onChange: (tagIds: string[]) => void;
}) => {
  const choices = tags.filter((tag) => tag.active || value.includes(tag.id));
  if (choices.length === 0) {
    return <p className="text-xs text-foreground-muted">Chưa có tag nào.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tag">
      {choices.map((tag) => (
        <ToggleChip
          key={tag.id}
          pressed={value.includes(tag.id)}
          onClick={() => onChange(toggleValue(value, tag.id))}
        >
          <span className={cn(toneClass(tag.color), "inline-flex items-center gap-1")}>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-(--tone)" />
            {tag.name}
          </span>
        </ToggleChip>
      ))}
    </div>
  );
};

// Bars ----------------------------------------------------------------------------------------------------------

type ListFilterProps = {
  /** Active fields of the list's entity (fieldsFor), in display order. */
  fields: readonly CustomField[];
  tags: readonly Tag[];
  filters: ListFilters;
  onChange: (next: ListFilters) => void;
  /** Offer the tag filter (default true). */
  withTags?: boolean;
  today?: string | undefined;
};

const tagSummary = (tags: readonly Tag[], ids: readonly string[]) => {
  const names = ids.map((id) => tags.find((tag) => tag.id === id)?.name ?? "tag đã xóa");
  return names.length > 2
    ? `${names.slice(0, 2).join(", ")} +${names.length - 2}`
    : names.join(", ");
};

const popoverBody = "max-h-[min(26rem,var(--available-height))] w-80 gap-3 overflow-y-auto p-3";

/** One active filter: "Ưu tiên: Gấp, Rất gấp ▾" opens its editor; × removes it. */
const FilterChip = ({
  label,
  summary,
  onRemove,
  children
}: {
  label: string;
  summary: string;
  onRemove: () => void;
  children: ReactNode;
}) => (
  <span className="inline-flex h-8 max-w-full min-w-0 items-center rounded-lg border border-brand/25 bg-brand-soft text-[13px] pointer-coarse:h-10">
    <Popover>
      <PopoverTrigger
        className="flex h-full min-w-0 items-center gap-1 rounded-l-lg pr-1 pl-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Sửa lọc ${label}: ${summary}`}
      >
        <span className="shrink-0 text-foreground-muted">{label}:</span>
        <span className="max-w-48 truncate font-medium text-foreground">{summary}</span>
        <ChevronDown className="size-3.5 shrink-0 text-foreground-muted" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className={popoverBody}>
        <p className="text-xs font-semibold text-foreground-muted">{label}</p>
        {children}
      </PopoverContent>
    </Popover>
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Bỏ lọc ${label}`}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-9"
    >
      <X className="size-3.5" aria-hidden="true" />
    </button>
  </span>
);

const TAG_KEY = "__tags__";

/** "Lọc thêm": pick a field (or Tag), then edit it in place; the chip appears once it has a value. */
const AddFilter = ({
  fields,
  tags,
  filters,
  onChange,
  withTags = true,
  today
}: ListFilterProps) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const field = fields.find((item) => item.key === editing) ?? null;
  const options = [
    ...(withTags && tags.some((tag) => tag.active)
      ? [{ key: TAG_KEY, label: "Tag", hint: "Khớp bất kỳ tag nào" }]
      : []),
    ...fields.map((item) => ({
      key: item.key,
      label: item.label,
      hint: customFieldTypeLabels[item.type]
    }))
  ];
  if (options.length === 0) return null;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setEditing(null);
      }}
    >
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className="text-foreground-muted" />}
      >
        <Plus />
        {activeListFilterCount(filters) > 0 ? "Lọc thêm" : "Trường & tag"}
      </PopoverTrigger>
      <PopoverContent align="start" className={popoverBody}>
        {editing === null ? (
          <div className="flex flex-col gap-0.5">
            <p className="px-1 pb-1 text-xs font-semibold text-foreground-muted">Lọc theo</p>
            {options.map((option) => {
              const active =
                option.key === TAG_KEY
                  ? filters.tagIds.length > 0
                  : isFieldFilterActive(filters.fields[option.key]);
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setEditing(option.key)}
                  className="flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-surface-hover focus-visible:bg-surface-hover"
                >
                  {option.key === TAG_KEY ? (
                    <TagIcon className="size-3.5 text-foreground-subtle" aria-hidden="true" />
                  ) : (
                    <ListFilter className="size-3.5 text-foreground-subtle" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {active ? (
                    <Check className="size-3.5 text-brand-text" aria-label="đang lọc" />
                  ) : (
                    <span className="text-[11px] text-foreground-subtle">{option.hint}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="-ml-1 flex items-center gap-1 self-start rounded px-1 text-xs font-semibold text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              {editing === TAG_KEY ? "Tag" : (field?.label ?? "")}
            </button>
            {editing === TAG_KEY ? (
              <TagFilterEditor
                tags={tags}
                value={filters.tagIds}
                onChange={(tagIds) => onChange({ ...filters, tagIds })}
              />
            ) : field ? (
              <FieldFilterEditor
                field={field}
                filter={filters.fields[field.key]}
                onChange={(next) => onChange(withFieldFilter(filters, field.key, next))}
                today={today}
              />
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/**
 * Desktop / tablet: the active tag and custom-field filters as chips, then "Trường & tag" /
 * "Lọc thêm" to add one. Renders nothing when the entity has no fields and no tags.
 */
export const ListFilterBar = (props: ListFilterProps & { className?: string | undefined }) => {
  const { fields, tags, filters, onChange, withTags = true, today, className } = props;
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const active = activeFieldFilters(filters).filter(([key]) => byKey.has(key));
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {withTags && filters.tagIds.length > 0 ? (
        <FilterChip
          label="Tag"
          summary={tagSummary(tags, filters.tagIds)}
          onRemove={() => onChange({ ...filters, tagIds: [] })}
        >
          <TagFilterEditor
            tags={tags}
            value={filters.tagIds}
            onChange={(tagIds) => onChange({ ...filters, tagIds })}
          />
        </FilterChip>
      ) : null}
      {active.map(([key, filter]) => {
        const field = byKey.get(key);
        if (!field) return null;
        return (
          <FilterChip
            key={key}
            label={field.label}
            summary={describeFieldFilter(field, filter)}
            onRemove={() => onChange(withFieldFilter(filters, key, null))}
          >
            <FieldFilterEditor
              field={field}
              filter={filter}
              onChange={(next) => onChange(withFieldFilter(filters, key, next))}
              today={today}
            />
          </FilterChip>
        );
      })}
      <AddFilter {...props} />
    </div>
  );
};

/** Phones (inside a filter sheet): Tag and every field, stacked with their labels. */
export const ListFilterSections = ({
  fields,
  tags,
  filters,
  onChange,
  withTags = true,
  today
}: ListFilterProps) => (
  <>
    {withTags && tags.some((tag) => tag.active || filters.tagIds.includes(tag.id)) ? (
      <section className="flex flex-col gap-2" aria-label="Lọc theo tag">
        <span className="text-xs font-medium text-foreground-muted">
          Tag <span className="font-normal text-foreground-subtle">(khớp bất kỳ)</span>
        </span>
        <TagFilterEditor
          tags={tags}
          value={filters.tagIds}
          onChange={(tagIds) => onChange({ ...filters, tagIds })}
        />
      </section>
    ) : null}
    {fields.map((field) => (
      <section
        key={field.id}
        className="flex flex-col gap-2"
        aria-label={`Lọc theo ${field.label}`}
      >
        <span className="text-xs font-medium text-foreground-muted">{field.label}</span>
        <FieldFilterEditor
          field={field}
          filter={filters.fields[field.key]}
          onChange={(next) => onChange(withFieldFilter(filters, field.key, next))}
          today={today}
        />
      </section>
    ))}
  </>
);

/**
 * For lists without a filter bar of their own (Việc của tôi, Hàng chờ QC, Khách hàng, Thành viên):
 * chips + "Trường & tag" on tablet / desktop, a "Lọc · N" button with a bottom sheet on phones.
 * Renders nothing when there is nothing to filter by.
 */
export const ListFiltersControl = ({
  title = "Lọc theo trường và tag",
  className,
  ...props
}: ListFilterProps & { title?: string; className?: string | undefined }) => {
  const breakpoint = useBreakpoint();
  const [sheet, setSheet] = useState(false);
  const count = activeListFilterCount(props.filters);
  const hasTags = (props.withTags ?? true) && props.tags.some((tag) => tag.active);
  if (props.fields.length === 0 && !hasTags && count === 0) return null;
  if (breakpoint !== "mobile") return <ListFilterBar {...props} className={className} />;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setSheet(true)}
        className={cn("shrink-0", count > 0 && "border-brand/40 text-brand-text", className)}
      >
        <ListFilter />
        Lọc{count > 0 ? ` · ${count}` : ""}
      </Button>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent
          side="bottom"
          className={cn(
            "max-h-[90dvh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]",
            touchTargets
          )}
        >
          <SheetHeader className="border-b px-4 pt-4 pb-3">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>Bộ lọc được lưu trên đường dẫn để chia sẻ.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 py-4">
            <ListFilterSections {...props} />
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t bg-popover px-4 py-3">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => props.onChange(emptyListFilters)}
              disabled={count === 0}
            >
              <FilterX />
              Xóa lọc
            </Button>
            <Button className="flex-1" onClick={() => setSheet(false)}>
              Xem kết quả
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
