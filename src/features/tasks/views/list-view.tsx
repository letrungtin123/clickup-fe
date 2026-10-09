import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import type { QueryKey } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import { ChevronRight, FilterX, ListPlus, MoreHorizontal, PencilLine, Plus, RefreshCw, SearchX } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject
} from "react";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { List, Project, TaskStatus, TaskSummary } from "@/contracts/work";
import { toneClass } from "@/lib/colors";
import { qk, type TaskQueryParams } from "@/lib/query-keys";

import { flattenPages } from "../cache";
import { ConfirmHost } from "../components/confirm-host";
import { InlineEditorHost } from "../components/inline-editor-host";
import { QuickAdd } from "../components/quick-add";
import { StatusIcon } from "../components/status-icon";
import { AssigneesCell, DueCell, PriorityCell, StatusCell, TaskCounts } from "../components/task-cells";
import {
  dropIndicatorFrom,
  groupDroppableId,
  TaskMouseSensor,
  TaskTouchSensor,
  taskCollisionDetection,
  type DragData
} from "../dnd";
import { filtersToQuery, hasNarrowingFilters } from "../filters";
import { useChildTasks, useCreateTask, useMoveTask, useTaskPages, useWorkflow } from "../hooks";
import { useInlineEditor } from "../inline-editor-context";
import { computeDropPlacement, isNoopDrop } from "../placement";
import { confirmParentCompletion, toStatusRef, useTaskActions } from "../use-task-actions";
import { useTaskAbilities, useRowMenuActions, type TaskAbilities } from "../use-task-abilities";
import { useCollapsedGroups } from "../use-collapsed-groups";
import { useTaskFilters } from "../use-task-filters";
import { useTaskPanel } from "../use-task-panel";
import { useDropStore, useRowFocusStore } from "../view-stores";
import type { TaskViewProps } from "./registry";
import { ViewSkeleton } from "./view-skeletons";

const ROW_HEIGHT = 36;
const INDENT = 20;
const MAX_DEPTH = 6;

type Row =
  | { kind: "task"; key: string; task: TaskSummary; depth: number }
  | { kind: "loading"; key: string; depth: number }
  | { kind: "error"; key: string; depth: number; retry: () => void }
  | { kind: "more"; key: string; depth: number; parent: TaskSummary };

type GroupEntry = {
  status: TaskStatus;
  queryKey: QueryKey;
  items: TaskSummary[];
  rowIds: string[];
  scrollToTask: (taskId: string) => void;
};

type GroupStats = { loaded: boolean; count: number; error: boolean };

type MenuActionsBuilder = ReturnType<typeof useRowMenuActions>;

/**
 * List view (PD-003): collapsible status groups, each paged independently and virtualized against
 * the shared scroll container; lazy nested subtasks; inline editing; drag & drop between groups
 * with neighbour placement; ↑/↓ + Enter keyboard navigation.
 */
