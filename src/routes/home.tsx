import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { motion } from "motion/react";
import { ArrowUpRight, Bell, FolderPlus, Globe, ListTodo, Lock, Search } from "lucide-react";
import { Link } from "react-router";

import { ProjectIcon } from "@/components/shared/project-icon";
import { Shortcut } from "@/components/shared/shortcut";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { P } from "@/features/auth/permissions";
import { usePermissions, useSessionContext } from "@/features/auth/hooks";
import { InboxWidgetContent } from "@/features/notifications/components/inbox-widget";
import { useProjects } from "@/features/projects/hooks";
import { MyTasksWidget } from "@/features/tasks/components/my-tasks-list";
import { useUiStore } from "@/stores/ui-store";

const greetingFor = (date: Date) => {
  const hour = date.getHours();
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
};

export const HomeRoute = () => {
  const session = useSessionContext();
  const { can } = usePermissions();
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const setNewProjectOpen = useUiStore((state) => state.setNewProjectOpen);
  const now = new Date();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
        <header className="flex flex-col gap-1">
          <p className="text-[13px] text-foreground-muted first-letter:uppercase">
            {format(now, "EEEE, d MMMM", { locale: vi })}
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
          {can(P.ProjectCreate) ? (
            <Button variant="outline" onClick={() => setNewProjectOpen(true)}>
              <FolderPlus />
              Dự án mới
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Widget title="Việc của tôi" icon={ListTodo} href="/my-tasks">
            <MyTasksWidget />
          </Widget>
          <Widget title="Hộp thư" icon={Bell} href="/inbox">
            <InboxWidgetContent />
          </Widget>
        </div>

        <RecentProjects />
      </div>
    </div>
  );
};

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
        className="ml-auto inline-flex items-center gap-1 rounded text-xs text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
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
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
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
