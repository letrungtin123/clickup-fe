import { cn } from "cn";
import { ChevronDown, FileText, FilterX, ListChecks, ListFilter, UserRound, UsersRound, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { KnowledgeAuditAction } from "@/contracts/knowledge";
import type { UserRef } from "@/contracts/work";
import { DateField } from "@/features/production/components/date-field";
import { dateToDay } from "@/features/production/format";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { auditActionMeta } from "../../model/audit";
import type { AuditFilters } from "../../model/filters";
import {
  activeAuditFilterCount,
  auditActionGroups,
  auditActionsLabel,
  auditToneDot,
  emptyAuditFilters,
  foldText,
  matchesPerson,
  toggleAuditAction,
  withAuditRange
} from "./audit-view";

type FiltersProps = {
  filters: AuditFilters;
  onChange: (next: AuditFilters) => void;
  /** People for "Người thực hiện" (members + actors seen in the log). */
  people: readonly UserRef[];
  peopleLoading: boolean;
  /** Title of the filtered item (null → "Một mục"). */
  itemTitle: string | null;
};

/**
 * Filters of the space audit log (state in the URL): người thực hiện, loại thao tác, mục, khoảng thời
 * gian. Inline from tablet up; a "Lọc" button opening a bottom sheet on phones.
 */
export const AuditFiltersBar = ({ filters, onChange, people, peopleLoading, itemTitle }: FiltersProps) => {
  const breakpoint = useBreakpoint();
  const [sheet, setSheet] = useState(false);
  const count = activeAuditFilterCount(filters);
  const clear = () => onChange(emptyAuditFilters);
  const clearItem = () => onChange({ ...filters, itemId: null });

  if (breakpoint === "mobile") {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setSheet(true)} aria-haspopup="dialog" className="shrink-0">
          <ListFilter />
          Lọc{count > 0 ? ` · ${count}` : ""}
        </Button>
        {filters.itemId ? <ItemChip title={itemTitle} onClear={clearItem} /> : null}
        {count > 0 ? (
          <Button variant="ghost" onClick={clear} className="shrink-0 text-foreground-muted">
            <FilterX />
            Xoá lọc
          </Button>
        ) : null}
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetContent
            side="bottom"
            className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
          >
            <SheetHeader className="border-b px-4 pt-4 pb-3 pr-12">
              <SheetTitle>Lọc nhật ký</SheetTitle>
              <SheetDescription>Bộ lọc nằm trên đường dẫn: gửi link là người khác thấy đúng như bạn.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 py-4">
              <Labelled label="Người thực hiện">
                <ActorFilter
                  value={filters.actorId}
                  people={people}
                  loading={peopleLoading}
                  onChange={(actorId) => onChange({ ...filters, actorId })}
                  stacked
                />
              </Labelled>
              <Labelled label="Loại thao tác">
                <ActionFilter value={filters.actions} onChange={(actions) => onChange({ ...filters, actions })} stacked />
              </Labelled>
              <Labelled label="Khoảng thời gian">
                <RangeFilter filters={filters} onChange={onChange} stacked />
              </Labelled>
              {filters.itemId ? (
                <Labelled label="Mục">
                  <ItemChip title={itemTitle} onClear={clearItem} />
                </Labelled>
              ) : null}
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t bg-popover px-4 py-3">
              <Button variant="ghost" className="flex-1" onClick={clear} disabled={count === 0}>
                <FilterX />
                Xoá lọc
              </Button>
              <Button className="flex-1" onClick={() => setSheet(false)}>
                Xem kết quả
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Lọc nhật ký">
      <ActorFilter
        value={filters.actorId}
        people={people}
        loading={peopleLoading}
        onChange={(actorId) => onChange({ ...filters, actorId })}
      />
      <ActionFilter value={filters.actions} onChange={(actions) => onChange({ ...filters, actions })} />
      <RangeFilter filters={filters} onChange={onChange} />
      {filters.itemId ? <ItemChip title={itemTitle} onClear={clearItem} /> : null}
      {count > 0 ? (
        <Button variant="ghost" size="sm" onClick={clear} className="text-foreground-muted">
          <FilterX />
          Xoá lọc
        </Button>
      ) : null}
    </div>
  );
};

const Labelled = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <span className="text-xs font-medium text-foreground-muted">{label}</span>
    {children}
  </div>
);

const triggerClass = (active: boolean, stacked: boolean) =>
  cn(
    "min-w-0 justify-start font-normal",
    stacked ? "w-full" : "max-w-60",
    active && "border-brand/40 bg-brand-soft/60 text-foreground hover:bg-brand-soft dark:border-brand/40 dark:bg-brand-soft/60"
  );

// --- Người thực hiện --------------------------------------------------------------------------------

