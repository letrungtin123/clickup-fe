import { cn } from "cn";
import {
  ChevronRight,
  Crown,
  Ellipsis,
  Eye,
  FolderKanban,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Link } from "@/components/shared/router-link";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mayOwnProject, type ProductionProject } from "@/contracts/production-catalog";
import { useSessionContext } from "@/features/auth/hooks";
import { RequireProductionRole } from "@/features/production/components/production-gate";
import { ProjectDialog } from "@/features/production/components/projects/project-dialog";
import {
  ConfirmDialog,
  CountLabel,
  InfoNote,
  RowsSkeleton,
  SearchField
} from "@/features/production/components/settings-kit";
import { toastProductionError } from "@/features/production/errors";
import { formatDay, formatInteger } from "@/features/production/format";
import {
  useProductionAccess,
  useProductionMe,
  useProductionProjects,
  useProjectMutations
} from "@/features/production/hooks";
import { isoToZoned } from "@/features/production/jobs-model";
import {
  defaultProjectListView,
  isProjectOwner,
  projectDeleteBlocker,
  projectJobsLink,
  projectSortLabels,
  projectSorts,
  visibleProjects,
  type ProjectListView,
  type ProjectSort
} from "@/features/production/projects";
import { touchTargets } from "@/features/production/ui";
import { colorForId, toneClass } from "@/lib/colors";

/**
 * /production/projects — PD-078 "Project" (hierarchy Project › Job Code › Task › Subtask), its own entry in the Photo
 * Retouch menu (it left Cấu hình; /production/settings/projects redirects here). Opens for LEADER, ADMIN, DIRECTOR and
 * ACCOUNT (Director read-only); STAFF / QC do not see it. PD-079: Leaders, Admins and Accounts create Projects; the
 * owners, Admins and the creating Account edit; owners: several only by the superadmin, the single one by an Admin; a
 * Project with any job is never deleted (only switched off).
 */
export const ProductionProjectsRoute = () => (
  <RequireProductionRole roles={["LEADER", "DIRECTOR", "ACCOUNT"]}>
    <ProjectsPage />
  </RequireProductionRole>
);

const grid =
  "md:grid-cols-[5.5rem_minmax(0,1.6fr)_minmax(0,1fr)_4.5rem_minmax(0,1fr)_7.5rem_2.25rem] md:gap-3 lg:gap-4";

