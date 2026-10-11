import { cn } from "cn";
import { CheckCircle2, ChevronRight, ListTodo, RefreshCw } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { ColorDot } from "@/components/shared/color-dot";
import { EmptyState, ErrorState, LoadMoreError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { Project, TaskSummary } from "@/contracts/work";
import { P, accessAtLeast } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";
import { useProjects } from "@/features/projects/hooks";
import { pagedErrorKind } from "@/lib/paging";
import { useRealtimeRoom } from "@/lib/realtime/hooks";

import { flattenPages } from "../cache";
import { dueBucket, dueBuckets, growableBuckets, type DueBucket } from "../due";
import { useMyTasks } from "../hooks";
import { useTaskPanel } from "../use-task-panel";
import { ConfirmHost } from "./confirm-host";
import { InlineEditorHost } from "./inline-editor-host";
import { DueCell, PriorityCell, StatusCell, TaskCounts } from "./task-cells";

const bucketTone: Record<DueBucket, string> = {
  overdue: "text-danger",
  today: "text-warning",
  week: "text-foreground",
  later: "text-foreground-muted",
  none: "text-foreground-muted",
  done: "text-foreground-subtle"
};

/** Joins one project room (task:changed events refresh "My tasks" through the shared handler). */
const ProjectRoom = ({ projectId }: { projectId: string }) => {
  useRealtimeRoom({ type: "project", id: projectId });
  return null;
};

/** Live updates for cross-project lists: one room per distinct project on screen (bounded). */
const ProjectRooms = ({ tasks }: { tasks: readonly TaskSummary[] }) => {
  const ids = useMemo(() => [...new Set(tasks.map((task) => task.projectId))].slice(0, 30), [tasks]);
  return (
    <>
      {ids.map((id) => (
        <ProjectRoom key={id} projectId={id} />
      ))}
    </>
  );
};

/** Edit gates per project for cross-project rows (summaries carry no capabilities). */
const useProjectGates = () => {
  const projects = useProjects();
  const { can } = usePermissions();
  return useMemo(() => {
    const byId = new Map<string, Project>((projects.data?.items ?? []).map((project) => [project.id, project]));
    return {
      project: (id: string) => byId.get(id),
      canEdit: (id: string) => accessAtLeast(byId.get(id)?.myAccess, "submit") && can(P.TaskUpdate)
    };
  }, [projects.data, can]);
};

/**
 * "My tasks" across projects, bucketed client-side by deadline (overdue / today / this week /
 * later / no date), sorted by due date server side and loaded page by page.
 */
export const MyTasksList = ({ includeDone }: { includeDone: boolean }) => {
  const query = useMyTasks({ includeDone, sort: "dueAt", limit: 100 });
  const items = useMemo(() => flattenPages(query.data), [query.data]);
  const gates = useProjectGates();
  const { openTask, taskId: selected } = useTaskPanel();
  const [collapsed, setCollapsed] = useState<Partial<Record<DueBucket, boolean>>>({ done: true });

  const groups = useMemo(() => {
    const now = new Date();
    const map = new Map<DueBucket, TaskSummary[]>();
    for (const task of items) {
      const bucket = dueBucket(task, now);
      map.set(bucket, [...(map.get(bucket) ?? []), task]);
    }
    return dueBuckets.map((bucket) => ({ ...bucket, items: map.get(bucket.key) ?? [] })).filter((bucket) => bucket.items.length > 0);
  }, [items]);
  const growable = useMemo(
    () => growableBuckets(items, query.hasNextPage, includeDone),
    [items, query.hasNextPage, includeDone]
  );

  if (query.isPending) return <MyTasksSkeleton />;
  // A failed next page keeps the loaded groups; only a failed first page replaces them (BUG-WK-01).
  const errorKind = pagedErrorKind(query);
  if (errorKind === "initial") {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Bạn không còn việc nào cần làm"
        description="Công việc được giao cho bạn ở mọi dự án sẽ xuất hiện tại đây, gom theo hạn chót."
      />
    );
  }

  return (
    <InlineEditorHost>
      <ConfirmHost />
      <ProjectRooms tasks={items} />
      <div className="flex flex-col gap-5">
        {groups.map((group) => {
          const isCollapsed = collapsed[group.key] ?? false;
          // Pages arrive in due-date order: "+" only where the next page can still add work (WK-58).
          const mayGrow = growable.has(group.key);
          return (
            <section key={group.key} aria-label={`${group.label}: ${group.items.length} công việc`}>
              <button
                type="button"
                onClick={() => setCollapsed((current) => ({ ...current, [group.key]: !isCollapsed }))}
                aria-expanded={!isCollapsed}
                className="mb-1 flex h-8 items-center gap-1.5 rounded-md pr-2 text-[13px] font-semibold outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className={cn("size-4 text-foreground-muted transition-transform duration-150", !isCollapsed && "rotate-90")} />
                <span className={bucketTone[group.key]}>{group.label}</span>
                <span className="text-xs font-normal text-foreground-muted tabular-nums">
                  {group.items.length}
                  {mayGrow ? "+" : ""}
                </span>
              </button>
              {isCollapsed ? null : (
                <ul className="flex flex-col overflow-hidden rounded-lg border bg-surface">
                  {group.items.map((task) => (
                    <MyTaskRow
                      key={task.id}
                      task={task}
                      project={gates.project(task.projectId)}
                      editable={gates.canEdit(task.projectId)}
                      selected={task.id === selected}
                      onOpen={() => openTask(task.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {errorKind === "next" ? (
          <LoadMoreError onRetry={() => void query.fetchNextPage()} retrying={query.isFetchingNextPage} />
        ) : query.hasNextPage ? (
          <Button variant="outline" size="sm" className="self-center pointer-coarse:h-10" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? <Spinner /> : <RefreshCw />}
            Tải thêm việc
          </Button>
        ) : null}
      </div>
    </InlineEditorHost>
  );
};

const MyTaskRow = memo(function MyTaskRow({
  task,
  project,
  editable,
  selected,
  onOpen
}: {
  task: TaskSummary;
  project: Project | undefined;
  editable: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  const list = project?.lists.find((item) => item.id === task.listId);
  return (
    <li
      tabIndex={0}
      aria-label={`${task.key} ${task.title}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group/row flex min-h-10 cursor-default items-center gap-2 border-b px-2 py-1 outline-none last:border-b-0 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected && "bg-brand-soft hover:bg-brand-soft"
      )}
    >
      <StatusCell task={task} editable={editable} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
        {/* Phones: up to two lines instead of a few truncated words. */}
        <span className={cn("line-clamp-2 text-[13px] break-words sm:line-clamp-1", task.status.category !== "active" && "text-foreground-muted line-through decoration-foreground-subtle/60")}>
          {task.title}
        </span>
        {/* From sm up the meta shrinks with the title (the project chip truncates first). */}
        <span className="flex min-w-0 shrink-0 items-center gap-1.5 text-[11px] text-foreground-subtle sm:shrink">
          <span className="shrink-0 font-mono whitespace-nowrap">{task.key}</span>
          {project ? (
            <span className="inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full border px-1.5 py-px">
              <ColorDot color={project.color} className="size-1.5" />
              <span className="truncate">
                {project.name}
                {list ? ` / ${list.name}` : ""}
              </span>
            </span>
          ) : null}
          <TaskCounts task={task} />
        </span>
      </span>
      <PriorityCell task={task} editable={editable} className="hidden sm:inline-flex" />
      <DueCell task={task} editable={editable} className="w-24 justify-end" />
    </li>
  );
});

const MyTasksSkeleton = () => (
  <div className="flex flex-col gap-5" aria-hidden="true">
    {[3, 2].map((rows, group) => (
      <div key={group} className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <div className="overflow-hidden rounded-lg border">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex h-10 items-center gap-3 border-b px-3 last:border-b-0">
              <Skeleton className="size-3.5 rounded-full" />
              <Skeleton className="h-3" style={{ width: `${40 + ((index * 23 + group * 7) % 35)}%` }} />
              <Skeleton className="ml-auto h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

/** Compact "Việc của tôi" widget for Home: overdue, today and this week first. */
export const MyTasksWidget = () => {
  const query = useMyTasks({ includeDone: false, sort: "dueAt", limit: 100 });
  const items = useMemo(() => flattenPages(query.data), [query.data]);
  const gates = useProjectGates();
  const { openTask } = useTaskPanel();
  const now = new Date();
  const urgent = items.filter((task) => {
    const bucket = dueBucket(task, now);
    return bucket === "overdue" || bucket === "today" || bucket === "week";
  });
  const shown = (urgent.length > 0 ? urgent : items).slice(0, 6);
  const overdue = items.filter((task) => dueBucket(task, now) === "overdue").length;
  const today = items.filter((task) => dueBucket(task, now) === "today").length;

  if (query.isPending) {
    return (
      <div className="flex w-full flex-col gap-2 p-4" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-3.5 rounded-full" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    );
  }
  // The widget only shows the first page: later failures (next page / background refresh) keep it.
  if (pagedErrorKind(query) === "initial") {
    return <ErrorState size="sm" error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={ListTodo}
        title="Chưa có việc cần làm"
        description="Công việc được giao cho bạn, sắp đến hạn hoặc quá hạn sẽ hiện ở đây."
      />
    );
  }
  return (
    <InlineEditorHost>
      <ConfirmHost />
      <ProjectRooms tasks={items} />
      <div className="flex w-full flex-col self-stretch">
        <div className="flex gap-4 px-4 pt-3 pb-2 text-xs">
          <span className={cn("font-medium", overdue > 0 ? "text-danger" : "text-foreground-muted")}>{overdue} quá hạn</span>
          <span className={cn("font-medium", today > 0 ? "text-warning" : "text-foreground-muted")}>{today} hôm nay</span>
          <span className="text-foreground-muted">
            {items.length}
            {query.hasNextPage ? "+" : ""} đang mở
          </span>
        </div>
        <ul className="flex flex-col pb-2">
          {shown.map((task) => (
            <li
              key={task.id}
              tabIndex={0}
              onClick={() => openTask(task.id)}
              onKeyDown={(event) => event.key === "Enter" && openTask(task.id)}
              className="flex h-9 cursor-default items-center gap-2 px-3 outline-none hover:bg-surface-hover focus-visible:bg-surface-hover"
            >
              <StatusCell task={task} editable={gates.canEdit(task.projectId)} />
              <span className="min-w-0 flex-1 truncate text-[13px]">{task.title}</span>
              <span className="hidden max-w-[7rem] shrink-0 truncate text-[11px] text-foreground-subtle sm:inline">
                {gates.project(task.projectId)?.name}
              </span>
              <DueCell task={task} editable={gates.canEdit(task.projectId)} showEmpty={false} />
            </li>
          ))}
        </ul>
      </div>
    </InlineEditorHost>
  );
};
