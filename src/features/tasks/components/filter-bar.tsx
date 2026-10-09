import { cn } from "cn";
import {
  ArrowDownWideNarrow,
  CalendarClock,
  CircleDot,
  Flag,
  Search,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { PriorityFlag } from "@/components/shared/task-meta";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { TaskPriority, TaskSort } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";
import { priorityMeta } from "@/lib/task-meta";

import { activeFilterCount, type DueFilter, type TaskFilters } from "../filters";
import { useDirectory, useUserNames, useWorkflow } from "../hooks";
import { useDebouncedValue } from "../use-debounced-value";
import { useTaskFilters } from "../use-task-filters";
import { StatusIcon } from "./status-icon";

const dueOptions: readonly { value: DueFilter; label: string }[] = [
  { value: "overdue", label: "Quá hạn" },
  { value: "today", label: "Hôm nay" },
  { value: "week", label: "Tuần này" },
  { value: "none", label: "Không có hạn" }
];

const sortOptions: readonly { value: TaskSort; label: string }[] = [
  { value: "rank", label: "Thứ tự thủ công" },
  { value: "dueAt", label: "Hạn chót" },
  { value: "priority", label: "Mức ưu tiên" },
  { value: "createdAt", label: "Ngày tạo" },
  { value: "updatedAt", label: "Cập nhật gần đây" },
  { value: "title", label: "Tên" },
  { value: "number", label: "Mã công việc" }
];

const priorities: readonly TaskPriority[] = ["urgent", "high", "normal", "low"];

const toggle = <T,>(values: readonly T[], value: T) =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

/**
 * Filter / sort bar shared by List, Board and Table. All state lives in the URL (useTaskFilters);
 * search is debounced; due windows are computed in the browser's timezone.
 */
export const TaskFilterBar = ({
  projectId,
  listId,
  view
}: {
  projectId: string;
  listId: string;
  view: "list" | "board" | "table";
}) => {
  const { filters, setFilters, resetFilters } = useTaskFilters();
  const count = activeFilterCount(filters);

  return (
    <div
      role="toolbar"
      aria-label="Bộ lọc công việc"
      className="scrollbar-none -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 md:-mx-6 md:px-6"
    >
      <SearchField value={filters.q} onChange={(q) => setFilters({ q })} />
      <StatusFilter projectId={projectId} listId={listId} filters={filters} onChange={(statusIds) => setFilters({ statusIds })} />
      <AssigneeFilter projectId={projectId} filters={filters} onChange={(assigneeIds) => setFilters({ assigneeIds })} />
      <PriorityFilter filters={filters} onChange={(next) => setFilters({ priorities: next })} />
      <DueFilterButton filters={filters} onChange={(due) => setFilters({ due })} />
      <label className="flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-foreground-muted hover:bg-surface-hover">
        <Switch size="sm" checked={filters.includeDone} onCheckedChange={(includeDone) => setFilters({ includeDone })} />
        <span className="whitespace-nowrap">Hiện việc đã xong</span>
      </label>
      {view === "table" ? <SortControl filters={filters} onChange={(sort, order) => setFilters({ sort, order })} /> : null}
      {count > 0 ? (
        <Button variant="ghost" size="sm" onClick={resetFilters} className="shrink-0 text-foreground-muted">
          <X />
          Xóa lọc ({count})
        </Button>
      ) : null}
    </div>
  );
};

const SearchField = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // URL changed elsewhere (clear filters, back/forward): adopt it.
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }
  const debounced = useDebouncedValue(draft, 300);
  useEffect(() => {
    if (debounced.trim() !== value.trim()) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced draft
  }, [debounced]);

  return (
    <div className="relative flex h-7 w-44 shrink-0 items-center sm:w-56">
      <Search className="pointer-events-none absolute left-2 size-3.5 text-foreground-subtle" aria-hidden="true" />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && draft) {
            event.stopPropagation();
            setDraft("");
          }
        }}
        placeholder="Tìm công việc hoặc mã…"
        aria-label="Tìm công việc"
        className="h-7 w-full rounded-md border border-input bg-transparent pr-7 pl-7 text-[13px] outline-none placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          aria-label="Xóa từ khóa"
          onClick={() => setDraft("")}
          className="absolute right-1 inline-flex size-5 items-center justify-center rounded text-foreground-subtle hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
};

