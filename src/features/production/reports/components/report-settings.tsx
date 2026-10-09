import { cn } from "cn";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CalendarRange,
  ChevronDown,
  Filter,
  Info,
  ListFilter,
  Plus,
  X
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  reportDimensionInfo,
  reportMeasureInfo,
  reportRangePresets,
  type ReportConfig,
  type ReportDimension,
  type ReportFilters,
  type ReportMeasure,
  type ReportRangePreset
} from "@/contracts/production-reports";
import { toneClass } from "@/lib/colors";

import { touchTargets } from "../../ui";
import { foldText } from "../../catalog";
import { DateField } from "../../components/date-field";
import { filterKeys, filterValues, type FilterKey, type FilterOption } from "../filter-options";
import {
  filterLabels,
  monthRange,
  rangeOfConfig,
  rangePresetLabels,
  recentMonths,
  taskDateInfo,
  usesSource,
  withFilter,
  withLimit,
  withRange,
  withSort,
  type TaskDate
} from "../model";

type SettingsProps = {
  config: ReportConfig;
  onChange: (config: ReportConfig) => void;
};

const Field = ({
  label,
  children,
  className
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-1", className)}>
    <span className="text-xs font-medium text-foreground-muted">{label}</span>
    {children}
  </div>
);

// Range --------------------------------------------------------------------------------------------

const CUSTOM = "CUSTOM";
const monthLabel = (month: string) => `Tháng ${month.slice(5, 7)}/${month.slice(0, 4)}`;

export const RangeControl = ({ config, onChange, today }: SettingsProps & { today: string }) => {
  const range = rangeOfConfig(config);
  const months = recentMonths(today, 13);
  const matchedMonth =
    range.kind === "fixed"
      ? months.find((month) => {
          const bounds = monthRange(month);
          return bounds.from === range.from && bounds.to === range.to;
        })
      : undefined;
  const [custom, setCustom] = useState(range.kind === "fixed" && !matchedMonth);
  const value =
    range.kind === "preset" ? range.preset : matchedMonth && !custom ? `M:${matchedMonth}` : CUSTOM;
  const items = [
    ...reportRangePresets.map((preset) => ({ value: preset, label: rangePresetLabels[preset] })),
    ...months.map((month) => ({ value: `M:${month}`, label: monthLabel(month) })),
    { value: CUSTOM, label: "Khoảng ngày tuỳ chọn" }
  ];

  const pick = (next: string | null) => {
    if (!next) return;
    if (next === CUSTOM) {
      setCustom(true);
      if (range.kind === "preset") {
        const bounds = monthRange(today.slice(0, 7));
        onChange(withRange(config, { kind: "fixed", from: bounds.from, to: today }));
      }
      return;
    }
    setCustom(false);
    if (next.startsWith("M:")) {
      onChange(withRange(config, { kind: "fixed", ...monthRange(next.slice(2)) }));
      return;
    }
    onChange(withRange(config, { kind: "preset", preset: next as ReportRangePreset }));
  };

  return (
    <div className="flex w-full min-w-0 flex-wrap items-end gap-2 sm:w-auto">
      <Field label="Thời gian" className="w-full sm:w-52">
        <Select items={items} value={value} onValueChange={(next: string | null) => pick(next)}>
          <SelectTrigger className="w-full" aria-label="Khoảng thời gian">
            <CalendarRange className="text-foreground-muted" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectGroup>
              <SelectLabel>Theo mốc</SelectLabel>
              {reportRangePresets.map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {rangePresetLabels[preset]}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Theo tháng</SelectLabel>
              {months.map((month) => (
                <SelectItem key={month} value={`M:${month}`}>
                  {monthLabel(month)}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectItem value={CUSTOM}>Khoảng ngày tuỳ chọn</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {range.kind === "fixed" && value === CUSTOM ? (
        <div className="flex w-full min-w-0 items-end gap-2 sm:w-auto">
          <Field label="Từ ngày" className="min-w-0 flex-1 sm:w-40 sm:flex-none">
            <DateField
              value={range.from}
              today={today}
              aria-label="Từ ngày"
              onChange={(day) =>
                day && onChange(withRange(config, { kind: "fixed", from: day, to: range.to }))
              }
            />
          </Field>
          <Field label="Đến ngày" className="min-w-0 flex-1 sm:w-40 sm:flex-none">
            <DateField
              value={range.to}
              today={today}
              aria-label="Đến ngày"
              onChange={(day) =>
                day && onChange(withRange(config, { kind: "fixed", from: range.from, to: day }))
              }
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
};

// Task date ---------------------------------------------------------------------------------------

export const TaskDateControl = ({ config, onChange }: SettingsProps) => {
  const tasks = usesSource(config.measures, "TASKS");
  const scores = usesSource(config.measures, "SCORES");
  if (!tasks) {
    return scores ? (
      <p className="flex items-start gap-1.5 self-end pb-2 text-xs text-foreground-muted">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        Điểm được tính theo ngày ghi điểm (ngày task Done hoặc QC xong).
      </p>
    ) : null;
  }
  const items = (Object.keys(taskDateInfo) as TaskDate[]).map((key) => ({
    value: key,
    label: taskDateInfo[key].label
  }));
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:min-w-64 sm:flex-1">
      <Field label="Tính task theo" className="w-full sm:w-52">
        <Select
          items={items}
          value={config.taskDate}
          onValueChange={(next: TaskDate | null) => next && onChange({ ...config, taskDate: next })}
        >
          <SelectTrigger className="w-full" aria-label="Tính task theo ngày nào">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <p className="text-xs leading-relaxed text-foreground-muted">
        {taskDateInfo[config.taskDate].description}
        {scores ? " Điểm vẫn tính theo ngày ghi điểm." : ""}
      </p>
    </div>
  );
};

// Sort & limit --------------------------------------------------------------------------------------

const DEFAULT_SORT = "__default";
const limits = [5, 10, 20, 50, 100] as const;

export const SortControl = ({ config, onChange }: SettingsProps) => {
  const keys: (ReportDimension | ReportMeasure)[] = [...config.dimensions, ...config.measures];
  const labelOf = (key: ReportDimension | ReportMeasure) =>
    key in reportMeasureInfo
      ? reportMeasureInfo[key as ReportMeasure].label
      : reportDimensionInfo[key as ReportDimension].label;
  const sortItems = [
    { value: DEFAULT_SORT, label: "Mặc định" },
    ...keys.map((key) => ({ value: key, label: labelOf(key) }))
  ];
  const limitItems = [
    { value: "all", label: "Tất cả" },
    ...limits.map((limit) => ({ value: String(limit), label: `Top ${limit}` }))
  ];
  const direction = config.sort?.direction ?? "desc";
  return (
    <div className="flex w-full min-w-0 flex-wrap items-end gap-2">
      <Field label="Sắp xếp" className="min-w-0 flex-1 sm:w-44 sm:flex-none">
        <Select
          items={sortItems}
          value={config.sort?.key ?? DEFAULT_SORT}
          onValueChange={(next: string | null) =>
            onChange(
              withSort(
                config,
                !next || next === DEFAULT_SORT
                  ? null
                  : { key: next as ReportDimension | ReportMeasure, direction }
              )
            )
          }
        >
          <SelectTrigger className="w-full" aria-label="Sắp xếp theo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Button
        variant="outline"
        size="icon"
        disabled={!config.sort}
        onClick={() =>
          config.sort &&
          onChange(
            withSort(config, {
              key: config.sort.key,
              direction: direction === "asc" ? "desc" : "asc"
            })
          )
        }
        aria-label={
          direction === "asc"
            ? "Đang tăng dần — đổi sang giảm dần"
            : "Đang giảm dần — đổi sang tăng dần"
        }
        title={direction === "asc" ? "Tăng dần" : "Giảm dần"}
      >
        {direction === "asc" ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
      </Button>
      <Field label="Số dòng" className="w-28">
        <Select
          items={limitItems}
          value={config.limit ? String(config.limit) : "all"}
          onValueChange={(next: string | null) =>
            onChange(withLimit(config, !next || next === "all" ? null : Number(next)))
          }
        >
          <SelectTrigger className="w-full" aria-label="Giới hạn số dòng">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {limitItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
};

// Filters -------------------------------------------------------------------------------------------

const singleChoice: ReadonlySet<FilterKey> = new Set<FilterKey>(["taskState"]);

const applicable = (key: FilterKey, measures: readonly ReportMeasure[]) => {
  if (key === "scoreRole") return usesSource(measures, "SCORES");
  if (key === "taskState") return usesSource(measures, "TASKS");
  return true;
};

const OptionDot = ({ color }: { color?: string | undefined }) =>
  color ? (
    <span
      aria-hidden="true"
      className={cn(toneClass(color), "size-2 shrink-0 rounded-full bg-(--tone)")}
    />
  ) : null;

const FilterPill = ({
  filterKey,
  values,
  options,
  open,
  onOpenChange,
  onChange
}: {
  filterKey: FilterKey;
  values: string[];
  options: FilterOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (values: string[]) => void;
}) => {
  const [query, setQuery] = useState("");
  const selected = new Set(values);
  const q = foldText(query);
  const visible = q ? options.filter((item) => item.search.includes(q)) : options;
  const byId = new Map(options.map((item) => [item.id, item]));
  const first = values[0] ? byId.get(values[0])?.label : undefined;
  const summary =
    values.length === 0
      ? "Tất cả"
      : values.length === 1
        ? (first ?? "1 mục")
        : `${first ?? values.length} +${values.length - 1}`;
  const single = singleChoice.has(filterKey);
  const toggle = (id: string) => {
    if (single) {
      onChange(selected.has(id) ? [] : [id]);
      onOpenChange(false);
      return;
    }
    onChange(selected.has(id) ? values.filter((item) => item !== id) : [...values, id]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "max-w-full min-w-0 gap-1 rounded-full font-normal",
              values.length > 0 && "border-brand/40 bg-brand-soft text-foreground"
            )}
          />
        }
      >
        <span className="shrink-0 text-foreground-muted">{filterLabels[filterKey]}:</span>
        <span className="max-w-40 truncate font-medium">{summary}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-72 p-0", touchTargets)}>
        <Command shouldFilter={false} loop>
          {options.length > 8 ? (
            <CommandInput
              placeholder={`Tìm ${filterLabels[filterKey].toLowerCase()}…`}
              value={query}
              onValueChange={setQuery}
              autoFocus
            />
          ) : null}
          <CommandList>
            <CommandEmpty>
              {options.length === 0 ? "Chưa có dữ liệu." : "Không có kết quả phù hợp."}
            </CommandEmpty>
            {visible.length > 0 ? (
              <CommandGroup>
                {visible.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    data-checked={selected.has(item.id)}
                    onSelect={() => toggle(item.id)}
                  >
                    <OptionDot color={item.color} />
                    <span
                      className={cn("min-w-0 truncate", item.archived && "text-foreground-muted")}
                    >
                      {item.label}
                    </span>
                    {item.hint ? (
                      <span className="min-w-0 truncate text-xs text-foreground-subtle">
                        {item.hint}
                      </span>
                    ) : null}
                    {item.archived ? (
                      <span className="shrink-0 text-xs text-foreground-subtle">lưu trữ</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
        <div className="flex items-center gap-1 border-t p-1">
          <span className="flex-1 px-2 text-xs text-foreground-muted">
            {values.length > 0 ? `Đã chọn ${values.length}` : "Chưa chọn — tính tất cả"}
          </span>
          {values.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>
              Bỏ chọn
            </Button>
          ) : null}
          {!single ? (
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              Xong
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const setValues = (config: ReportConfig, key: FilterKey, values: string[]): ReportConfig => {
  if (key === "taskState")
    return withFilter(config, "taskState", (values[0] as ReportFilters["taskState"]) ?? undefined);
  return withFilter(config, key, values as never);
};

export const FilterBar = ({
  config,
  onChange,
  options,
  optionsPending
}: SettingsProps & { options: Record<FilterKey, FilterOption[]>; optionsPending: boolean }) => {
  const [shown, setShown] = useState<FilterKey[]>([]);
  const [openKey, setOpenKey] = useState<FilterKey | null>(null);
  const active = filterKeys.filter((key) => filterValues(config.filters, key).length > 0);
  const visible = [...active, ...shown.filter((key) => !active.includes(key))];
  const addable = filterKeys.filter(
    (key) => !visible.includes(key) && applicable(key, config.measures)
  );
  const jobs = config.filters.job ?? [];
  const ignored = active.filter((key) => !applicable(key, config.measures));

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
        <ListFilter className="size-3.5" aria-hidden="true" />
        Bộ lọc
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {visible.map((key) => (
          <span key={key} className="flex max-w-full min-w-0 items-center">
            <FilterPill
              filterKey={key}
              values={filterValues(config.filters, key)}
              options={options[key]}
              open={openKey === key}
              onOpenChange={(open) => setOpenKey(open ? key : null)}
              onChange={(values) => onChange(setValues(config, key, values))}
            />
            {filterValues(config.filters, key).length > 0 || shown.includes(key) ? (
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-foreground-subtle"
                aria-label={`Bỏ bộ lọc ${filterLabels[key]}`}
                onClick={() => {
                  setShown((current) => current.filter((item) => item !== key));
                  onChange(setValues(config, key, []));
                }}
              >
                <X />
              </Button>
            ) : null}
          </span>
        ))}
        {jobs.length > 0 ? (
          <span className="flex items-center">
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-brand/40 bg-brand-soft px-2.5 text-[0.8rem]">
              <span className="text-foreground-muted">Job:</span>
              <span className="font-medium">{jobs.length} job</span>
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-foreground-subtle"
              aria-label="Bỏ bộ lọc job"
              onClick={() => onChange(withFilter(config, "job", undefined))}
            >
              <X />
            </Button>
          </span>
        ) : null}
        {addable.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-foreground-muted"
                  disabled={optionsPending}
                />
              }
            >
              <Plus />
              {visible.length === 0 && jobs.length === 0 ? "Thêm bộ lọc" : "Lọc thêm"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {addable.map((key) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => {
                    setShown((current) => [...current, key]);
                    // Open after the menu closes so focus lands in the picker.
                    window.setTimeout(() => setOpenKey(key), 0);
                  }}
                >
                  <Filter className="text-foreground-muted" />
                  {filterLabels[key]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {ignored.length > 0 ? (
        <p className="text-xs text-foreground-muted">
          Bộ lọc {ignored.map((key) => `"${filterLabels[key]}"`).join(", ")} không áp dụng cho các
          chỉ số đang chọn.
        </p>
      ) : null}
    </div>
  );
};
