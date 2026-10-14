import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Bell,
  Factory,
  FolderPlus,
  Globe,
  ListTodo,
  Lock,
  Search
} from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "@/components/shared/router-link";

import { ProjectIcon } from "@/components/shared/project-icon";
import { Shortcut } from "@/components/shared/shortcut";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { departmentLabels } from "@/contracts/departments";
import { P } from "@/features/auth/permissions";
import { usePermissions, useSessionContext } from "@/features/auth/hooks";
import { useCurrentDepartment } from "@/features/departments/hooks";
import { InboxWidgetContent } from "@/features/notifications/components/inbox-widget";
import { useProductionNavEntries } from "@/features/production/hooks";
import { useProjects } from "@/features/projects/hooks";
import { MyTasksWidget } from "@/features/tasks/components/my-tasks-list";
import { greetingFor } from "@/lib/greeting";
import { useUiStore } from "@/stores/ui-store";

// Photo Retouch only: the Production department never downloads the production agenda.
const HomeProductionAgenda = lazy(() =>
  import("@/features/production/components/agenda").then((module) => ({
    default: module.HomeProductionAgenda
  }))
);

/**
 * Trang chủ follows the department shown (PD-041):
 *   Production     Việc của tôi + Hộp thư, Dự án của bạn, "Dự án mới"
 *   Photo Retouch  the production agenda (Việc cần làm) + Hộp thư, no project widgets
 *   no department  Hộp thư only (shared content)
 */
export const HomeRoute = () => {
  const session = useSessionContext();
  const department = useCurrentDepartment();
  const { can } = usePermissions();
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const setNewProjectOpen = useUiStore((state) => state.setNewProjectOpen);
  const retouchOverview = useProductionNavEntries().some((entry) => entry.to === "/production");
  const now = new Date();
  const weekday = format(now, "EEEE, d MMMM", { locale: vi });
  const day = weekday.charAt(0).toLocaleUpperCase("vi") + weekday.slice(1);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
        <header className="flex flex-col gap-1">
          <p className="text-[13px] text-foreground-muted first-letter:uppercase">
            {department ? `${departmentLabels[department]} · ${day}` : day}
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            {greetingFor(now)}, {session.user.displayName}
          </h1>
        </header>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCommandOpen(true)}>
            <Search />
            Tìm kiếm
            <Shortcut keys={["mod", "K"]} className="ml-1" />
          </Button>
          {department === "PRODUCTION" && can(P.ProjectCreate) ? (
            <Button variant="outline" onClick={() => setNewProjectOpen(true)}>
              <FolderPlus />
              Dự án mới
            </Button>
          ) : null}
          {department === "PHOTO_RETOUCH" && retouchOverview ? (
            <Button variant="outline" render={<Link to="/production" />} nativeButton={false}>
              <Factory />
              Tổng quan Photo Retouch
            </Button>
          ) : null}
        </div>

        {department === "PRODUCTION" ? (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Widget title="Việc của tôi" icon={ListTodo} href="/my-tasks">
                <MyTasksWidget />
              </Widget>
              <InboxWidget />
            </div>
            <RecentProjects />
          </>
        ) : department === "PHOTO_RETOUCH" ? (
          <>
            <Suspense fallback={<AgendaFallback />}>
              <HomeProductionAgenda />
            </Suspense>
            <InboxWidget />
          </>
        ) : (
          <InboxWidget />
        )}
      </div>
    </div>
  );
};

/** Same footprint as the agenda while its chunk loads. */
const AgendaFallback = () => (
  <div className="flex flex-col gap-3" aria-busy="true" aria-label="Đang tải việc cần làm">
    <Skeleton className="h-4 w-28" />
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
    </div>
  </div>
);

const InboxWidget = () => (
  <Widget title="Hộp thư" icon={Bell} href="/inbox">
    <InboxWidgetContent />
  </Widget>
);

const Widget = ({
  title,
  icon: Icon,
  href,
  children
}: {
  title: string;
  icon: typeof ListTodo;
  href: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col rounded-xl border bg-surface shadow-xs">
    <div className="flex items-center gap-2 border-b px-4 py-3">
      <Icon className="size-4 text-foreground-muted" aria-hidden="true" />
      <h2 className="text-sm font-semibold">{title}</h2>
      <Link
        to={href}
        className="ml-auto inline-flex items-center gap-1 rounded text-xs text-foreground-muted outline-none pointer-coarse:-my-2.5 pointer-coarse:py-2.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        Xem tất cả <ArrowUpRight className="size-3" aria-hidden="true" />
      </Link>
    </div>
    <div className="flex flex-1 items-center justify-center">{children}</div>
  </section>
);

const RecentProjects = () => {
  const projects = useProjects();
  const { can } = usePermissions();
  const setNewProjectOpen = useUiStore((state) => state.setNewProjectOpen);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="home-projects">
      <h2 id="home-projects" className="text-sm font-semibold">
        Dự án của bạn
      </h2>
      {projects.isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-3 rounded-xl border bg-surface p-4">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.isError ? (
        <ErrorState size="sm" error={projects.error} onRetry={() => void projects.refetch()} />
      ) : projects.data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed">
          <EmptyState
            size="sm"
            icon={FolderPlus}
            title="Chưa có dự án"
            description="Tạo dự án để bắt đầu sắp xếp công việc theo danh sách."
            action={
              can(P.ProjectCreate) ? (
                <Button size="sm" onClick={() => setNewProjectOpen(true)}>
                  <FolderPlus />
                  Tạo dự án
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <motion.ul
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          {projects.data.items.slice(0, 9).map((project) => {
            const first = project.lists[0];
            return (
              <li key={project.id}>
                <Link
                  to={first ? `/p/${project.id}/l/${first.id}` : `/p/${project.id}/settings`}
                  className="group flex items-center gap-3 rounded-xl border bg-surface p-4 shadow-xs outline-none transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ProjectIcon
                    color={project.color}
                    icon={project.icon}
                    name={project.name}
                    size="lg"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{project.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
                      <span className="font-mono">{project.key}</span>
                      <span aria-hidden="true">·</span>
                      {project.lists.length} danh sách
                      <span aria-hidden="true">·</span>
                      {project.visibility === "private" ? (
                        <Lock className="size-3" aria-label="Riêng tư" />
                      ) : (
                        <Globe className="size-3" aria-label="Công khai" />
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </motion.ul>
      )}
    </section>
  );
};