const FilterButton = ({
  icon: Icon,
  label,
  active,
  summary,
  children,
  widthClass = "w-64"
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  summary?: ReactNode;
  children: ReactNode;
  widthClass?: string;
}) => (
  <Popover>
    <PopoverTrigger
      render={
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "shrink-0 border-dashed font-normal text-foreground-muted",
            active && "border-solid border-brand/40 bg-brand-soft text-brand-text hover:bg-brand-soft hover:text-brand-text"
          )}
        />
      }
    >
      <Icon />
      <span>
        {label}
        {summary ? <span className="font-medium">{summary}</span> : null}
      </span>
    </PopoverTrigger>
    <PopoverContent align="start" className={cn("p-0", widthClass)}>
      {children}
    </PopoverContent>
  </Popover>
);

const StatusFilter = ({
  projectId,
  listId,
  filters,
  onChange
}: {
  projectId: string;
  listId: string;
  filters: TaskFilters;
  onChange: (statusIds: string[]) => void;
}) => {
  const workflow = useWorkflow(projectId, listId);
  const statuses = workflow.data?.items ?? [];
  const selected = statuses.filter((status) => filters.statusIds.includes(status.id));
  return (
    <FilterButton
      icon={CircleDot}
      label="Trạng thái"
      active={filters.statusIds.length > 0}
      summary={selected.length === 1 ? `: ${selected[0]?.name}` : selected.length > 1 ? `: ${selected.length}` : null}
    >
      <Command loop>
        <CommandInput placeholder="Lọc trạng thái…" autoFocus />
        <CommandList>
          <CommandEmpty>Không có trạng thái</CommandEmpty>
          <CommandGroup>
            {statuses.map((status) => (
              <CommandItem
                key={status.id}
                value={status.id}
                keywords={[status.name]}
                data-checked={filters.statusIds.includes(status.id)}
                onSelect={() => onChange(toggle(filters.statusIds, status.id))}
              >
                <StatusIcon status={status} />
                {status.name}
              </CommandItem>
            ))}
          </CommandGroup>
          {filters.statusIds.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem value="__clear" onSelect={() => onChange([])}>
                  Bỏ chọn tất cả
                </CommandItem>
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </FilterButton>
  );
};

const AssigneeFilter = ({
  projectId,
  filters,
  onChange
}: {
  projectId: string;
  filters: TaskFilters;
  onChange: (assigneeIds: string[]) => void;
}) => {
  const session = useSessionContext();
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 200);
  const directory = useDirectory({ projectId, q: q || undefined });
  const nameOf = useUserNames(projectId);
  const people = (directory.data?.items ?? []).filter((user) => user.id !== session.user.id);
  const labels = filters.assigneeIds.map((id) =>
    id === "me" ? "Tôi" : id === "none" ? "Chưa giao" : (nameOf(id) ?? "1 người")
  );

  return (
    <FilterButton
      icon={UserRound}
      label="Người làm"
      active={filters.assigneeIds.length > 0}
      summary={labels.length === 1 ? `: ${labels[0]}` : labels.length > 1 ? `: ${labels.length}` : null}
      widthClass="w-72"
    >
      <Command loop shouldFilter={false}>
        <CommandInput placeholder="Tìm người…" value={query} onValueChange={setQuery} autoFocus />
        <CommandList>
          {!q ? (
            <CommandGroup>
              <CommandItem value="me" data-checked={filters.assigneeIds.includes("me")} onSelect={() => onChange(toggle(filters.assigneeIds, "me"))}>
                <UserAvatar user={session.user} size="xs" />
                Tôi
              </CommandItem>
              <CommandItem value="none" data-checked={filters.assigneeIds.includes("none")} onSelect={() => onChange(toggle(filters.assigneeIds, "none"))}>
                <span className="flex size-5 items-center justify-center rounded-full border border-dashed border-border-strong">
                  <UserRound className="size-3 text-foreground-subtle" />
                </span>
                Chưa giao
              </CommandItem>
            </CommandGroup>
          ) : null}
          <CommandGroup heading="Thành viên">
            {people.length === 0 ? (
              <p className="px-2 py-3 text-[13px] text-foreground-muted">
                {directory.isPending ? "Đang tải…" : "Không tìm thấy ai phù hợp"}
              </p>
            ) : (
              people.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.id}
                  data-checked={filters.assigneeIds.includes(user.id)}
                  onSelect={() => onChange(toggle(filters.assigneeIds, user.id))}
                >
                  <UserAvatar user={user} size="xs" />
                  <span className="truncate">{user.displayName}</span>
                </CommandItem>
              ))
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </FilterButton>
  );
};

