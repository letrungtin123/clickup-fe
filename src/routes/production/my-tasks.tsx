import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type ScreenReaderInstructions
} from "@dnd-kit/core";
import { cn } from "cn";
import {
  CheckCheck,
  ChevronsDown,
  ClipboardList,
  ClipboardPen,
  Columns3,
  List
} from "lucide-react";
import { memo, useMemo, useState, type HTMLAttributes } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SegmentedControl } from "@/components/shared/radio-controls";
import { EmptyState, ErrorState, LoadMoreError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { CustomField } from "@/contracts/production-catalog";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { TaskCard } from "@/features/production/components/jobs/task-card";
import { useTaskMover } from "@/features/production/components/jobs/use-task-mover";
import { WorkEntryDialog } from "@/features/production/components/jobs/work-entry-dialog";
import { WorkflowUnavailable } from "@/features/production/components/jobs/workflow-unavailable";
import { MyLedJobs } from "@/features/production/components/jobs/my-led-jobs";
import { ListFiltersControl } from "@/features/production/components/list-filters";
import { todayIn } from "@/features/production/format";
import { useProductionAccess, useProductionMe } from "@/features/production/hooks";
import { emptyListFilters } from "@/features/production/list-filters";
import { useUrlListFilters } from "@/features/production/list-filters-hooks";
import type { MyTasksRole } from "@/features/production/jobs-api";
import { useMyTasks } from "@/features/production/jobs-hooks";
import {
  flattenPages,
  myBoardColumns,
  pagedCountLabel,
  type BoardColumn
} from "@/features/production/jobs-model";
import { useOpenTask } from "@/features/production/task-link";
import { touchTargets } from "@/features/production/ui";
import { toneClass } from "@/lib/colors";

type View = "board" | "list";
const VIEW_KEY = "production:my-tasks:view";

const readView = (): View => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
};

type Paging = {
  count: number;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  loadMore: () => void;
};

/**
 * /production/my-tasks — tasks I do or check (PLAN §7). Kanban by status: a card can only be dropped
 * on statuses its own capabilities offer (anything else snaps back); Done asks for the quantity
 * (and OT hours), "Cần sửa lại" and overrides ask for a note. The list view and phones move a card
 * with its status dropdown (PD-044); phones get a status tab bar instead of columns. Subtasks stay
 * inside their line's card ("+N subtask").
 * Tasks load in pages (deadline order) with "Tải thêm" (BUG-PR-18); without the workflow the tasks
 * stay readable as a list and the screen offers a retry.
 */