const ProjectsPage = () => {
  const me = useSessionContext().user.id;
  const timeZone = useProductionMe().data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const { roles } = useProductionAccess();
  const projects = useProductionProjects();
  const mutations = useProjectMutations();
  const [view, setView] = useState<ProjectListView>(defaultProjectListView);
  const [dialog, setDialog] = useState<{ project: ProductionProject | null } | null>(null);
  const [deleting, setDeleting] = useState<ProductionProject | null>(null);
  const canOwn = mayOwnProject(roles);
  const canCreate = projects.data?.canCreate ?? false;

  const items = useMemo(() => projects.data?.items ?? [], [projects.data]);
  const rows = useMemo(() => visibleProjects(items, view, me), [items, view, me]);
  const inactiveCount = items.filter((project) => !project.active).length;
  const mineCount = items.filter((project) => isProjectOwner(project, me)).length;
  const anyEditable = items.some((project) => project.capabilities.canEdit);
  const filtering = view.term.trim() !== "" || view.mineOnly;

  const toggleActive = (project: ProductionProject) =>
    mutations.update.mutate(
      { id: project.id, input: { active: !project.active } },
      {
        onSuccess: () =>
          toast.success(
            project.active
              ? `Đã ngừng hoạt động Project ${project.code}`
              : `Đã bật lại Project ${project.code}`
          ),
        onError: (error) => toastProductionError(error)
      }
    );

  const confirmDelete = () => {
    if (!deleting) return;
    const project = deleting;
    mutations.remove.mutate(project.id, {
      onSuccess: () => {
        toast.success(`Đã xoá Project ${project.code}`);
        setDeleting(null);
      },
      onError: (error) => {
        setDeleting(null);
        toastProductionError(error);
      }
    });
  };

  return (
    <div className={`flex h-full min-h-0 flex-col ${touchTargets}`}>
      <PageHeader
        eyebrow="Photo Retouch"
        title="Project"
        description="Người phụ trách (Leader hoặc Quản trị) quản lý mọi Job Code, task và subtask của Project."
        actions={
          canCreate ? (
            <Button onClick={() => setDialog({ project: null })}>
              <Plus />
              <span className="max-sm:sr-only">Tạo Project</span>
            </Button>
          ) : null
        }
      >
        <Hierarchy />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 md:px-6 md:py-6"
        >
          {!canCreate && !anyEditable && projects.data ? (
            <InfoNote icon={Eye}>
              Bạn đang xem danh sách Project. Leader và Quản trị tạo, sửa Project; người phụ trách
              quản lý job của Project đó.
            </InfoNote>
          ) : null}
          <section className="overflow-hidden rounded-xl border bg-surface shadow-xs">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <SearchField
                className="basis-full sm:basis-auto"
                value={view.term}
                onChange={(term) => setView({ ...view, term })}
                placeholder="Tìm mã, tên, người phụ trách"
                label="Tìm Project"
              />
              <div className="flex flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-2">
                {canOwn ? (
                  <Toggle
                    variant="outline"
                    size="sm"
                    pressed={view.mineOnly}
                    onPressedChange={(mineOnly) => setView({ ...view, mineOnly })}
                    aria-label="Chỉ Project tôi phụ trách"
                  >
                    <Crown />
                    Của tôi
                    <span className="text-foreground-muted tabular-nums">
                      {formatInteger(mineCount)}
                    </span>
                  </Toggle>
                ) : null}
                {inactiveCount > 0 ? (
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-foreground-muted select-none">
                    <Switch
                      size="sm"
                      checked={view.showInactive}
                      onCheckedChange={(showInactive) => setView({ ...view, showInactive })}
                    />
                    Ngừng hoạt động ({formatInteger(inactiveCount)})
                  </label>
                ) : null}
                <SortSelect value={view.sort} onChange={(sort) => setView({ ...view, sort })} />
                {projects.data ? (
                  <CountLabel shown={rows.length} total={items.length} noun="Project" />
                ) : null}
              </div>
            </div>
            <div
              className={cn(
                "hidden border-b bg-muted/30 px-4 py-2 text-xs font-medium text-foreground-muted md:grid",
                grid
              )}
            >
              <span>Mã</span>
              <span>Project</span>
              <span>Người phụ trách</span>
              <span className="text-right">Job</span>
              <span>Tạo bởi</span>
              <span>Trạng thái</span>
              <span className="sr-only">Thao tác</span>
            </div>
            {projects.isPending ? (
              <RowsSkeleton rows={6} />
            ) : projects.isError ? (
              <ErrorState
                size="sm"
                error={projects.error}
                onRetry={() => void projects.refetch()}
              />
            ) : rows.length === 0 ? (
              <EmptyState
                size="sm"
                icon={FolderKanban}
                title={
                  items.length === 0
                    ? "Chưa có Project"
                    : view.mineOnly && !view.term.trim()
                      ? "Bạn chưa phụ trách Project nào"
                      : "Không có Project phù hợp"
                }
                description={
                  items.length === 0
                    ? canCreate
                      ? "Tạo Project đầu tiên: mã viết tắt, tên và người phụ trách."
                      : undefined
                    : filtering
                      ? "Thử từ khóa khác, bỏ “Của tôi” hoặc hiện Project ngừng hoạt động."
                      : "Bật “Ngừng hoạt động” để xem các Project đã tắt."
                }
                action={
                  items.length === 0 && canCreate ? (
                    <Button size="sm" onClick={() => setDialog({ project: null })}>
                      <Plus />
                      Tạo Project
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y" aria-label="Danh sách Project">
                {rows.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    mine={isProjectOwner(project, me)}
                    timeZone={timeZone}
                    onEdit={() => setDialog({ project })}
                    onToggleActive={() => toggleActive(project)}
                    onDelete={() => setDeleting(project)}
                  />
                ))}
              </ul>
            )}
          </section>
        </motion.div>
      </div>

      {dialog ? (
        <ProjectDialog
          key={dialog.project?.id ?? "new"}
          open
          project={dialog.project}
          projects={items}
          ownerPick={projects.data?.ownerPick ?? null}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !mutations.remove.isPending && setDeleting(null)}
        title={deleting ? `Xoá Project ${deleting.code}?` : "Xoá Project?"}
        description="Project chưa có job nào nên xoá được; giá trong Bảng đơn giá của Project cũng bị xoá. Không thể hoàn tác."
        confirmLabel="Xoá Project"
        destructive
        pending={mutations.remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

/** "Project › Job Code › Task › Subtask" under the title. */
const Hierarchy = () => (
  <ol
    aria-label="Cấp bậc"
    className="flex flex-wrap items-center gap-1 text-[11px] text-foreground-muted"
  >
    {["Project", "Job Code", "Task", "Subtask"].map((level, index) => (
      <li key={level} className="flex items-center gap-1">
        {index > 0 ? (
          <ChevronRight aria-hidden="true" className="size-3 text-foreground-subtle" />
        ) : null}
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5",
            index === 0 ? "bg-brand-soft font-semibold text-brand-text" : "bg-muted"
          )}
        >
          {level}
        </span>
      </li>
    ))}
  </ol>
);

const SortSelect = ({
  value,
  onChange
}: {
  value: ProjectSort;
  onChange: (sort: ProjectSort) => void;
}) => (
  <Select
    items={projectSorts.map((sort) => ({ value: sort, label: projectSortLabels[sort] }))}
    value={value}
    onValueChange={(next: string | null) => next && onChange(next as ProjectSort)}
  >
    <SelectTrigger size="sm" className="w-40" aria-label="Sắp xếp Project">
      <SelectValue>{projectSortLabels[value]}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      {projectSorts.map((sort) => (
        <SelectItem key={sort} value={sort}>
          {projectSortLabels[sort]}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const ProjectState = ({ active, className }: { active: boolean; className?: string }) => (
  <span className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", className)}>
    <span
      aria-hidden="true"
      className={cn("size-1.5 rounded-full", active ? "bg-success" : "bg-foreground-subtle")}
    />
    <span className={active ? "text-foreground-muted" : "text-foreground-subtle"}>
      {active ? "Đang hoạt động" : "Ngừng hoạt động"}
    </span>
  </span>
);

const ProjectRow = ({
  project,
  mine,
  timeZone,
  onEdit,
  onToggleActive,
  onDelete
}: {
  project: ProductionProject;
  mine: boolean;
  timeZone: string;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) => {
  const created = formatDay(isoToZoned(project.createdAt, timeZone).day);
  const editable = project.capabilities.canEdit;
  const deleteBlocker = projectDeleteBlocker(project);
  // PD-079: every owner — avatars (up to 3, then +N) and the first one's name (+N more).
  const owner =
    project.owners.length > 0 ? (
      <span
        className="flex min-w-0 items-center gap-2"
        title={project.owners.map((person) => person.displayName).join(", ")}
      >
        <span className="flex shrink-0 -space-x-1.5">
          {project.owners.slice(0, 3).map((person) => (
            <UserAvatar key={person.id} user={person} size="xs" className="ring-2 ring-surface" />
          ))}
        </span>
        <span className="truncate text-[13px]">
          {project.owners[0]!.displayName}
          {project.owners.length > 1 ? (
            <span className="text-foreground-muted"> +{project.owners.length - 1}</span>
          ) : null}
        </span>
        {mine ? (
          <Crown aria-label="Bạn phụ trách" className="size-3 shrink-0 text-warning" />
        ) : null}
      </span>
    ) : (
      <span className="truncate text-xs text-foreground-subtle italic">
        Chưa có người phụ trách
      </span>
    );
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-hover/60",
        grid,
        !project.active && "bg-muted/30"
      )}
    >
      <span
        className={cn(
          toneClass(colorForId(project.id)),
          "inline-flex max-w-full items-center gap-1.5 justify-self-start rounded-md bg-(--tone-soft) px-1.5 py-0.5 font-mono text-xs font-semibold text-(--tone-text)",
          !project.active && "opacity-60"
        )}
        title={project.code}
      >
        <span className="truncate">{project.code}</span>
      </span>
      {editable ? (
        <button
          type="button"
          onClick={onEdit}
          className="flex min-w-0 flex-col justify-center self-stretch rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ProjectName project={project} editable />
        </button>
      ) : (
        <div className="flex min-w-0 flex-col justify-center self-stretch">
          <ProjectName project={project} editable={false} />
        </div>
      )}
      <span className="col-start-3 row-start-1 justify-self-end md:col-start-7">
        <ProjectMenu
          project={project}
          deleteBlocker={deleteBlocker}
          onEdit={onEdit}
          onToggleActive={onToggleActive}
          onDelete={onDelete}
        />
      </span>
      {/* Phones: owner, jobs, creator and state on their own lines below the name. */}
      <div className="col-span-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted md:contents">
        <span className="min-w-0 md:col-start-3 md:row-start-1">{owner}</span>
        <Link
          to={projectJobsLink(project.id)}
          className="shrink-0 rounded tabular-nums outline-none hover:text-brand-text hover:underline focus-visible:ring-2 focus-visible:ring-ring md:col-start-4 md:row-start-1 md:justify-self-end md:text-[13px]"
          aria-label={`${formatInteger(project.jobCount)} job của Project ${project.code}`}
        >
          <span className={project.jobCount === 0 ? "text-foreground-subtle" : "text-foreground"}>
            {formatInteger(project.jobCount)}
          </span>
          <span className="md:sr-only"> job</span>
        </Link>
        <span className="flex min-w-0 items-center gap-1.5 md:col-start-5 md:row-start-1">
          {project.createdBy ? (
            <>
              <UserAvatar user={project.createdBy} size="xs" className="max-md:hidden" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate">
                  <span className="md:hidden">Tạo bởi </span>
                  {project.createdBy.displayName}
                </span>
                <span className="text-[11px] text-foreground-subtle tabular-nums">{created}</span>
              </span>
            </>
          ) : (
            <span className="flex min-w-0 flex-col leading-tight">
              <span>
                <span className="md:hidden">Tạo bởi </span>—
              </span>
              <span className="text-[11px] text-foreground-subtle tabular-nums">{created}</span>
            </span>
          )}
        </span>
        <ProjectState active={project.active} className="md:col-start-6 md:row-start-1" />
      </div>
    </li>
  );
};

const ProjectName = ({ project, editable }: { project: ProductionProject; editable: boolean }) => (
  <>
    <span
      className={cn(
        "truncate text-[13px] font-medium",
        editable && "hover:text-brand-text",
        !project.active && "text-foreground-muted"
      )}
    >
      {project.name}
    </span>
    {project.description ? (
      <span className="truncate text-xs text-foreground-muted" title={project.description}>
        {project.description}
      </span>
    ) : null}
  </>
);

/** "…" menu: Sửa, Ngừng hoạt động / Bật lại (owner, Admin), Xoá (never with a job: disabled, says why), Xem job. */
const ProjectMenu = ({
  project,
  deleteBlocker,
  onEdit,
  onToggleActive,
  onDelete
}: {
  project: ProductionProject;
  deleteBlocker: string | null;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) => {
  const { canEdit } = project.capabilities;
  const navigate = useNavigate();
  const deleteItem = (
    <DropdownMenuItem
      variant="destructive"
      disabled={deleteBlocker !== null}
      onClick={onDelete}
      className="items-start"
    >
      <Trash2 className="mt-0.5" />
      <span className="flex min-w-0 flex-col">
        <span>Xoá Project</span>
        {deleteBlocker ? (
          <span className="text-[11px] leading-snug whitespace-normal">{deleteBlocker}</span>
        ) : null}
      </span>
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Tùy chọn cho Project ${project.code}`}
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={() => void navigate(projectJobsLink(project.id))}>
          <FolderKanban />
          Xem job của Project
        </DropdownMenuItem>
        {canEdit ? (
          <>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil />
              Chỉnh sửa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleActive}>
              {project.active ? <PowerOff /> : <Power />}
              {project.active ? "Ngừng hoạt động" : "Bật lại"}
            </DropdownMenuItem>
          </>
        ) : null}
        {canEdit || project.capabilities.canDelete ? (
          <>
            <DropdownMenuSeparator />
            {deleteBlocker ? (
              // A disabled item takes no pointer events: the wrapper carries the tooltip (the reason is also inline).
              <Tooltip>
                <TooltipTrigger render={<div />}>{deleteItem}</TooltipTrigger>
                <TooltipContent side="left">{deleteBlocker}</TooltipContent>
              </Tooltip>
            ) : (
              deleteItem
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
