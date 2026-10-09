import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, FilterX, MoreHorizontal, SearchX, TableProperties } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { TaskSort, TaskSummary } from "@/contracts/work";

import { flattenPages } from "../cache";
import { ConfirmHost } from "../components/confirm-host";
import { InlineEditorHost } from "../components/inline-editor-host";
import { AssigneesCell, DueCell, PriorityCell, StatusCell, TaskCounts } from "../components/task-cells";
import { formatFullDate, formatShortDate } from "../due";
import { filtersToQuery } from "../filters";
import { useTaskPages } from "../hooks";
import { useInlineEditor } from "../inline-editor-context";
import { useTaskAbilities, useRowMenuActions, type TaskAbilities } from "../use-task-abilities";
import { useTaskFilters } from "../use-task-filters";
import { useTaskPanel } from "../use-task-panel";
import type { TaskViewProps } from "./registry";
import { ViewSkeleton } from "./view-skeletons";

const ROW_HEIGHT = 38;

type ColumnMeta = {
  label: string;
  width: string;
  sort?: TaskSort;
  sticky?: number;
  hideable?: boolean;
};

const dateCell = (iso: string) => (
  <span className="text-xs text-foreground-muted tabular-nums" title={formatFullDate(iso)}>
    {format(new Date(iso), "dd/MM/yyyy", { locale: vi })}
  </span>
);

const columnMeta = (column: { columnDef: { meta?: unknown } }) => column.columnDef.meta as ColumnMeta;

type MenuActionsBuilder = ReturnType<typeof useRowMenuActions>;

const buildColumns = (abilities: TaskAbilities, menuActions: MenuActionsBuilder): ColumnDef<TaskSummary>[] => [
  {
    id: "key",
    header: "Mã",
    meta: { label: "Mã", width: "96px", sort: "number", sticky: 0 } satisfies ColumnMeta,
    cell: ({ row }) => <span className="font-mono text-[11px] text-foreground-subtle">{row.original.key}</span>
  },
  {
    id: "title",
    header: "Tên công việc",
    meta: { label: "Tên công việc", width: "minmax(16rem, 1fr)", sort: "title", sticky: 96 } satisfies ColumnMeta,
    cell: ({ row }) => <TitleCell task={row.original} abilities={abilities} />
  },
  {
    id: "status",
    header: "Trạng thái",
    meta: { label: "Trạng thái", width: "150px", hideable: true } satisfies ColumnMeta,
    cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-1">
        <StatusCell task={row.original} editable={abilities.canEdit} />
        <span className="truncate text-xs">{row.original.status.name}</span>
      </span>
    )
  },
  {
    id: "assignees",
    header: "Người thực hiện",
    meta: { label: "Người thực hiện", width: "140px", hideable: true } satisfies ColumnMeta,
    cell: ({ row }) => <AssigneesCell task={row.original} editable={abilities.canAssign} max={4} />
  },
  {
    id: "priority",
    header: "Ưu tiên",
    meta: { label: "Ưu tiên", width: "120px", sort: "priority", hideable: true } satisfies ColumnMeta,
    cell: ({ row }) => <PriorityCell task={row.original} editable={abilities.canEdit} showLabel />
  },
  {
    id: "start",
    header: "Bắt đầu",
    meta: { label: "Ngày bắt đầu", width: "112px", hideable: true } satisfies ColumnMeta,
    cell: ({ row }) => <StartCell task={row.original} editable={abilities.canEdit} />
  },
  {
    id: "due",
    header: "Hạn chót",
    meta: { label: "Hạn chót", width: "120px", sort: "dueAt", hideable: true } satisfies ColumnMeta,
    cell: ({ row }) => <DueCell task={row.original} editable={abilities.canEdit} />
  },
  {
    id: "created",
    header: "Ngày tạo",
    meta: { label: "Ngày tạo", width: "112px", sort: "createdAt", hideable: true } satisfies ColumnMeta,
    cell: ({ row }) => dateCell(row.original.createdAt)
  },
  {
    id: "updated",
    header: "Cập nhật",
    meta: { label: "Cập nhật", width: "112px", sort: "updatedAt", hideable: true } satisfies ColumnMeta,
    cell: ({ row }) => dateCell(row.original.updatedAt)
  },
  {
    id: "actions",
    header: "",
    meta: { label: "", width: "40px" } satisfies ColumnMeta,
    cell: ({ row }) => <RowMenuButton task={row.original} menuActions={menuActions} />
  }
];

