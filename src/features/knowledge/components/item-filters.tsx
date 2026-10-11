import { cn } from "cn";
import { AlarmClock, ArrowDownUp, Check, ListFilter, Pin, Search, UserRound, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { KnowledgeImportance, KnowledgeSpaceDetail, KnowledgeStatusGroup } from "@/contracts/knowledge";
import { useSessionContext } from "@/features/auth/hooks";
import { toneClass } from "@/lib/colors";

import { useKnowledgeMembers } from "../hooks";
import { activeFilterCount, emptyFilters, type SpaceFilters } from "../model/filters";
import { importanceMeta, importanceOrder, sortOptions, statusGroupMeta, statusGroupOrder, type KnowledgeSort } from "../model/labels";

type Props = {
  space: KnowledgeSpaceDetail;
  filters: SpaceFilters;
  onChange: (next: SpaceFilters) => void;
  /** Phones: the filter panel opens as a bottom sheet and the sort moves into it. */
  compact: boolean;
};

const toggle = <T,>(values: readonly T[], value: T) =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

/**
 * Search, filters (status / group, importance, tag, owner, review due, pinned) and sort of a space.
 * Everything lives in the URL (model/filters.ts); this bar only edits it.
 */
export const ItemFilterBar = ({ space, filters, onChange, compact }: Props) => {
  const [term, setTerm] = useState(filters.q);
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);

  // URL → box (back/forward, "Xoá lọc"), adjusted during render; box → URL after a short pause.
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (syncedQ !== filters.q) {
    setSyncedQ(filters.q);
    setTerm(filters.q);
  }
  useEffect(() => {
    if (term.trim() === filters.q.trim()) return undefined;
    const timer = setTimeout(() => onChange({ ...filters, q: term }), 300);
    return () => clearTimeout(timer);
  }, [filters, onChange, term]);

  const triggerLabel = count ? `Lọc (${count} đang bật)` : "Lọc";
  const triggerContent = (
    <>
      <ListFilter />
      {compact ? null : <span>Lọc</span>}
      {count > 0 ? (
        <span className={cn("inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground", compact && "absolute -top-1 -right-1")}>
          {count}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-foreground-subtle" aria-hidden="true" />
          <Input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onChange({ ...filters, q: term });
              if (event.key === "Escape" && term) {
                event.preventDefault();
                setTerm("");
                onChange({ ...filters, q: "" });
              }
            }}
            placeholder={compact ? "Tìm trong kho…" : "Tìm trong kho theo tiêu đề, tóm tắt, tag…"}
            aria-label="Tìm trong kho"
            maxLength={120}
            className="pl-8 [&::-webkit-search-cancel-button]:hidden"
          />
          {term ? (
            <button
              type="button"
              aria-label="Xoá từ khoá"
              onClick={() => {
                setTerm("");
                onChange({ ...filters, q: "" });
              }}
              className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded text-foreground-subtle outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-8"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        {compact ? (
          <>
            <Button variant="outline" size="icon" aria-label={triggerLabel} className="relative shrink-0" onClick={() => setOpen(true)}>
              {triggerContent}
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-0">
                <span aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" />
                <SheetHeader className="px-4 pt-2 pb-1">
                  <SheetTitle>Lọc và sắp xếp</SheetTitle>
                  <SheetDescription className="sr-only">Chọn điều kiện lọc mục của kho</SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-5 px-4 pt-2 pb-4">
                  <FilterSection title="Sắp xếp">
                    <SortSelect value={filters.sort} onChange={(sort) => onChange({ ...filters, sort })} full />
                  </FilterSection>
                  <FilterPanel space={space} filters={filters} onChange={onChange} />
                </div>
                {/* Always reachable: the panel is taller than a phone screen. */}
                <div className="sticky bottom-0 flex gap-2 border-t bg-popover px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]">
                  <Button variant="outline" className="flex-1" disabled={count === 0} onClick={() => onChange({ ...emptyFilters(), category: filters.category, q: filters.q, sort: filters.sort })}>
                    Xoá lọc
                  </Button>
                  <Button className="flex-1" onClick={() => setOpen(false)}>
                    Xong
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger render={<Button variant="outline" aria-label={triggerLabel} className="relative shrink-0" />}>
                {triggerContent}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] gap-0 p-0">
                <div className="flex max-h-[min(70vh,34rem)] flex-col gap-5 overflow-y-auto p-4">
                  <FilterPanel space={space} filters={filters} onChange={onChange} />
                </div>
                <div className="flex items-center justify-between border-t px-4 py-2.5">
                  <Button variant="ghost" size="sm" disabled={count === 0} onClick={() => onChange({ ...emptyFilters(), category: filters.category, q: filters.q, sort: filters.sort })}>
                    Xoá lọc
                  </Button>
                  <Button size="sm" onClick={() => setOpen(false)}>
                    Xong
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <SortSelect value={filters.sort} onChange={(sort) => onChange({ ...filters, sort })} />
          </>
        )}
      </div>
      <ActiveFilterChips space={space} filters={filters} onChange={onChange} />
    </div>
  );
};