export const ProductionMyTasksRoute = () => {
  const me = useProductionMe();
  const breakpoint = useBreakpoint();
  const openTask = useOpenTask();
  const mover = useTaskMover();
  const [role, setRole] = useState<MyTasksRole>("all");
  const [includeFinished, setIncludeFinished] = useState(false);
  const [view, setView] = useState<View>(readView);
  // "Nhập công việc" (PD-035): a work-log row for myself (or anyone with "create: all").
  const canEnter = useProductionAccess().jobScopes.create !== "none";
  const [entering, setEntering] = useState(false);
  // TASK tags / custom fields, kept in the URL (?tag=…&cf.<key>=…).
  const listFilters = useUrlListFilters("TASK");
  const filtering = listFilters.count > 0;
  const tasks = useMyTasks(role, includeFinished, listFilters.ready, listFilters.query);
  const fields = listFilters.fields;
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  // Subtasks are listed inside their line (PD-044), never as cards of their own.
  const items = useMemo(
    () => flattenPages(tasks.data?.pages).filter((task) => !task.isSubtask),
    [tasks.data]
  );
  const statuses = mover.lookup.statuses;
  const noWorkflow = mover.lookup.isError;

  // The flow up to "Đã check" stays put; "Cần sửa lại" / "Đang check" and later statuses show when they hold or can
  // receive a card (PD-044). PD-045: the line workflow ends at "Đã check" — finished lines (Đã check or later, a Checking
  // line at Done) only come back with "Hiện việc đã xong", so "Complete" and later columns stay away unless a card
  // (an older line) sits there.
  const columns = useMemo(() => myBoardColumns(items, statuses), [items, statuses]);

  const changeView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage unavailable: keep the choice for this visit only.
    }
  };

  const move: MoveFn = (task, option, optimistic = false) =>
    mover.start(task, option, { optimistic });
  const mobile = breakpoint === "mobile";
  const paging: Paging = {
    count: items.length,
    hasMore: tasks.hasNextPage,
    loading: tasks.isFetchingNextPage,
    failed: tasks.isFetchNextPageError,
    loadMore: () => void tasks.fetchNextPage()
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", touchTargets)}>
      <PageHeader
        eyebrow="Photo Retouch"
        title="Việc của tôi"
        description="Task bạn làm hoặc kiểm tra, theo trạng thái — kèm các job bạn làm Leader."
        actions={
          canEnter ? (
            <Button onClick={() => setEntering(true)}>
              <ClipboardPen />
              Nhập Task
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<MyTasksRole>
            aria-label="Vai trò"
            value={role}
            onChange={setRole}
            className="max-sm:w-full"
            options={[
              { value: "assignee", label: "Tôi làm" },
              { value: "qc", label: "Tôi QC" },
              { value: "all", label: "Tất cả" }
            ]}
          />
          {!mobile ? (
            <SegmentedControl<View>
              aria-label="Kiểu xem"
              value={view}
              onChange={changeView}
              options={[
                { value: "board", label: "Bảng", icon: Columns3 },
                { value: "list", label: "Danh sách", icon: List }
              ]}
            />
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground-muted sm:ml-auto max-sm:min-h-10">
            <Switch checked={includeFinished} onCheckedChange={setIncludeFinished} />
            Hiện việc đã xong
          </label>
          <ListFiltersControl
            fields={fields}
            tags={listFilters.tags}
            filters={listFilters.filters}
            onChange={listFilters.setFilters}
            today={todayIn(timeZone)}
            title="Lọc task theo trường và tag"
            className="max-sm:ml-auto md:basis-full lg:basis-auto"
          />
        </div>
      </PageHeader>

      <MyLedJobs className="shrink-0" />

      <div className="flex min-h-0 flex-1 flex-col">
        {tasks.isPending || mover.lookup.isPending ? (
          <div className="flex gap-3 p-4 md:px-6" aria-busy="true" aria-label="Đang tải task">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex w-72 shrink-0 flex-col gap-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-28 rounded-xl" />
              </div>
            ))}
          </div>
        ) : tasks.isError ? (
          <div className="flex h-full items-center justify-center p-4">
            <ErrorState
              error={tasks.error}
              onRetry={() => void tasks.refetch()}
              retrying={tasks.isFetching}
            />
          </div>
        ) : items.length === 0 && filtering ? (
          <EmptyState
            icon={ClipboardList}
            title="Không có task phù hợp bộ lọc"
            description="Thử bỏ bớt tag hoặc trường đang lọc."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => listFilters.setFilters(emptyListFilters)}
              >
                Xóa bộ lọc
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={includeFinished ? "Chưa có task nào" : "Không còn việc đang mở"}
            description={
              includeFinished
                ? "Khi Leader giao task hoặc gán bạn làm QC, task sẽ hiện ở đây."
                : "Bạn đã xong hết việc được giao. Bật “Hiện việc đã xong” để xem lại."
            }
          />
        ) : noWorkflow ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
            <WorkflowUnavailable
              onRetry={mover.lookup.retry}
              retrying={mover.lookup.retrying}
              className="mx-4 md:mx-6"
            >
              Không tải được luồng trạng thái nên chưa hiện bảng và nút chuyển trạng thái. Bạn vẫn
              mở được từng task.
            </WorkflowUnavailable>
            <ListView
              tasks={items}
              timeZone={timeZone}
              fields={fields}
              onOpen={openTask}
              paging={paging}
            />
          </div>
        ) : mobile ? (
          <PhoneStatusList
            columns={columns}
            timeZone={timeZone}
            fields={fields}
            onOpen={openTask}
            onMove={move}
            busyTaskId={mover.pendingTaskId}
            paging={paging}
          />
        ) : view === "board" ? (
          <>
            <Board
              columns={columns}
              timeZone={timeZone}
              fields={fields}
              onOpen={openTask}
              onMove={move}
            />
            <PagingBar paging={paging} className="border-t px-4 md:px-6" />
          </>
        ) : (
          <ListView
            tasks={items}
            timeZone={timeZone}
            fields={fields}
            onOpen={openTask}
            onMove={move}
            busyTaskId={mover.pendingTaskId}
            paging={paging}
          />
        )}
      </div>
      {mover.dialog}
      {canEnter ? (
        <WorkEntryDialog
          key={entering ? "open" : "closed"}
          open={entering}
          onClose={() => setEntering(false)}
        />
      ) : null}
    </div>
  );
};

