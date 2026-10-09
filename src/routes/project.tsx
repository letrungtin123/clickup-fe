import { cn } from "cn";
import { ChevronRight, ListPlus, Lock, Plus, Settings2, Users } from "lucide-react";
import { Suspense } from "react";
import { Link, Navigate, Outlet, useParams, useSearchParams } from "react-router";

import { ColorDot } from "@/components/shared/color-dot";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectIcon } from "@/components/shared/project-icon";
import { SegmentedControl } from "@/components/shared/radio-controls";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { List, Project } from "@/contracts/work";
import { useProject, useProjectAbilities } from "@/features/projects/hooks";
import { useTaskPanel } from "@/features/tasks/use-task-panel";
import {
  parseTaskView,
  taskViewKeys,
  taskViews,
  type TaskViewKey
} from "@/features/tasks/views/registry";
import { ViewSkeleton } from "@/features/tasks/views/view-skeletons";
import { useRealtimeRoom } from "@/lib/realtime/hooks";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import { NotFoundRoute } from "./errors";
import { useProjectOutlet, type ProjectOutletContext } from "./project-context";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /p/:projectId — resolves the project (seeded from the sidebar cache), joins its realtime room for
 * structure/task events, and provides it to child routes via outlet context.
 */
export const ProjectLayoutRoute = () => {
  const { projectId = "" } = useParams();
  const valid = uuidPattern.test(projectId);
  const project = useProject(valid ? projectId : undefined);
  useRealtimeRoom(valid && project.data ? { type: "project", id: projectId } : null);

  if (!valid) {
    return <NotFoundRoute />;
  }
  if (project.isPending) {
    return <ProjectSkeleton />;
  }
  if (project.isError) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorState
          error={project.error}
          onRetry={() => void project.refetch()}
          retrying={project.isFetching}
        />
      </div>
    );
  }
  return <Outlet context={{ project: project.data } satisfies ProjectOutletContext} />;
};

const ProjectSkeleton = () => (
  <div className="flex h-full flex-col" aria-busy="true">
    <div className="flex flex-col gap-3 border-b px-4 pt-5 pb-3 md:px-6">
      <Skeleton className="h-3 w-40" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-6 w-56" />
      </div>
      <Skeleton className="h-7 w-64 rounded-lg" />
    </div>
    <ViewSkeleton view="list" />
  </div>
);

/** /p/:projectId → first list (or an empty state when the project has none). */
export const ProjectIndexRoute = () => {
  const { project } = useProjectOutlet();
  const abilities = useProjectAbilities(project);
  const first = project.lists[0];
  if (first) {
    return <Navigate to={`/p/${project.id}/l/${first.id}`} replace />;
  }
  return (
    <div className="flex h-full flex-col">
      <ProjectHeader project={project} />
      <EmptyState
        icon={ListPlus}
        title="Dự án chưa có danh sách"
        description={
          project.lists.length === 0 && abilities.canCreateList
            ? "Tạo danh sách đầu tiên từ thanh bên (nút + cạnh tên dự án)."
            : "Bạn chưa thể xem danh sách nào trong dự án này."
        }
      />
    </div>
  );
};

const ProjectHeader = ({
  project,
  list,
  children
}: {
  project: Project;
  list?: List;
  children?: React.ReactNode;
}) => {
  const abilities = useProjectAbilities(project);
  return (
    <PageHeader
      eyebrow={
        <nav aria-label="Vị trí" className="flex items-center gap-1">
          <Link
            to={`/p/${project.id}`}
            className="rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {project.name}
          </Link>
          {list ? (
            <>
              <ChevronRight className="size-3" aria-hidden="true" />
              <span aria-current="page" className="truncate">
                {list.name}
              </span>
            </>
          ) : null}
        </nav>
      }
      leading={
        list ? (
          <span className="flex size-7 items-center justify-center">
            <ColorDot color={list.color ?? project.color} className="size-2.5" />
          </span>
        ) : (
          <ProjectIcon color={project.color} icon={project.icon} name={project.name} size="md" />
        )
      }
      title={
        <span className="inline-flex items-center gap-2">
          {list?.name ?? project.name}
          {project.visibility === "private" ? (
            <Lock className="size-3.5 text-foreground-subtle" aria-label="Dự án riêng tư" />
          ) : null}
        </span>
      }
      actions={
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  nativeButton={false}
                  render={<Link to={`/p/${project.id}/settings`} aria-label="Cài đặt dự án" />}
                />
              }
            >
              {abilities.canManageMembers ? <Users /> : <Settings2 />}
            </TooltipTrigger>
            <TooltipContent>
              {abilities.canManageMembers ? "Thành viên và cài đặt" : "Cài đặt dự án"}
            </TooltipContent>
          </Tooltip>
        </>
      }
    >
      {children}
    </PageHeader>
  );
};

/** /p/:projectId/l/:listId — header, view switcher (?view=list|board|table) and the view mount. */
export const ListRoute = () => {
  const { project } = useProjectOutlet();
  const { listId } = useParams();
  const [params, setParams] = useSearchParams();
  const { openTask } = useTaskPanel();
  const breakpoint = useBreakpoint();
  const view = parseTaskView(params.get("view"));
  const list = project.lists.find((item) => item.id === listId);

  if (!list) {
    return <NotFoundRoute />;
  }

  const setView = (next: TaskViewKey) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === "list") updated.delete("view");
        else updated.set("view", next);
        return updated;
      },
      { replace: true }
    );

  const View = taskViews[view].component;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectHeader project={project} list={list}>
        <div className="flex items-center gap-2">
          <SegmentedControl
            aria-label="Chế độ xem"
            size="sm"
            value={view}
            onChange={setView}
            options={taskViewKeys.map((key) => ({
              value: key,
              label: taskViews[key].label,
              icon: taskViews[key].icon,
              description: taskViews[key].label
            }))}
            iconOnly={breakpoint === "mobile"}
            className={cn(breakpoint === "mobile" && "[&_button]:px-2.5")}
          />
          <Tooltip>
            <TooltipTrigger render={<span className="ml-auto" />}>
              <Button size="sm" disabled>
                <Plus />
                Công việc
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sắp có</TooltipContent>
          </Tooltip>
        </div>
      </ProjectHeader>
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<ViewSkeleton view={view} />}>
          <View key={`${list.id}:${view}`} project={project} list={list} openTask={openTask} />
        </Suspense>
      </div>
    </div>
  );
};