const ActorFilter = ({
  value,
  people,
  loading,
  onChange,
  stacked = false
}: {
  value: string | null;
  people: readonly UserRef[];
  loading: boolean;
  onChange: (actorId: string | null) => void;
  stacked?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = value ? people.find((person) => person.id === value) : undefined;
  const results = useMemo(() => people.filter((person) => matchesPerson(person, query)), [people, query]);
  const searching = query.trim().length > 0;
  const label = value ? (selected?.displayName ?? "Một người") : "Mọi người";

  const pick = (actorId: string | null) => {
    onChange(actorId);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size={stacked ? "default" : "sm"}
            className={triggerClass(value !== null, stacked)}
            aria-label={`Người thực hiện: ${label}`}
          />
        }
      >
        {selected ? (
          <UserAvatar user={selected} size="xs" className="size-4 text-[8px]" />
        ) : (
          <UserRound aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown className="text-foreground-subtle" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        <Command shouldFilter={false} loop>
          <CommandInput placeholder="Tìm người…" value={query} onValueChange={setQuery} autoFocus />
          <CommandList>
            {!searching ? (
              <CommandGroup>
                <CommandItem value="__everyone" data-checked={value === null} onSelect={() => pick(null)}>
                  <UsersRound className="text-foreground-muted" aria-hidden="true" />
                  <span className="truncate">Mọi người</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {loading && people.length === 0 ? (
              <div className="flex flex-col gap-2 p-3" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Skeleton className="size-5 rounded-full" />
                    <Skeleton className="h-3 flex-1" />
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <p className="px-3 py-5 text-center text-[13px] text-foreground-muted">
                {searching ? "Không tìm thấy ai phù hợp" : "Kho chưa có thành viên"}
              </p>
            ) : (
              <CommandGroup heading={searching ? "Kết quả" : "Thành viên và người đã thao tác"}>
                {results.map((person) => (
                  <CommandItem
                    key={person.id}
                    value={person.id}
                    data-checked={person.id === value}
                    onSelect={() => pick(person.id)}
                  >
                    <UserAvatar user={person} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
                    {person.email ? (
                      // Phones: the name needs the width; the email stays searchable.
                      <span className="max-w-[40%] truncate text-xs text-foreground-subtle max-sm:hidden">{person.email}</span>
                    ) : null}
                    {person.id === value ? <span className="sr-only">(đang chọn)</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// --- Loại thao tác ----------------------------------------------------------------------------------

const ActionFilter = ({
  value,
  onChange,
  stacked = false
}: {
  value: readonly KnowledgeAuditAction[];
  onChange: (actions: KnowledgeAuditAction[]) => void;
  stacked?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = new Set(value);
  const q = foldText(query);
  const groups = auditActionGroups
    .map((group) => ({
      ...group,
      actions: group.actions.filter((action) => !q || foldText(auditActionMeta[action].label).includes(q))
    }))
    .filter((group) => group.actions.length > 0);
  const label = auditActionsLabel(value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size={stacked ? "default" : "sm"}
            className={triggerClass(value.length > 0, stacked)}
            aria-label={`Loại thao tác: ${label}`}
          />
        }
      >
        <ListChecks aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown className="text-foreground-subtle" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        <Command shouldFilter={false} loop>
          <CommandInput placeholder="Tìm thao tác…" value={query} onValueChange={setQuery} autoFocus />
          <CommandList className="max-h-80">
            {groups.length === 0 ? <CommandEmpty>Không có thao tác phù hợp</CommandEmpty> : null}
            {groups.map((group) => (
              <CommandGroup key={group.scope} heading={group.label}>
                {group.actions.map((action) => {
                  const meta = auditActionMeta[action];
                  const checked = selected.has(action);
                  return (
                    <CommandItem
                      key={action}
                      value={action}
                      data-checked={checked}
                      onSelect={() => onChange(toggleAuditAction(value, action))}
                    >
                      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", auditToneDot[meta.tone])} />
                      <span className="truncate">{meta.label}</span>
                      {checked ? <span className="sr-only">(đã chọn)</span> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {value.length > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
            <span className="px-1 text-xs text-foreground-muted">Đã chọn {value.length}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              Bỏ chọn
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};

// --- Khoảng thời gian -------------------------------------------------------------------------------

const RangeFilter = ({
  filters,
  onChange,
  stacked = false
}: {
  filters: AuditFilters;
  onChange: (next: AuditFilters) => void;
  stacked?: boolean;
}) => {
  const today = dateToDay(new Date());
  const field = (key: "from" | "to") => (
    <DateField
      value={filters[key]}
      onChange={(day) => onChange(withAuditRange(filters, key, day))}
      placeholder={key === "from" ? "Từ ngày" : "Đến ngày"}
      aria-label={key === "from" ? "Từ ngày" : "Đến ngày"}
      clearable
      today={today}
      size={stacked ? "default" : "sm"}
      className={stacked ? "w-full" : "w-40"}
    />
  );
  // Phones: one date per line (two pickers side by side do not fit 360 px with their clear buttons).
  if (stacked) {
    return (
      <div className="flex flex-col gap-2">
        {field("from")}
        {field("to")}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Khoảng thời gian">
      {field("from")}
      <span aria-hidden="true" className="text-foreground-subtle">
        –
      </span>
      {field("to")}
    </div>
  );
};

// --- Mục ----------------------------------------------------------------------------------------------

const ItemChip = ({ title, onClear }: { title: string | null; onClear: () => void }) => (
  <span className="inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 self-start rounded-full border border-brand/30 bg-brand-soft/60 pr-0.5 pl-2.5 text-xs text-foreground pointer-coarse:h-10">
    <FileText className="size-3.5 shrink-0 text-brand-text" aria-hidden="true" />
    <span className="shrink-0 text-foreground-muted">Mục:</span>
    <span className="min-w-0 truncate font-medium" title={title ?? undefined}>
      {title ?? "Một mục"}
    </span>
    <button
      type="button"
      onClick={onClear}
      aria-label="Bỏ lọc theo mục"
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-foreground-muted outline-none hover:bg-brand-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-9"
    >
      <X className="size-3.5" aria-hidden="true" />
    </button>
  </span>
);