const PriorityFilter = ({ filters, onChange }: { filters: TaskFilters; onChange: (priorities: TaskPriority[]) => void }) => (
  <FilterButton
    icon={Flag}
    label="Ưu tiên"
    active={filters.priorities.length > 0}
    summary={
      filters.priorities.length === 1 && filters.priorities[0]
        ? `: ${priorityMeta[filters.priorities[0]].label}`
        : filters.priorities.length > 1
          ? `: ${filters.priorities.length}`
          : null
    }
    widthClass="w-52"
  >
    <Command loop>
      <CommandList>
        <CommandGroup>
          {priorities.map((priority) => (
            <CommandItem
              key={priority}
              value={priority}
              data-checked={filters.priorities.includes(priority)}
              onSelect={() => onChange(toggle(filters.priorities, priority))}
            >
              <PriorityFlag priority={priority} showLabel className="text-sm text-foreground" />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </FilterButton>
);

const DueFilterButton = ({ filters, onChange }: { filters: TaskFilters; onChange: (due: DueFilter | null) => void }) => (
  <FilterButton
    icon={CalendarClock}
    label="Hạn chót"
    active={filters.due !== null}
    summary={filters.due ? `: ${dueOptions.find((option) => option.value === filters.due)?.label ?? ""}` : null}
    widthClass="w-48"
  >
    <Command loop>
      <CommandList>
        <CommandGroup>
          {dueOptions.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              data-checked={filters.due === option.value}
              onSelect={() => onChange(filters.due === option.value ? null : option.value)}
            >
              {option.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </FilterButton>
);

const SortControl = ({
  filters,
  onChange
}: {
  filters: TaskFilters;
  onChange: (sort: TaskSort, order: "asc" | "desc") => void;
}) => (
  <FilterButton
    icon={ArrowDownWideNarrow}
    label="Sắp xếp"
    active={filters.sort !== "rank"}
    summary={filters.sort !== "rank" ? `: ${sortOptions.find((option) => option.value === filters.sort)?.label ?? ""} ${filters.order === "desc" ? "↓" : "↑"}` : null}
    widthClass="w-56"
  >
    <Command loop>
      <CommandList>
        <CommandGroup heading="Sắp xếp theo">
          {sortOptions.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              data-checked={filters.sort === option.value}
              onSelect={() => onChange(option.value, filters.sort === option.value && filters.order === "asc" && option.value !== "rank" ? "desc" : "asc")}
            >
              {option.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {filters.sort !== "rank" ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Thứ tự">
              <CommandItem value="asc" data-checked={filters.order === "asc"} onSelect={() => onChange(filters.sort, "asc")}>
                Tăng dần
              </CommandItem>
              <CommandItem value="desc" data-checked={filters.order === "desc"} onSelect={() => onChange(filters.sort, "desc")}>
                Giảm dần
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </Command>
  </FilterButton>
);
