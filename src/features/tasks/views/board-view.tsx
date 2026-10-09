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
import { MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { ErrorState } from "@/components/shared/states";
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
import { AssigneesCell, DueCell, PriorityCell, TaskCounts } from "../components/task-cells";
import {
  dropIndicatorFrom,
  groupDroppableId,
  TaskMouseSensor,
  TaskTouchSensor,
  taskCollisionDetection,
  type DragData
} from "../dnd";
import { filtersToQuery, hasNarrowingFilters } from "../filters";
import { useCreateTask, useMoveTask, useTaskPages, useWorkflow } from "../hooks";
import { useInlineEditor } from "../inline-editor-context";
import { computeDropPlacement, isNoopDrop } from "../placement";
import { useTaskAbilities, useRowMenuActions, type TaskAbilities } from "../use-task-abilities";
import { confirmParentCompletion, toStatusRef } from "../use-task-actions";
import { useTaskFilters } from "../use-task-filters";
import { useTaskPanel } from "../use-task-panel";
import { useDropStore } from "../view-stores";
import type { TaskViewProps } from "./registry";
import { ViewSkeleton } from "./view-skeletons";

type ColumnEntry = { status: TaskStatus; queryKey: QueryKey; items: TaskSummary[] };
type MenuActionsBuilder = ReturnType<typeof useRowMenuActions>;

/**
 * Board view (PD-003): one column per workflow status, each paged and virtualized on its own;
 * drag cards within and across columns (status + neighbour placement), optimistic with rollback.
 */
const BoardView = ({ project, list, openTask }: TaskViewProps) => {
  const { filters } = useTaskFilters();
  const workflow = useWorkflow(project.id, list.id);
  const abilities = useTaskAbilities(project);
  const flat = hasNarrowingFilters(filters);
  const baseQuery = useMemo(() => filtersToQuery(filters, { listId: list.id, view: "board" }), [filters, list.id]);
  const statuses = useMemo(
    () =>
      (workflow.data?.items ?? []).filter(
        (status) =>
          (filters.statusIds.length === 0 || filters.statusIds.includes(status.id)) &&
          (filters.includeDone || status.category === "active")
      ),
    [workflow.data, filters.statusIds, filters.includeDone]
  );
  const registry = useRef(new Map<string, ColumnEntry>());
  const { taskId: selectedTaskId } = useTaskPanel();
  const menuActions = useRowMenuActions(abilities, openTask);
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
    setActiveTask((event.active.data.current as DragData | undefined)?.task ?? null);
  };
  const onDragMove = (event: DragMoveEvent) => setDropTarget(dropIndicatorFrom(event));
  const reset = () => {
    setActiveTask(null);
    setDropTarget(null);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const data = event.active.data.current as DragData | undefined;
    const target = dropIndicatorFrom(event);
    reset();
    if (!data || !target) return;
    const source = registry.current.get(data.groupId);
    const destination = registry.current.get(target.groupId);
    if (!source || !destination) return;
    const task = data.task;
    const sameColumn = source.status.id === destination.status.id;
    if (sameColumn && (flat || isNoopDrop(destination.items, task.id, target))) return;
    const placement = computeDropPlacement(destination.items, task.id, target);
    const status = destination.status;
    void (async () => {
      if (!sameColumn && !(await confirmParentCompletion(task, status))) return;
      move.mutate({
        task,
        input: { ...(sameColumn ? {} : { statusId: status.id }), ...(flat ? {} : { placement }) },
        optimistic: { status: toStatusRef(status) },
        anchor: { queryKey: destination.queryKey, placement }
      });
    })();
  };

  if (workflow.isPending) return <ViewSkeleton view="board" />;
  if (workflow.isError) {
    return <ErrorState error={workflow.error} onRetry={() => void workflow.refetch()} retrying={workflow.isFetching} />;
  }

  return (
    <InlineEditorHost>
      <ConfirmHost />
      <DndContext
        sensors={sensors}
        collisionDetection={taskCollisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={reset}
      >
        <div
          className="flex h-full snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 pt-3 pb-4 sm:snap-none md:px-6"
          aria-label="Bảng công việc"
        >
          {statuses.map((status) => (
            <BoardColumn
              key={status.id}
              project={project}
              list={list}
              status={status}
              baseQuery={baseQuery}
              flat={flat}
              registry={registry}
              abilities={abilities}
              openTask={openTask}
              selectedTaskId={selectedTaskId}
              menuActions={menuActions}
            />
          ))}
          {statuses.length === 0 ? (
            <p className="m-auto text-sm text-foreground-muted">Không có cột nào khớp bộ lọc trạng thái.</p>
          ) : null}
        </div>
        <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {activeTask ? (
            <div className="w-[17rem] motion-safe:rotate-[1.5deg]">
              <CardBody task={activeTask} lifted />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </InlineEditorHost>
  );
};

export default BoardView;

type ColumnProps = {
  project: Project;
  list: List;
  status: TaskStatus;
  baseQuery: TaskQueryParams;
  flat: boolean;
  registry: RefObject<Map<string, ColumnEntry>>;
  abilities: TaskAbilities;
  openTask: (taskId: string) => void;
  selectedTaskId: string | null;
  menuActions: MenuActionsBuilder;
};

const BoardColumn = memo(function BoardColumn({
  project,
  list,
  status,
  baseQuery,
  flat,
  registry,
  abilities,
  openTask,
  selectedTaskId,
  menuActions
}: ColumnProps) {
  const query = useMemo(() => ({ ...baseQuery, statusIds: [status.id] }), [baseQuery, status.id]);
  const queryKey = useMemo(() => qk.tasks(project.id, query), [project.id, query]);
  const pages = useTaskPages(project.id, query);
  const items = useMemo(() => flattenPages(pages.data), [pages.data]);
  const create = useCreateTask();
  const [adding, setAdding] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- virtual rows are read during render on purpose
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 6,
    gap: 8,
    getItemKey: (index) => items[index]?.id ?? index
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= items.length - 4) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, lastIndex, items.length, fetchNextPage]);

  useEffect(() => {
    registry.current.set(status.id, { status, queryKey, items });
  });
  useEffect(() => () => void registry.current.delete(status.id), [registry, status.id]);

  const { setNodeRef } = useDroppable({
    id: groupDroppableId(status.id),
    data: { kind: "group", groupId: status.id },
    disabled: !abilities.canEdit
  });
  const targeted = useDropStore((state) => state.target?.groupId === status.id);
  const endIndicator = useDropStore((state) => state.target?.groupId === status.id && state.target.overId === null);

  const onCreate = (title: string) => {
    const last = items[items.length - 1];
    const placement = !flat && last ? { afterId: last.id } : null;
    return create
      .mutateAsync({
        projectId: project.id,
        input: { listId: list.id, title, statusId: status.id, ...(placement ? { placement } : {}) },
        anchor: { queryKey, placement }
      })
      .then(() => {
        requestAnimationFrame(() => virtualizer.scrollToIndex(items.length, { align: "end" }));
      });
  };

  const count = `${items.length}${pages.hasNextPage ? "+" : ""}`;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${status.name}: ${count} công việc`}
      className={cn(
        toneClass(status.color),
        "flex h-full w-[85vw] max-w-[19rem] shrink-0 snap-start flex-col rounded-xl bg-muted/55 transition-[background-color,box-shadow] duration-150 sm:w-72 dark:bg-muted/40",
        targeted && "bg-brand-soft/60 ring-1 ring-brand/30 dark:bg-brand-soft/40"
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-t-2 border-(--tone) rounded-t-xl px-3">
        <StatusIcon status={status} size="sm" />
        <h3 className="truncate text-[13px] font-semibold">{status.name}</h3>
        <span className="text-xs text-foreground-muted tabular-nums">{pages.isPending ? "…" : count}</span>
        {pages.isFetching && !pages.isPending ? <Spinner className="size-3 text-foreground-subtle" /> : null}
        {abilities.canCreate ? (
          <button
            type="button"
            aria-label={`Thêm công việc vào ${status.name}`}
            onClick={() => {
              setAdding(true);
              requestAnimationFrame(() => virtualizer.scrollToIndex(Math.max(0, items.length - 1), { align: "end" }));
            }}
            className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-foreground-subtle outline-none pointer-coarse:size-9 hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </header>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        {pages.isPending ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex flex-col gap-2.5 rounded-lg border bg-surface p-3">
                <Skeleton className="h-3" style={{ width: `${60 + index * 12}%` }} />
                <div className="flex justify-between">
                  <Skeleton className="h-2.5 w-14" />
                  <Skeleton className="size-5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : pages.isError ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-3 text-[13px] text-foreground-muted" role="alert">
            Không tải được cột này.
            <Button variant="outline" size="xs" onClick={() => void pages.refetch()}>
              <RefreshCw />
              Thử lại
            </Button>
          </div>
        ) : (
          <>
            <div className="relative" style={{ height: virtualizer.getTotalSize() }} role="list" aria-label={status.name}>
              {virtualItems.map((virtualItem) => {
                const task = items[virtualItem.index];
                if (!task) return null;
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    className="absolute inset-x-0 top-0"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <BoardCard
                      task={task}
                      columnId={status.id}
                      abilities={abilities}
                      draggable={abilities.canEdit}
                      openTask={openTask}
                      selected={task.id === selectedTaskId}
                      menuActions={menuActions}
                    />
                  </div>
                );
              })}
            </div>
            {endIndicator ? <div className="mt-2 h-0.5 rounded-full bg-brand" aria-hidden="true" /> : null}
            {items.length === 0 && !adding ? (
              <p className="rounded-lg border border-dashed px-3 py-5 text-center text-xs text-foreground-subtle">
                {abilities.canEdit ? "Kéo thẻ vào đây" : "Không có công việc"}
              </p>
            ) : null}
            {pages.isFetchingNextPage ? (
              <div className="flex justify-center py-2">
                <Spinner className="size-4 text-foreground-subtle" />
              </div>
            ) : null}
          </>
        )}
      </div>
      {abilities.canCreate && !pages.isPending ? (
        <div className="shrink-0 px-2 pb-2">
          <QuickAdd variant="card" open={adding} onOpenChange={setAdding} onCreate={onCreate} label="Thêm thẻ" placeholder="Tên công việc…" />
        </div>
      ) : null}
    </section>
  );
});

const BoardCard = memo(function BoardCard({
  task,
  columnId,
  abilities,
  draggable,
  openTask,
  selected,
  menuActions
}: {
  task: TaskSummary;
  columnId: string;
  abilities: TaskAbilities;
  draggable: boolean;
  openTask: (taskId: string) => void;
  selected: boolean;
  menuActions: MenuActionsBuilder;
}) {
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({
    id: task.id,
    data: { kind: "task", task, groupId: columnId } satisfies DragData,
    disabled: !draggable
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: task.id, data: { kind: "row", groupId: columnId }, disabled: !draggable });
  const indicator = useDropStore((state) => (state.target?.overId === task.id ? state.target.position : null));
  const openEditor = useInlineEditor();
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef]
  );

  return (
    <div
      ref={setRefs}
      role="listitem"
      tabIndex={0}
      aria-label={`${task.key} ${task.title}`}
      {...listeners}
      onClick={() => openTask(task.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          openTask(task.id);
        }
      }}
      className={cn(
        "group/card relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-35"
      )}
    >
      {indicator ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-brand",
            indicator === "before" ? "-top-[5px]" : "-bottom-[5px]"
          )}
        />
      ) : null}
      <CardBody task={task} selected={selected}>
        <div className="flex items-center gap-1">
          <AssigneesCell task={task} editable={abilities.canAssign} max={3} />
          <DueCell task={task} editable={abilities.canEdit} showEmpty={false} />
          <PriorityCell task={task} editable={abilities.canEdit} className={task.priority === "normal" ? "hidden group-hover/card:inline-flex" : undefined} />
          <TaskCounts task={task} className="ml-auto" />
        </div>
        <button
          type="button"
          aria-label={`Thao tác cho ${task.key}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            openEditor?.({ kind: "menu", task, anchor: event.currentTarget, actions: menuActions(task) });
          }}
          className="absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded-md bg-surface/80 text-foreground-subtle opacity-0 outline-none group-hover/card:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:top-1 pointer-coarse:right-1 pointer-coarse:size-8 pointer-coarse:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </CardBody>
    </div>
  );
});

