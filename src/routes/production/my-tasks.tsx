import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { cn } from "cn";
import { CheckCheck, ClipboardList, Columns3, List } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { SegmentedControl } from "@/components/shared/radio-controls";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { ProductionTask, TaskTransitionOption } from "@/contracts/production-jobs";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { TaskCard } from "@/features/production/components/jobs/task-card";
import { TransitionButtons } from "@/features/production/components/jobs/transition-controls";
import { useTaskMover } from "@/features/production/components/jobs/use-task-mover";
import { useProductionMe } from "@/features/production/hooks";
import type { MyTasksRole } from "@/features/production/jobs-api";
import { useMyTasks } from "@/features/production/jobs-hooks";
import { boardColumns, type BoardColumn } from "@/features/production/jobs-model";
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

/**
 * /production/my-tasks — tasks I do or check (PLAN §7). Kanban by status: a card can only be dropped
 * on statuses its own capabilities offer (anything else snaps back); Done asks for the quantity
 * (and OT hours), QC fail and overrides ask for a note. Phones get a status tab bar instead.
 */
export const ProductionMyTasksRoute = () => {
  const me = useProductionMe();
  const breakpoint = useBreakpoint();
  const openTask = useOpenTask();
  const mover = useTaskMover();
  const [role, setRole] = useState<MyTasksRole>("all");
  const [includeFinished, setIncludeFinished] = useState(false);
  const [view, setView] = useState<View>(readView);
  const tasks = useMyTasks(role, includeFinished);
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const items = useMemo(() => tasks.data?.pages.flatMap((page) => page.items) ?? [], [tasks.data]);
  const statuses = mover.lookup.statuses;

  const columns = useMemo(() => {
    const reachable = new Set(
      items.flatMap((task) =>
        task.capabilities.transitions
          .filter((option) => !option.override)
          .map((option) => option.toStatusId)
      )
    );
    // The task flow up to the first "checked" status stays put (columns do not jump as cards
    // move); later job-level statuses only show when they hold or can receive a card.
    const checkedOrder = Math.min(
      ...statuses.filter((status) => status.active && status.countsChecked).map((s) => s.sortOrder)
    );
    return boardColumns(items, statuses).filter(
      (column) =>
        column.tasks.length > 0 ||
        reachable.has(column.status.id) ||
        (column.status.active && column.status.sortOrder <= checkedOrder)
    );
  }, [items, statuses]);

  const changeView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage unavailable: keep the choice for this visit only.
    }
  };

  const move = (task: ProductionTask, option: TaskTransitionOption, optimistic = false) =>
    mover.start(task, option, { optimistic });
  const mobile = breakpoint === "mobile";

  return (
    <div className={cn("flex h-full min-h-0 flex-col", touchTargets)}>
      <PageHeader
        eyebrow="Sản xuất"
        title="Việc của tôi"
        description="Task bạn làm hoặc kiểm tra, theo trạng thái."
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
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1">
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
        ) : mobile ? (
          <PhoneStatusList
            columns={columns}
            timeZone={timeZone}
            onOpen={openTask}
            onMove={move}
            busyTaskId={mover.pendingTaskId}
          />
        ) : view === "board" ? (
          <Board columns={columns} timeZone={timeZone} onOpen={openTask} onMove={move} />
        ) : (
          <ListView
            tasks={items}
            timeZone={timeZone}
            onOpen={openTask}
            onMove={move}
            busyTaskId={mover.pendingTaskId}
          />
        )}
      </div>
      {mover.dialog}
    </div>
  );
};

type MoveFn = (task: ProductionTask, option: TaskTransitionOption, optimistic?: boolean) => void;

const Board = ({
  columns,
  timeZone,
  onOpen,
  onMove
}: {
  columns: BoardColumn<ProductionTask>[];
  timeZone: string;
  onOpen: (taskId: string) => void;
  onMove: MoveFn;
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div
        className="flex h-full min-h-0 gap-3 overflow-x-auto overscroll-x-contain px-4 py-4 md:px-6"
        aria-label="Bảng task theo trạng thái"
      >
        {columns.map((column) => (
          <BoardColumnView
            key={column.status.id}
            column={column}
            timeZone={timeZone}
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
            onOpen={() => undefined}
            dragging
            className="w-72"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

const BoardColumnView = ({
  column,
  timeZone,
  onOpen,
  dropState
}: {
  column: BoardColumn<ProductionTask>;
  timeZone: string;
  onOpen: (taskId: string) => void;
  dropState: "idle" | "home" | "allowed" | "blocked";
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.status.id,
    disabled: dropState === "blocked"
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
          <DraggableCard key={task.id} task={task} timeZone={timeZone} onOpen={onOpen} />
        ))}
        {column.tasks.length === 0 ? (
          <li className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-foreground-subtle">
            Kéo task vào đây
          </li>
        ) : null}
      </ul>
    </section>
  );
};

const DraggableCard = ({
  task,
  timeZone,
  onOpen
}: {
  task: ProductionTask;
  timeZone: string;
  onOpen: (taskId: string) => void;
}) => {
  const draggable = task.capabilities.transitions.length > 0;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !draggable
  });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("touch-none outline-none", isDragging && "opacity-30")}
      aria-roledescription="Thẻ task kéo được"
    >
      <TaskCard
        task={task}
        timeZone={timeZone}
        onOpen={onOpen}
        className={draggable ? "cursor-grab active:cursor-grabbing" : undefined}
      />
    </li>
  );
};

const ListView = ({
  tasks,
  timeZone,
  onOpen,
  onMove,
  busyTaskId
}: {
  tasks: ProductionTask[];
  timeZone: string;
  onOpen: (taskId: string) => void;
  onMove: MoveFn;
  busyTaskId: string | null | undefined;
}) => (
  <div className="h-full overflow-y-auto px-4 py-4 md:px-6">
    <ul className="mx-auto grid max-w-5xl gap-2.5 lg:grid-cols-2">
      {tasks.map((task) => (
        <li key={task.id}>
          <TaskCard
            task={task}
            timeZone={timeZone}
            onOpen={onOpen}
            showStatus
            footer={
              <TransitionButtons
                task={task}
                busy={busyTaskId === task.id}
                onMove={(option) => onMove(task, option)}
              />
            }
          />
        </li>
      ))}
    </ul>
  </div>
);

/** Phones: a scrollable status tab bar and the selected status' cards with move buttons. */
const PhoneStatusList = ({
  columns,
  timeZone,
  onOpen,
  onMove,
  busyTaskId
}: {
  columns: BoardColumn<ProductionTask>[];
  timeZone: string;
  onOpen: (taskId: string) => void;
  onMove: MoveFn;
  busyTaskId: string | null | undefined;
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
                  onOpen={onOpen}
                  footer={
                    <TransitionButtons
                      task={task}
                      busy={busyTaskId === task.id}
                      onMove={(option) => onMove(task, option)}
                    />
                  }
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
      </div>
    </div>
  );
};