const ListView = ({ project, list, openTask }: TaskViewProps) => {
  const { filters, resetFilters } = useTaskFilters();
  const workflow = useWorkflow(project.id, list.id);
  const abilities = useTaskAbilities(project);
  const flat = hasNarrowingFilters(filters);
  const baseQuery = useMemo(
    () => filtersToQuery(filters, { listId: list.id, view: "list" }),
    [filters, list.id]
  );
  const statuses = useMemo(
    () =>
      (workflow.data?.items ?? []).filter(
        (status) =>
          (filters.statusIds.length === 0 || filters.statusIds.includes(status.id)) &&
          (filters.includeDone || status.category === "active")
      ),
    [workflow.data, filters.statusIds, filters.includeDone]
  );
  const collapsed = useCollapsedGroups(list.id);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const registry = useRef(new Map<string, GroupEntry>());
  const [stats, setStats] = useState<Record<string, GroupStats>>({});
  const reportStats = useCallback((statusId: string, next: GroupStats) => {
    setStats((current) => {
      const previous = current[statusId];
      if (previous && previous.loaded === next.loaded && previous.count === next.count && previous.error === next.error) {
        return current;
      }
      return { ...current, [statusId]: next };
    });
  }, []);
  const { taskId: selectedTaskId } = useTaskPanel();
  const [quickAddGroup, setQuickAddGroup] = useState<string | null>(null);
  const actions = useTaskActions();
  const menuActions = useRowMenuActions(abilities, openTask);
  const onQuickAddOpenChange = useCallback((statusId: string, open: boolean) => setQuickAddGroup((current) => (open ? statusId : current === statusId ? null : current)), []);

  // --- Drag & drop -------------------------------------------------------------------------------
  const move = useMoveTask();
  const [activeTask, setActiveTask] = useState<TaskSummary | null>(null);
  const setDropTarget = useDropStore((state) => state.setTarget);
  const sensors = useSensors(
    // Mouse + touch (not Pointer): a finger scrolling the list must never start a drag; touch drags
    // need a short press instead.
    useSensor(TaskMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TaskTouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    setActiveTask(data?.task ?? null);
  };
  const onDragMove = (event: DragMoveEvent) => setDropTarget(dropIndicatorFrom(event));
  const onDragCancel = () => {
    setActiveTask(null);
    setDropTarget(null);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const data = event.active.data.current as DragData | undefined;
    const target = dropIndicatorFrom(event);
    setActiveTask(null);
    setDropTarget(null);
    if (!data || !target) return;
    const source = registry.current.get(data.groupId);
    const destination = registry.current.get(target.groupId);
    if (!source || !destination) return;
    const task = data.task;
    const sameGroup = source.status.id === destination.status.id;
    if (sameGroup && (flat || isNoopDrop(destination.items, task.id, target))) return;
    const placement = computeDropPlacement(destination.items, task.id, target);
    const status = destination.status;
    void (async () => {
      if (!sameGroup && !(await confirmParentCompletion(task, status))) return;
      move.mutate({
        task,
        input: {
          ...(sameGroup ? {} : { statusId: status.id }),
          ...(flat ? {} : { placement })
        },
        optimistic: { status: toStatusRef(status) },
        anchor: { queryKey: destination.queryKey, placement }
      });
    })();
  };

  // --- Keyboard navigation ------------------------------------------------------------------------
  const focusRow = useRowFocusStore((state) => state.focus);
  // A fresh view starts with the first row as the Tab stop.
  useEffect(() => focusRow(null), [focusRow]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const taskId = target.dataset.taskId;
    if (!taskId || target.dataset.row !== "task") return;
    if (event.key === "Enter") {
      event.preventDefault();
      openTask(taskId);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const order = statuses
      .map((status) => registry.current.get(status.id))
      .filter((entry): entry is GroupEntry => Boolean(entry && entry.rowIds.length > 0));
    const flatIds = order.flatMap((entry) => entry.rowIds.map((id) => ({ id, entry })));
    const index = flatIds.findIndex((item) => item.id === taskId);
    const next = flatIds[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    next.entry.scrollToTask(next.id);
    focusRow(next.id, true);
  };

  if (workflow.isPending) return <ViewSkeleton view="list" />;
  if (workflow.isError) {
    return (
      <ErrorState error={workflow.error} onRetry={() => void workflow.refetch()} retrying={workflow.isFetching} />
    );
  }

  const visibleStats = statuses.map((status) => stats[status.id]);
  const allLoaded = visibleStats.every((entry) => entry?.loaded || entry?.error);
  const allEmpty = statuses.length === 0 || (allLoaded && visibleStats.every((entry) => (entry?.count ?? 0) === 0));
  const filtering = flat || filters.statusIds.length > 0 || !filters.includeDone;
  // Nothing to show at all: one clear empty state instead of a stack of empty groups (the groups
  // stay mounted, hidden, so realtime refreshes still reach them).
  const listEmpty = allLoaded && allEmpty && quickAddGroup === null;
  const firstGroupId = statuses.find((status) => (stats[status.id]?.count ?? 0) > 0)?.id ?? null;

  return (
    <InlineEditorHost>
      <ConfirmHost />
      <div
        ref={scrollRef}
        className="relative h-full overflow-auto overscroll-contain"
        onKeyDown={onKeyDown}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={taskCollisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="flex min-w-[20rem] flex-col gap-3 px-2 pt-2 pb-24 md:px-4">
            {flat ? (
              <p className="px-2 pt-1 text-xs text-foreground-muted">
                Đang lọc: hiển thị cả việc con khớp bộ lọc. Kéo thả chỉ đổi trạng thái.
              </p>
            ) : null}
            {statuses.map((status) => (
              <StatusGroup
                key={status.id}
                project={project}
                list={list}
                status={status}
                baseQuery={baseQuery}
                flat={flat}
                hideWhenEmpty={filtering}
                hidden={listEmpty}
                tabbableFirst={status.id === firstGroupId}
                collapsed={collapsed.isCollapsed(status)}
                onToggleCollapsed={collapsed.toggle}
                scrollRef={scrollRef}
                registry={registry}
                onStats={reportStats}
                abilities={abilities}
                openTask={openTask}
                selectedTaskId={selectedTaskId}
                quickAddOpen={quickAddGroup === status.id}
                onQuickAddOpenChange={onQuickAddOpenChange}
                onRename={actions.rename}
                menuActions={menuActions}
              />
            ))}
            {listEmpty ? (
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
                  icon={ListPlus}
                  title="Danh sách chưa có công việc"
                  description="Thêm công việc đầu tiên — nhấn Enter để tạo liên tiếp nhiều việc."
                  action={
                    abilities.canCreate && statuses[0] ? (
                      <Button size="sm" onClick={() => setQuickAddGroup(statuses[0]?.id ?? null)}>
                        <Plus />
                        Thêm công việc
                      </Button>
                    ) : undefined
                  }
                />
              )
            ) : null}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeTask ? <RowPreview task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </InlineEditorHost>
  );
};

export default ListView;

// --- Group ---------------------------------------------------------------------------------------

type StatusGroupProps = {
  project: Project;
  list: List;
  status: TaskStatus;
  baseQuery: TaskQueryParams;
  flat: boolean;
  hideWhenEmpty: boolean;
  hidden: boolean;
  tabbableFirst: boolean;
  collapsed: boolean;
  onToggleCollapsed: (status: TaskStatus) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  registry: RefObject<Map<string, GroupEntry>>;
  onStats: (statusId: string, stats: GroupStats) => void;
  abilities: TaskAbilities;
  openTask: (taskId: string) => void;
  selectedTaskId: string | null;
  quickAddOpen: boolean;
  onQuickAddOpenChange: (statusId: string, open: boolean) => void;
  onRename: (task: TaskSummary, title: string) => void;
  menuActions: MenuActionsBuilder;
};

const StatusGroup = memo(function StatusGroup({
  project,
  list,
  status,
  baseQuery,
  flat,
  hideWhenEmpty,
  hidden,
  tabbableFirst,
  collapsed,
  onToggleCollapsed,
  scrollRef,
  registry,
  onStats,
  abilities,
  openTask,
  selectedTaskId,
  quickAddOpen,
  onQuickAddOpenChange,
  onRename,
  menuActions
}: StatusGroupProps) {
  const query = useMemo(() => ({ ...baseQuery, statusIds: [status.id] }), [baseQuery, status.id]);
  const queryKey = useMemo(() => qk.tasks(project.id, query), [project.id, query]);
  const pages = useTaskPages(project.id, query);
  const items = useMemo(() => flattenPages(pages.data), [pages.data]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const childBase = useMemo<TaskQueryParams>(
    () => ({ listId: list.id, includeDone: baseQuery.includeDone }),
    [list.id, baseQuery.includeDone]
  );
  const children = useChildTasks(project.id, childBase, flat ? [] : expanded);
  const create = useCreateTask();

  const rows = useMemo(() => {
    const out: Row[] = [];
    const visit = (task: TaskSummary, depth: number) => {
      out.push({ kind: "task", key: task.id, task, depth });
      if (flat || !expanded.includes(task.id) || depth >= MAX_DEPTH) return;
      const child = children.get(task.id);
      if (!child || child.isPending) {
        out.push({ kind: "loading", key: `loading:${task.id}`, depth: depth + 1 });
      } else if (child.isError || !child.data) {
        out.push({ kind: "error", key: `error:${task.id}`, depth: depth + 1, retry: child.refetch });
      } else {
        for (const item of child.data.items) visit(item, depth + 1);
        if (child.data.pageInfo.hasMore) out.push({ kind: "more", key: `more:${task.id}`, depth: depth + 1, parent: task });
      }
    };
    items.forEach((task) => visit(task, 0));
    return out;
  }, [items, expanded, children, flat]);

  const emptyHidden =
    hideWhenEmpty && !collapsed && !pages.isPending && !pages.isError && items.length === 0 && !quickAddOpen;

  // Offset of this group's rows inside the shared scroll container (virtualizer scrollMargin).
  const listRef = useRef<HTMLDivElement | null>(null);
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const element = listRef.current;
    if (!scroller || !element) return undefined;
    const measure = () => {
      const top = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      setMargin((previous) => (Math.abs(previous - top) < 0.5 ? previous : top));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller.firstElementChild ?? scroller);
    return () => observer.disconnect();
  }, [scrollRef, collapsed, emptyHidden, hidden, pages.isPending]);

  // eslint-disable-next-line react-hooks/incompatible-library -- virtual rows are read during render on purpose
  const virtualizer = useVirtualizer({
    count: collapsed ? 0 : rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: margin,
    getItemKey: (index) => rows[index]?.key ?? index
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  useEffect(() => {
    if (!collapsed && hasNextPage && !isFetchingNextPage && lastIndex >= rows.length - 8) {
      void fetchNextPage();
    }
  }, [collapsed, hasNextPage, isFetchingNextPage, lastIndex, rows.length, fetchNextPage]);

  useEffect(() => {
    const map = registry.current;
    map.set(status.id, {
      status,
      queryKey,
      items,
      rowIds: collapsed ? [] : rows.flatMap((row) => (row.kind === "task" ? [row.task.id] : [])),
      scrollToTask: (taskId) => {
        const index = rows.findIndex((row) => row.kind === "task" && row.task.id === taskId);
        if (index !== -1) virtualizer.scrollToIndex(index, { align: "auto" });
      }
    });
  });
  useEffect(() => () => void registry.current.delete(status.id), [registry, status.id]);
  useEffect(() => {
    onStats(status.id, { loaded: !pages.isPending, count: items.length, error: pages.isError });
  }, [onStats, status.id, pages.isPending, pages.isError, items.length]);

  const toggleExpanded = useCallback(
    (taskId: string) =>
      setExpanded((current) => (current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId])),
    []
  );

  const { setNodeRef } = useDroppable({
    id: groupDroppableId(status.id),
    data: { kind: "group", groupId: status.id },
    disabled: !abilities.canEdit
  });
  const dropIntoGroup = useDropStore((state) => state.target?.groupId === status.id);

  const onCreate = (title: string) => {
    const last = items[items.length - 1];
    const placement = !flat && last ? { afterId: last.id } : null;
    return create.mutateAsync({
      projectId: project.id,
      input: { listId: list.id, title, statusId: status.id, ...(placement ? { placement } : {}) },
      anchor: { queryKey, placement }
    });
  };

  if (emptyHidden) {
    return null;
  }

  const countLabel = pages.isPending && !collapsed ? "…" : `${items.length}${pages.hasNextPage ? "+" : ""}`;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${status.name}: ${countLabel} công việc`}
      hidden={hidden}
      className={cn(
        "rounded-lg transition-colors duration-150",
        dropIntoGroup && "bg-brand-soft/40"
      )}
    >
      <div className="group/header sticky top-0 z-10 -mx-1 flex h-10 items-center gap-1.5 bg-background/92 px-1 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => onToggleCollapsed(status)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Mở nhóm ${status.name}` : `Thu gọn nhóm ${status.name}`}
          className="inline-flex size-6 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            className={cn("size-4 transition-transform duration-150 motion-reduce:transition-none", !collapsed && "rotate-90")}
            aria-hidden="true"
          />
        </button>
        <span
          className={cn(
            toneClass(status.color),
            "inline-flex h-6 items-center gap-1.5 rounded-md bg-(--tone-soft) px-2 text-xs font-semibold text-(--tone-text)"
          )}
        >
          <StatusIcon status={status} size="sm" />
          {status.name}
        </span>
        <span className="text-xs text-foreground-muted tabular-nums">{collapsed && !pages.data ? "" : countLabel}</span>
        {pages.isFetching && !pages.isPending ? <Spinner className="size-3 text-foreground-subtle" /> : null}
        {abilities.canCreate ? (
          <button
            type="button"
            onClick={() => {
              if (collapsed) onToggleCollapsed(status);
              onQuickAddOpenChange(status.id, true);
            }}
            aria-label={`Thêm công việc vào ${status.name}`}
            className="inline-flex size-6 items-center justify-center rounded-md text-foreground-subtle opacity-0 outline-none group-hover/header:opacity-100 hover:bg-surface-hover hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-9 pointer-coarse:opacity-100"
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        {!collapsed ? (
          <div className="ml-auto hidden items-center gap-1 pr-9 text-[11px] font-medium whitespace-nowrap text-foreground-subtle md:flex" aria-hidden="true">
            <span className="w-20 text-center">Người làm</span>
            <span className="w-24 text-center">Hạn chót</span>
            <span className="w-12 text-center">Ưu tiên</span>
          </div>
        ) : null}
      </div>

      {collapsed ? null : (
        <div className="flex flex-col">
          {pages.isPending ? (
            <GroupSkeleton />
          ) : pages.isError ? (
            <div className="flex items-center gap-2 px-3 py-2 text-[13px] text-foreground-muted" role="alert">
              Không tải được nhóm này.
              <Button variant="ghost" size="xs" onClick={() => void pages.refetch()}>
                <RefreshCw />
                Thử lại
              </Button>
            </div>
          ) : null}
          <div
            ref={listRef}
            role="list"
            aria-label={status.name}
            className="relative"
            style={{ height: pages.isPending ? 0 : virtualizer.getTotalSize() }}
          >
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              return (
                <div
                  key={virtualRow.key}
                  className="absolute inset-x-0 top-0"
                  style={{ height: ROW_HEIGHT, transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)` }}
                >
                  {row.kind === "task" ? (
                    <ListRow
                      task={row.task}
                      depth={row.depth}
                      groupId={status.id}
                      flat={flat}
                      draggable={abilities.canEdit && (flat || row.depth === 0)}
                      droppable={abilities.canEdit && row.depth === 0}
                      abilities={abilities}
                      expanded={expanded.includes(row.task.id)}
                      onToggleExpanded={toggleExpanded}
                      openTask={openTask}
                      selected={row.task.id === selectedTaskId}
                      onRename={onRename}
                      menuActions={menuActions}
                      tabbable={tabbableFirst && virtualRow.index === 0}
                    />
                  ) : row.kind === "loading" ? (
                    <div className="flex h-full items-center gap-2" style={{ paddingLeft: 30 + row.depth * INDENT }}>
                      <Skeleton className="size-3.5 rounded-full" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  ) : row.kind === "error" ? (
                    <div className="flex h-full items-center gap-2 text-xs text-foreground-muted" style={{ paddingLeft: 30 + row.depth * INDENT }}>
                      Không tải được việc con.
                      <Button variant="ghost" size="xs" onClick={row.retry}>
                        Thử lại
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openTask(row.parent.id)}
                      className="flex h-full items-center text-xs text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ paddingLeft: 30 + row.depth * INDENT }}
                    >
                      Xem tất cả việc con trong chi tiết
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {pages.hasNextPage ? (
            <div className="flex h-9 items-center px-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void pages.fetchNextPage()}
                disabled={pages.isFetchingNextPage}
                className="text-foreground-muted"
              >
                {pages.isFetchingNextPage ? <Spinner className="size-3" /> : null}
                {pages.isFetchingNextPage ? "Đang tải…" : "Tải thêm"}
              </Button>
            </div>
          ) : null}
          {!pages.isPending && !pages.isError && items.length === 0 && !quickAddOpen ? (
            <p className="px-9 py-1.5 text-xs text-foreground-subtle">Không có công việc</p>
          ) : null}
          {abilities.canCreate && !pages.isPending ? (
            <QuickAdd
              open={quickAddOpen}
              onOpenChange={(open) => onQuickAddOpenChange(status.id, open)}
              indent={20}
              onCreate={onCreate}
              label={`Thêm vào ${status.name}`}
            />
          ) : null}
        </div>
      )}
    </section>
  );
});

const GroupSkeleton = () => (
  <div className="flex flex-col" aria-hidden="true">
    {[62, 48, 70].map((width, index) => (
      <div key={index} className="flex h-9 items-center gap-3 px-7">
        <Skeleton className="size-3.5 rounded-full" />
        <Skeleton className="h-3" style={{ width: `${width}%` }} />
      </div>
    ))}
  </div>
);

// --- Row -----------------------------------------------------------------------------------------

type ListRowProps = {
  task: TaskSummary;
  depth: number;
  groupId: string;
  flat: boolean;
  draggable: boolean;
  droppable: boolean;
  abilities: TaskAbilities;
  expanded: boolean;
  onToggleExpanded: (taskId: string) => void;
  openTask: (taskId: string) => void;
  selected: boolean;
  onRename: (task: TaskSummary, title: string) => void;
  menuActions: MenuActionsBuilder;
  /** First row of the list: the Tab stop while no row has been focused yet. */
  tabbable: boolean;
};

const ListRow = memo(function ListRow({
  task,
  depth,
  groupId,
  flat,
  draggable,
  droppable,
  abilities,
  expanded,
  onToggleExpanded,
  openTask,
  selected,
  onRename,
  menuActions,
  tabbable
}: ListRowProps) {
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({
    id: task.id,
    data: { kind: "task", task, groupId } satisfies DragData,
    disabled: !draggable
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: task.id, data: { kind: "row", groupId }, disabled: !droppable });
  const indicator = useDropStore((state) => (state.target?.overId === task.id ? state.target.position : null));
  const focused = useRowFocusStore((state) => state.focusedId === task.id);
  const pull = useRowFocusStore((state) => state.pull);
  const noneFocused = useRowFocusStore((state) => state.focusedId === null);
  const focusRow = useRowFocusStore((state) => state.focus);
  const openEditor = useInlineEditor();
  const [renaming, setRenaming] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focused && pull) rowRef.current?.focus({ preventScroll: true });
  }, [focused, pull]);

  const setRefs = (node: HTMLDivElement | null) => {
    rowRef.current = node;
    setDragRef(node);
    setDropRef(node);
  };
  const expandable = !flat && task.subtaskCount > 0 && depth < MAX_DEPTH;

  return (
    <div
      ref={setRefs}
      role="listitem"
      tabIndex={focused || (tabbable && noneFocused) ? 0 : -1}
      data-row="task"
      data-task-id={task.id}
      aria-label={`${task.key} ${task.title}, ${task.status.name}`}
      aria-current={selected || undefined}
      {...listeners}
      onClick={() => {
        if (renaming) return;
        focusRow(task.id);
        openTask(task.id);
      }}
      onFocus={() => {
        if (!focused) focusRow(task.id);
      }}
      className={cn(
        "group/row relative flex h-9 cursor-default items-center gap-1.5 rounded-md pr-1 outline-none transition-colors duration-100 select-none",
        "hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected && "bg-brand-soft hover:bg-brand-soft",
        isDragging && "opacity-40"
      )}
      style={{ paddingLeft: 4 + depth * INDENT }}
    >
      {indicator ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-1 left-1 z-10 h-0.5 rounded-full bg-brand shadow-[0_0_0_2px_var(--brand-soft)]",
            indicator === "before" ? "-top-px" : "-bottom-px"
          )}
        />
      ) : null}
      {depth > 0 ? (
        <span aria-hidden="true" className="absolute top-0 bottom-0 w-px bg-border" style={{ left: 4 + depth * INDENT - 11 }} />
      ) : null}
      <span className="flex w-5 shrink-0 justify-center">
        {expandable ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Ẩn việc con" : `Hiện ${task.subtaskCount} việc con`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpanded(task.id);
            }}
            className="inline-flex size-5 items-center justify-center rounded text-foreground-subtle outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className={cn("size-3.5 transition-transform duration-150 motion-reduce:transition-none", expanded && "rotate-90")} />
          </button>
        ) : null}
      </span>
      <StatusCell task={task} editable={abilities.canEdit} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="hidden shrink-0 font-mono text-[11px] text-foreground-subtle sm:inline">{task.key}</span>
        {renaming ? (
          <RenameInput
            initial={task.title}
            onDone={(title) => {
              setRenaming(false);
              if (title !== null) onRename(task, title);
            }}
          />
        ) : (
          <span
            className={cn("truncate text-[13px]", task.status.category !== "active" && "text-foreground-muted line-through decoration-foreground-subtle/60")}
            onDoubleClick={(event) => {
              if (!abilities.canEdit) return;
              event.stopPropagation();
              setRenaming(true);
            }}
          >
            {task.title}
          </span>
        )}
        {!renaming ? (
          <>
            {expandable && !expanded ? (
              <span className="shrink-0 text-[11px] text-foreground-subtle tabular-nums">
                {task.subtaskCount - task.openSubtaskCount}/{task.subtaskCount}
              </span>
            ) : null}
            <TaskCounts task={task} showSubtasks={flat} />
            {abilities.canEdit ? (
              <button
                type="button"
                aria-label="Đổi tên"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setRenaming(true);
                }}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded text-foreground-subtle opacity-0 outline-none group-hover/row:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:hidden"
              >
                <PencilLine className="size-3.5" />
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <AssigneesCell task={task} editable={abilities.canAssign} className="sm:w-20" max={3} />
        <DueCell task={task} editable={abilities.canEdit} className="justify-center sm:w-24" />
        <PriorityCell task={task} editable={abilities.canEdit} className="hidden w-12 sm:inline-flex" />
        <button
          type="button"
          aria-label={`Thao tác cho ${task.key}`}
          aria-haspopup="menu"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            openEditor?.({
              kind: "menu",
              task,
              anchor: event.currentTarget,
              actions: menuActions(task, { onRename: () => setRenaming(true) })
            });
          }}
          className="inline-flex size-7 items-center justify-center rounded-md text-foreground-subtle opacity-0 outline-none group-hover/row:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:opacity-100 pointer-coarse:size-9 pointer-coarse:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
    </div>
  );
});

const RenameInput = ({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) => {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      maxLength={240}
      aria-label="Tên công việc"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter" && !event.nativeEvent.isComposing) onDone(value);
        if (event.key === "Escape") onDone(null);
      }}
      onBlur={() => onDone(value)}
      className="h-7 min-w-0 flex-1 rounded-md border border-brand/50 bg-surface px-2 text-[13px] outline-none ring-2 ring-brand-soft"
    />
  );
};

const RowPreview = ({ task }: { task: TaskSummary }) => (
  <div className="flex h-9 w-[min(32rem,80vw)] cursor-grabbing items-center gap-2 rounded-md border bg-surface-raised px-3 shadow-lg ring-1 ring-brand/30 motion-safe:rotate-[0.6deg]">
    <StatusIcon status={task.status} />
    <span className="font-mono text-[11px] text-foreground-subtle">{task.key}</span>
    <span className="truncate text-[13px] font-medium">{task.title}</span>
  </div>
);