const SortSelect = ({ value, onChange, full = false }: { value: KnowledgeSort; onChange: (sort: KnowledgeSort) => void; full?: boolean }) => (
  <Select value={value} onValueChange={(next) => next && onChange(next)}>
    <SelectTrigger className={cn("shrink-0", full ? "w-full" : "w-auto min-w-40")} aria-label="Sắp xếp">
      <ArrowDownUp className="size-3.5 text-foreground-subtle" aria-hidden="true" />
      <SelectValue>{sortOptions.find((option) => option.value === value)?.label}</SelectValue>
    </SelectTrigger>
    <SelectContent align="end">
      {sortOptions.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const FilterSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="flex min-w-0 flex-col gap-2">
    <legend className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-foreground-subtle uppercase">{title}</legend>
    {children}
  </fieldset>
);

const chipClass = (on: boolean) =>
  cn(
    "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium outline-none transition-colors pointer-coarse:h-9",
    "focus-visible:ring-2 focus-visible:ring-ring",
    on ? "border-brand/40 bg-brand-soft text-brand-text" : "bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground"
  );

const FilterPanel = ({ space, filters, onChange }: Omit<Props, "compact">) => {
  const session = useSessionContext();
  const members = useKnowledgeMembers(space.id);
  const statuses = [...space.statuses].sort((a, b) => a.position - b.position);

  return (
    <>
      <FilterSection title="Trạng thái">
        <div className="flex flex-col gap-2.5">
          {statusGroupOrder.map((group: KnowledgeStatusGroup) => {
            const inGroup = statuses.filter((status) => status.group === group);
            if (inGroup.length === 0) return null;
            const groupOn = filters.groups.includes(group);
            return (
              <div key={group} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  aria-pressed={groupOn}
                  onClick={() => onChange({ ...filters, groups: toggle(filters.groups, group) })}
                  className={cn(chipClass(groupOn), "self-start")}
                  title={statusGroupMeta[group].description}
                >
                  {groupOn ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  Cả nhóm “{statusGroupMeta[group].label}”
                </button>
                <div className="flex flex-wrap gap-1.5 pl-1">
                  {inGroup.map((status) => {
                    const on = filters.statusIds.includes(status.id);
                    return (
                      <button
                        key={status.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange({ ...filters, statusIds: toggle(filters.statusIds, status.id) })}
                        className={chipClass(on)}
                      >
                        <span aria-hidden="true" className={cn(toneClass(status.color), "size-2 shrink-0 rounded-full bg-(--tone)")} />
                        <span className="truncate">{status.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection title="Mức quan trọng">
        <div className="flex flex-wrap gap-1.5">
          {importanceOrder.map((importance: KnowledgeImportance) => {
            const on = filters.importance.includes(importance);
            return (
              <button
                key={importance}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...filters, importance: toggle(filters.importance, importance) })}
                className={chipClass(on)}
              >
                <span aria-hidden="true" className={cn(toneClass(importanceMeta[importance].color), "size-2 shrink-0 rounded-full bg-(--tone)")} />
                {importanceMeta[importance].label}
              </button>
            );
          })}
        </div>
      </FilterSection>

      {space.tags.length > 0 ? (
        <FilterSection title="Tag">
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {space.tags.slice(0, 40).map((tag) => {
              const on = filters.tags.includes(tag.name);
              return (
                <button
                  key={tag.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...filters, tags: toggle(filters.tags, tag.name).slice(0, 10) })}
                  className={chipClass(on)}
                >
                  #{tag.name}
                  <span className="text-[10px] text-foreground-subtle tabular-nums">{tag.count}</span>
                </button>
              );
            })}
          </div>
        </FilterSection>
      ) : null}

      <FilterSection title="Người phụ trách">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={filters.owner === "me"}
            onClick={() => onChange({ ...filters, owner: filters.owner === "me" ? null : "me" })}
            className={chipClass(filters.owner === "me")}
          >
            <UserRound className="size-3.5" aria-hidden="true" />
            Tôi phụ trách
          </button>
          {(members.data?.items ?? [])
            .filter((member) => member.user.id !== session.user.id)
            .slice(0, 12)
            .map((member) => {
              const on = filters.owner === member.user.id;
              return (
                <button
                  key={member.user.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...filters, owner: on ? null : member.user.id })}
                  className={chipClass(on)}
                >
                  <UserAvatar user={member.user} size="xs" className="-ml-1 size-4 text-[8px]" />
                  <span className="truncate">{member.user.displayName}</span>
                </button>
              );
            })}
        </div>
      </FilterSection>

      <FilterSection title="Khác">
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span className="flex items-center gap-2">
            <AlarmClock className="size-4 text-warning" aria-hidden="true" />
            Tới hạn rà soát
          </span>
          <Switch checked={filters.reviewDue} onCheckedChange={(reviewDue) => onChange({ ...filters, reviewDue })} />
        </label>
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span className="flex items-center gap-2">
            <Pin className="size-4 rotate-45 text-brand-text" aria-hidden="true" />
            Chỉ mục đã ghim
          </span>
          <Switch checked={filters.pinned} onCheckedChange={(pinned) => onChange({ ...filters, pinned })} />
        </label>
      </FilterSection>
    </>
  );
};

/** Removable chips for the active filters + "Xoá lọc". */
const ActiveFilterChips = ({ space, filters, onChange }: Omit<Props, "compact">) => {
  const members = useKnowledgeMembers(space.id);
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...filters.groups.map((group) => ({
      key: `g-${group}`,
      label: statusGroupMeta[group].label,
      remove: () => onChange({ ...filters, groups: filters.groups.filter((entry) => entry !== group) })
    })),
    ...filters.statusIds.map((id) => ({
      key: `s-${id}`,
      label: space.statuses.find((status) => status.id === id)?.name ?? "Trạng thái",
      remove: () => onChange({ ...filters, statusIds: filters.statusIds.filter((entry) => entry !== id) })
    })),
    ...filters.importance.map((importance) => ({
      key: `i-${importance}`,
      label: importanceMeta[importance].label,
      remove: () => onChange({ ...filters, importance: filters.importance.filter((entry) => entry !== importance) })
    })),
    ...filters.tags.map((tag) => ({
      key: `t-${tag}`,
      label: `#${tag}`,
      remove: () => onChange({ ...filters, tags: filters.tags.filter((entry) => entry !== tag) })
    })),
    ...(filters.owner
      ? [
          {
            key: "owner",
            label:
              filters.owner === "me"
                ? "Tôi phụ trách"
                : `Phụ trách: ${members.data?.items.find((member) => member.user.id === filters.owner)?.user.displayName ?? "một người"}`,
            remove: () => onChange({ ...filters, owner: null })
          }
        ]
      : []),
    ...(filters.reviewDue ? [{ key: "review", label: "Tới hạn rà soát", remove: () => onChange({ ...filters, reviewDue: false }) }] : []),
    ...(filters.pinned ? [{ key: "pinned", label: "Đã ghim", remove: () => onChange({ ...filters, pinned: false }) }] : [])
  ];
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Bộ lọc đang bật">
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-muted pr-0.5 pl-2.5 text-xs text-foreground pointer-coarse:h-8">
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            aria-label={`Bỏ lọc ${chip.label}`}
            onClick={chip.remove}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-foreground-subtle outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-7"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Button
        variant="ghost"
        size="xs"
        className="text-foreground-muted"
        onClick={() => onChange({ ...emptyFilters(), category: filters.category, q: filters.q, sort: filters.sort })}
      >
        Xoá lọc
      </Button>
    </div>
  );
};