const CardBody = ({
  task,
  selected = false,
  lifted = false,
  children
}: {
  task: TaskSummary;
  selected?: boolean;
  lifted?: boolean;
  children?: React.ReactNode;
}) => {
  const done = task.subtaskCount - task.openSubtaskCount;
  return (
    <div
      className={cn(
        "flex cursor-default flex-col gap-2 rounded-lg border bg-surface p-3 shadow-xs transition-[border-color,box-shadow] duration-150 select-none hover:border-border-strong hover:shadow-md",
        selected && "border-brand/50 ring-1 ring-brand/30",
        lifted && "cursor-grabbing border-brand/40 shadow-xl"
      )}
    >
      <div className="flex items-center gap-1.5 pr-6 text-[11px] text-foreground-subtle">
        <span className="font-mono">{task.key}</span>
        {task.parentTaskId ? <span className="truncate">· việc con</span> : null}
      </div>
      <p className={cn("line-clamp-3 text-[13px] leading-snug font-medium", task.status.category !== "active" && "text-foreground-muted")}>
        {task.title}
      </p>
      {task.subtaskCount > 0 ? (
        <div className="flex items-center gap-2" title={`${done}/${task.subtaskCount} việc con đã xong`}>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${(done / task.subtaskCount) * 100}%` }} />
          </div>
          <span className="text-[11px] text-foreground-subtle tabular-nums">
            {done}/{task.subtaskCount}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
};