type MoveFn = (task: ProductionTask, option: TaskTransitionOption, optimistic?: boolean) => void;

/** "Đang hiện 200 task đầu" + "Tải thêm" while more pages exist; nothing for a complete list. */
const PagingBar = ({ paging, className }: { paging: Paging; className?: string }) =>
  paging.hasMore ? (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-xs text-foreground-muted",
        className
      )}
    >
      <span aria-live="polite">{pagedCountLabel(paging.count, true)}</span>
      {paging.failed && !paging.loading ? (
        <LoadMoreError onRetry={paging.loadMore} className="px-0 py-0" />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={paging.loadMore}
          disabled={paging.loading}
          className="max-sm:min-h-10"
        >
          {paging.loading ? <Spinner /> : <ChevronsDown />}
          Tải thêm task
        </Button>
      )}
    </div>
  ) : null;

/** dnd-kit's screen-reader texts are English by default. */
const dragInstructions: ScreenReaderInstructions = {
  draggable:
    "Nhấn Enter để mở task. Nhấn phím cách để nhấc thẻ, dùng phím mũi tên để di chuyển sang cột khác, nhấn phím cách lần nữa để thả hoặc Esc để hủy."
};

const taskLabel = (data: unknown) => {
  const task = (data as { task?: ProductionTask } | undefined)?.task;
  return task ? `task #${task.code}` : "task";
};

const dragAnnouncements: Announcements = {
  onDragStart: ({ active }) => `Đã nhấc ${taskLabel(active.data.current)}.`,
  onDragOver: ({ active, over }) =>
    over
      ? `${taskLabel(active.data.current)} đang ở trên cột ${String(over.data.current?.name ?? "")}.`
      : `${taskLabel(active.data.current)} không ở trên cột nào.`,
  onDragEnd: ({ active, over }) =>
    over
      ? `Đã thả ${taskLabel(active.data.current)} vào cột ${String(over.data.current?.name ?? "")}.`
      : `Đã thả ${taskLabel(active.data.current)}.`,
  onDragCancel: ({ active }) => `Đã hủy kéo ${taskLabel(active.data.current)}.`
};