const visibilityKey = (listId: string) => `nesso.tasks.table.columns.${listId}`;

const readVisibility = (listId: string): VisibilityState => {
  try {
    const raw = window.localStorage.getItem(visibilityKey(listId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as VisibilityState) : {};
  } catch {
    return {};
  }
};

/**
 * Table view (PD-003): server-side sort (header click → ?sort/&order, rank by default), sticky
 * header + key/title columns, virtualized rows with infinite scroll, inline editable cells,
 * column visibility remembered per list.
 */
const TableView = ({ project, list, openTask }: TaskViewProps) => {
  const { filters, setFilters, resetFilters } = useTaskFilters();
  const abilities = useTaskAbilities(project);
  const query = useMemo(() => filtersToQuery(filters, { listId: list.id, view: "table" }), [filters, list.id]);
  const pages = useTaskPages(project.id, query);
  const items = useMemo(() => flattenPages(pages.data), [pages.data]);
  const [visibility, setVisibility] = useState<VisibilityState>(() => readVisibility(list.id));
  const menuActions = useRowMenuActions(abilities, openTask);
  const columns = useMemo(() => buildColumns(abilities, menuActions), [abilities, menuActions]);
  const { taskId: selectedTaskId } = useTaskPanel();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // eslint-disable-next-line react-hooks/incompatible-library -- table instance is read during render on purpose
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: (updater) =>
      setVisibility((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        try {
          window.localStorage.setItem(visibilityKey(list.id), JSON.stringify(next));
        } catch {
          // Storage unavailable: keep the choice for this session only.
        }
        return next;
      }),
    manualSorting: true
  });
  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const template = visibleColumns.map((column) => columnMeta(column).width).join(" ");

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 14,
    getItemKey: (index) => rows[index]?.id ?? index
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= rows.length - 10) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, lastIndex, rows.length, fetchNextPage]);

  const sortBy = useCallback(
    (sort: TaskSort) => {
      if (filters.sort !== sort) setFilters({ sort, order: "asc" });
      else if (filters.order === "asc") setFilters({ sort, order: "desc" });
      else setFilters({ sort: "rank", order: "asc" });
    },
    [filters.sort, filters.order, setFilters]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const index = Number(target.dataset.rowIndex);
    if (Number.isNaN(index) || target.dataset.row !== "table") return;
    if (event.key === "Enter") {
      event.preventDefault();
      const id = rows[index]?.id;
      if (id) openTask(id);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = index + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0 || next >= rows.length) return;
      virtualizer.scrollToIndex(next, { align: "auto" });
      requestAnimationFrame(() =>
        scrollRef.current?.querySelector<HTMLElement>(`[data-row-index="${next}"]`)?.focus({ preventScroll: true })
      );
    }
  };

  if (pages.isPending) return <ViewSkeleton view="table" />;
  if (pages.isError) {
    return <ErrorState error={pages.error} onRetry={() => void pages.refetch()} retrying={pages.isFetching} />;
  }

  const filtering = filters.q || filters.assigneeIds.length || filters.priorities.length || filters.due || filters.statusIds.length || !filters.includeDone;

  return (
    <InlineEditorHost>
      <ConfirmHost />
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 px-4 text-xs text-foreground-muted md:px-6">
          <span className="tabular-nums">
            {items.length}
            {pages.hasNextPage ? "+" : ""} công việc
          </span>
          {pages.isFetching ? <Spinner className="size-3" /> : null}
          <ColumnsMenu table={table} />
        </div>
        {items.length === 0 ? (
          filtering ? (
            <EmptyState
              icon={SearchX}
              title="Không có công việc phù hợp"
              description="Thử nới lỏng bộ lọc hoặc tìm theo từ khóa khác."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <FilterX />
                  Xóa bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={TableProperties}
              title="Danh sách chưa có công việc"
              description="Tạo công việc bằng nút “Công việc” ở phía trên — bảng tính sẽ cập nhật ngay."
            />
          )
        ) : (
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto overscroll-contain border-t" onKeyDown={onKeyDown}>
            <div role="grid" aria-rowcount={rows.length} aria-label={`Bảng tính ${list.name}`} className="min-w-max">
              <div
                role="row"
                className="sticky top-0 z-20 grid h-9 border-b bg-background/95 text-xs font-medium text-foreground-muted backdrop-blur-sm"
                style={{ gridTemplateColumns: template }}
              >
                {table.getHeaderGroups()[0]?.headers.map((header) => {
                  const meta = columnMeta(header.column);
                  const active = meta.sort !== undefined && filters.sort === meta.sort;
                  return (
                    <div
                      key={header.id}
                      role="columnheader"
                      aria-sort={active ? (filters.order === "asc" ? "ascending" : "descending") : undefined}
                      className={cn("flex items-center border-r border-border/60 px-2 last:border-r-0", meta.sticky !== undefined && "sticky z-10 bg-background")}
                      style={meta.sticky !== undefined ? { left: meta.sticky } : undefined}
                    >
                      {meta.sort ? (
                        <button
                          type="button"
                          onClick={() => meta.sort && sortBy(meta.sort)}
                          className={cn(
                            "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                            active && "text-foreground"
                          )}
                          title="Sắp xếp"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {active ? (
                            filters.order === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                {virtualItems.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) return null;
                  const selected = row.id === selectedTaskId;
                  return (
                    <div
                      key={virtualRow.key}
                      role="row"
                      tabIndex={virtualRow.index === activeIndex ? 0 : -1}
                      onFocus={() => setActiveIndex(virtualRow.index)}
                      data-row="table"
                      data-row-index={virtualRow.index}
                      aria-rowindex={virtualRow.index + 2}
                      aria-selected={selected}
                      onClick={() => openTask(row.id)}
                      className={cn(
                        "group/row absolute inset-x-0 top-0 grid cursor-default border-b border-border/60 text-[13px] outline-none hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        selected && "bg-brand-soft hover:bg-brand-soft"
                      )}
                      style={{ height: ROW_HEIGHT, transform: `translateY(${virtualRow.start}px)`, gridTemplateColumns: template }}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = columnMeta(cell.column);
                        return (
                          <div
                            key={cell.id}
                            role="gridcell"
                            className={cn(
                              "flex min-w-0 items-center border-r border-border/40 px-2 last:border-r-0",
                              meta.sticky !== undefined && "sticky z-10 bg-background group-hover/row:bg-surface-hover",
                              meta.sticky !== undefined && selected && "bg-brand-soft"
                            )}
                            style={meta.sticky !== undefined ? { left: meta.sticky } : undefined}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {pages.isFetchingNextPage ? (
                <div className="flex h-10 items-center justify-center gap-2 text-xs text-foreground-muted">
                  <Spinner className="size-3.5" />
                  Đang tải thêm…
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </InlineEditorHost>
  );
};

export default TableView;

const TitleCell = ({ task, abilities: _abilities }: { task: TaskSummary; abilities: TaskAbilities }) => (
  <span className="flex min-w-0 items-center gap-2">
    <span className={cn("truncate", task.status.category !== "active" && "text-foreground-muted line-through decoration-foreground-subtle/60")}>
      {task.title}
    </span>
    <TaskCounts task={task} showSubtasks />
  </span>
);

const StartCell = ({ task, editable }: { task: TaskSummary; editable: boolean }) => {
  const openEditor = useInlineEditor();
  const label = task.startAt ? formatShortDate(task.startAt) : "—";
  if (!editable || !openEditor) return <span className="text-xs text-foreground-muted">{label}</span>;
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        openEditor({ kind: "start", task, anchor: event.currentTarget });
      }}
      aria-label={task.startAt ? `Ngày bắt đầu: ${formatFullDate(task.startAt)}` : "Đặt ngày bắt đầu"}
      className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
};

const RowMenuButton = ({ task, menuActions }: { task: TaskSummary; menuActions: MenuActionsBuilder }) => {
  const openEditor = useInlineEditor();
  return (
    <button
      type="button"
      aria-label={`Thao tác cho ${task.key}`}
      onClick={(event) => {
        event.stopPropagation();
        openEditor?.({ kind: "menu", task, anchor: event.currentTarget, actions: menuActions(task) });
      }}
      className="inline-flex size-7 items-center justify-center rounded-md text-foreground-subtle opacity-0 outline-none group-hover/row:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <MoreHorizontal className="size-4" />
    </button>
  );
};

const ColumnsMenu = ({ table }: { table: ReturnType<typeof useReactTable<TaskSummary>> }) => (
  <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="xs" className="ml-auto text-foreground-muted" />}>
      <Columns3 />
      Cột
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Hiển thị cột</DropdownMenuLabel>
        {table
          .getAllLeafColumns()
          .filter((column) => columnMeta(column).hideable)
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(checked) => column.toggleVisibility(Boolean(checked))}
            >
              {columnMeta(column).label}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);