const Board = ({
  columns,
  timeZone,
  fields,
  onOpen,
  onMove
}: {
  columns: BoardColumn<ProductionTask>[];
  timeZone: string;
  fields: readonly CustomField[];
  onOpen: (taskId: string) => void;
  onMove: MoveFn;
}) => {
  // Touch (tablets) drags after a short press so a swipe over a card still scrolls the board and the
  // column; mouse drags after a few pixels.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const [active, setActive] = useState<ProductionTask | null>(null);
  const allowed = useMemo(
    () =>
      new Map(
        (active?.capabilities.transitions ?? []).map((option) => [option.toStatusId, option])
      ),
    [active]
  );

  const onDragStart = (event: DragStartEvent) =>
    setActive((event.active.data.current?.task as ProductionTask | undefined) ?? null);
  const onDragEnd = (event: DragEndEvent) => {
    const task = event.active.data.current?.task as ProductionTask | undefined;
    setActive(null);
    const target = event.over ? String(event.over.id) : null;
    if (!task || !target || target === task.status.id) return;
    const option = task.capabilities.transitions.find((item) => item.toStatusId === target);
    // Not offered by the API: the card snaps back.
    if (option) onMove(task, option, true);
  };

  return (
    <DndContext
      sensors={sensors}
      accessibility={{
        screenReaderInstructions: dragInstructions,
        announcements: dragAnnouncements
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div
        className="flex min-h-0 flex-1 gap-3 overflow-x-auto overscroll-x-contain px-4 py-4 md:px-6"
        aria-label="Bảng task theo trạng thái"
      >
        {columns.map((column) => (
          <BoardColumnView
            key={column.status.id}
            column={column}
            timeZone={timeZone}
            fields={fields}
            onOpen={onOpen}
            dropState={
              active
                ? column.status.id === active.status.id
                  ? "home"
                  : allowed.has(column.status.id)
                    ? "allowed"
                    : "blocked"
                : "idle"
            }
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {active ? (
          <TaskCard
            task={active}
            timeZone={timeZone}
            fields={fields}
            onOpen={() => undefined}
            dragging
            className="w-72"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

/** Memoized: a column only re-renders when its cards or its drop state change (PERF-16). */
const BoardColumnView = memo(function BoardColumnView({
  column,
  timeZone,
  fields,
  onOpen,
  dropState
}: {
  column: BoardColumn<ProductionTask>;
  timeZone: string;
  fields: readonly CustomField[];
  onOpen: (taskId: string) => void;
  dropState: "idle" | "home" | "allowed" | "blocked";
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.status.id,
    disabled: dropState === "blocked",
    data: { name: column.status.name }
  });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.status.name}: ${column.tasks.length} task`}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 transition-[opacity,box-shadow,background-color] duration-150",
        dropState === "blocked" && "opacity-40",
        dropState === "allowed" && "ring-2 ring-brand/40 ring-dashed",
        dropState === "allowed" && isOver && "bg-brand-soft ring-brand"
      )}
    >
      <header
        className={cn(toneClass(column.status.color), "flex items-center gap-2 px-3 pt-3 pb-2")}
      >
        <span aria-hidden="true" className="size-2 rounded-full bg-(--tone)" />
        <h2 className="truncate text-[13px] font-semibold">{column.status.name}</h2>
        <span className="text-xs text-foreground-muted tabular-nums">{column.tasks.length}</span>
      </header>
      <ul className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {column.tasks.map((task) => (
          <DraggableCard
            key={task.id}
            task={task}
            timeZone={timeZone}
            fields={fields}
            onOpen={onOpen}
          />
        ))}
        {column.tasks.length === 0 ? (
          <li className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-foreground-subtle">
            Kéo task vào đây
          </li>
        ) : null}
      </ul>
    </section>
  );
});

const cardClass = "cursor-grab active:cursor-grabbing";
const noop = () => undefined;

/**
 * The draggable wrapper re-renders with the drag state (dnd-kit context); the memoized TaskCard
 * inside does not unless its task changed. The drag listeners/attributes go on the card itself (one
 * tab stop with a focus ring); `touch-manipulation` keeps swipes over cards scrolling on tablets.
 */
const DraggableCard = memo(function DraggableCard({
  task,
  timeZone,
  fields,
  onOpen
}: {
  task: ProductionTask;
  timeZone: string;
  fields: readonly CustomField[];
  onOpen: (taskId: string) => void;
}) {
  const draggable = task.capabilities.transitions.length > 0;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !draggable
  });
  const dragHandle = useMemo<HTMLAttributes<HTMLDivElement> | undefined>(
    () =>
      draggable
        ? { ...attributes, ...listeners, "aria-roledescription": "thẻ task kéo được" }
        : undefined,
    [draggable, attributes, listeners]
  );
  return (
    <li
      ref={setNodeRef}
      className={cn(
        "touch-manipulation select-none [-webkit-touch-callout:none]",
        isDragging && "opacity-30"
      )}
    >
      <TaskCard
        task={task}
        timeZone={timeZone}
        fields={fields}
        // Enter while a card is lifted drops it; it must not also open the task.
        onOpen={isDragging ? noop : onOpen}
        className={draggable ? cardClass : undefined}
        dragHandle={dragHandle}
      />
    </li>
  );
});

const ListView = ({
  tasks,
  timeZone,
  fields,
  onOpen,
  onMove,
  busyTaskId,
  paging
}: {
  tasks: ProductionTask[];
  timeZone: string;
  fields: readonly CustomField[];
  onOpen: (taskId: string) => void;
  /** Without it (no workflow) the cards are read-only. */
  onMove?: MoveFn | undefined;
  busyTaskId?: string | null | undefined;
  paging: Paging;
}) => (
  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
    <ul className="mx-auto grid max-w-5xl gap-2.5 lg:grid-cols-2">
      {tasks.map((task) => (
        <li key={task.id}>
          <TaskCard
            task={task}
            timeZone={timeZone}
            fields={fields}
            onOpen={onOpen}
            showStatus
            onMove={onMove}
            busy={busyTaskId === task.id}
          />
        </li>
      ))}
    </ul>
    <PagingBar paging={paging} className="mx-auto mt-3 max-w-5xl" />
  </div>
);

/** Phones: a scrollable status tab bar and the selected status' cards, each with its status dropdown (PD-044). */
const PhoneStatusList = ({
  columns,
  timeZone,
  fields,
  onOpen,
  onMove,
  busyTaskId,
  paging
}: {
  columns: BoardColumn<ProductionTask>[];
  timeZone: string;
  fields: readonly CustomField[];
  onOpen: (taskId: string) => void;
  onMove: MoveFn;
  busyTaskId: string | null | undefined;
  paging: Paging;
}) => {
  const withTasks = columns.filter((column) => column.tasks.length > 0);
  const [selected, setSelected] = useState<string | null>(null);
  const current = withTasks.find((column) => column.status.id === selected) ?? withTasks[0] ?? null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label="Trạng thái"
        className="flex shrink-0 gap-1.5 overflow-x-auto px-4 py-3 scrollbar-none"
      >
        {withTasks.map((column) => {
          const isCurrent = column.status.id === current?.status.id;
          return (
            <button
              key={column.status.id}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              onClick={() => setSelected(column.status.id)}
              className={cn(
                toneClass(column.status.color),
                "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isCurrent
                  ? "border-transparent bg-(--tone-soft) text-(--tone-text)"
                  : "bg-surface text-foreground-muted"
              )}
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-(--tone)" />
              {column.status.name}
              <span className="tabular-nums opacity-70">{column.tasks.length}</span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" role="tabpanel">
        {current ? (
          <ul className="flex flex-col gap-2.5">
            {current.tasks.map((task) => (
              <li key={task.id}>
                <TaskCard
                  task={task}
                  timeZone={timeZone}
                  fields={fields}
                  onOpen={onOpen}
                  showStatus
                  onMove={onMove}
                  busy={busyTaskId === task.id}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 py-6 text-[13px] text-foreground-muted">
            <CheckCheck className="size-4" aria-hidden="true" />
            Không có task.
          </p>
        )}
        <PagingBar paging={paging} className="mt-3" />
      </div>
    </div>
  );
};
