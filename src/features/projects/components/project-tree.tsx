import {
  closestCenter,
  DndContext,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Ellipsis,
  FolderPlus,
  ListPlus,
  Lock,
  Pencil,
  Plus,
  Settings2
} from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useMatch, useNavigate } from "react-router";

import { ColorDot } from "@/components/shared/color-dot";
import { ProjectIcon } from "@/components/shared/project-icon";
import {
  ActionsContextMenu,
  ActionsDropdown,
  type RowAction
} from "@/components/shared/row-actions";
import { ErrorState } from "@/components/shared/states";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { List, Project } from "@/contracts/work";
import { P } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks";
import { getErrorMessage } from "@/lib/api/errors";
import { createControlAwareSensors } from "@/lib/dnd-sensors";
import { moveItem } from "@/lib/ordering";
import { useUiStore } from "@/stores/ui-store";

import {
  reorderByStep,
  useArchiveList,
  useArchiveProject,
  useCreateList,
  useProjectAbilities,
  useProjects,
  useReorderLists,
  useReorderProjects,
  useUpdateList,
  useUpdateProject
} from "../hooks";

type DragData = { type: "project"; projectId: string } | { type: "list"; projectId: string };
type ArchiveTarget =
  { type: "project"; project: Project } | { type: "list"; project: Project; list: List };

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Rows are links (whole-row overlay), so only real controls — "+", "…", rename input — opt out. */
const { MouseSensor: TreeMouseSensor, TouchSensor: TreeTouchSensor } = createControlAwareSensors(
  "button, input, textarea, [contenteditable='true'], [role='menuitem'], [data-no-drag]"
);

/** A drag ends with a pointerup on the moved row; swallow the click it produces so it does not navigate. */
let suppressClicksUntil = 0;
const suppressClickAfterDrag = (event: React.MouseEvent) => {
  if (performance.now() < suppressClicksUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
};

const focusTreeItem = (
  from: HTMLElement,
  pick: (items: HTMLElement[], index: number) => HTMLElement | undefined
) => {
  const tree = from.closest<HTMLElement>("[role=tree]");
  if (!tree) return;
  const items = [...tree.querySelectorAll<HTMLElement>("[data-tree-item]")];
  const target = pick(items, items.indexOf(from));
  target?.focus();
};

/** Arrow-key navigation shared by every tree row (WAI-ARIA tree view pattern). */
const handleTreeNavigation = (event: KeyboardEvent<HTMLElement>) => {
  const row = event.currentTarget;
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      focusTreeItem(row, (items, index) => items[index + 1]);
      return true;
    case "ArrowUp":
      event.preventDefault();
      focusTreeItem(row, (items, index) => items[index - 1]);
      return true;
    case "Home":
      event.preventDefault();
      focusTreeItem(row, (items) => items[0]);
      return true;
    case "End":
      event.preventDefault();
      focusTreeItem(row, (items) => items[items.length - 1]);
      return true;
    default:
      return false;
  }
};

type ProjectTreeProps = {
  /** Called after navigating (closes the mobile drawer). */
  onNavigate?: (() => void) | undefined;
};

export const ProjectTree = ({ onNavigate }: ProjectTreeProps) => {
  const projectsQuery = useProjects();
  const reorderProjects = useReorderProjects();
  const reorderLists = useReorderLists();
  const { can } = usePermissions();
  const setNewProjectOpen = useUiStore((state) => state.setNewProjectOpen);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);
  const projectMatch = useMatch("/p/:projectId/*");
  const listMatch = useMatch("/p/:projectId/l/:listId");
  const activeProjectId = projectMatch?.params.projectId;
  const activeListId = listMatch?.params.listId;

  const sensors = useSensors(
    useSensor(TreeMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TreeTouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  );
  const projects = useMemo(() => projectsQuery.data?.items ?? [], [projectsQuery.data]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    suppressClicksUntil = performance.now() + 250;
    if (!over || active.id === over.id) return;
    const from = active.data.current as DragData | undefined;
    const to = over.data.current as DragData | undefined;
    if (!from || !to || from.type !== to.type) return;

    if (from.type === "project") {
      const oldIndex = projects.findIndex((project) => project.id === active.id);
      const newIndex = projects.findIndex((project) => project.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      reorderProjects.mutate({
        projectId: String(active.id),
        ordered: moveItem(projects, oldIndex, newIndex)
      });
      return;
    }

    if (from.projectId !== to.projectId) return; // lists cannot move between projects
    const project = projects.find((item) => item.id === from.projectId);
    if (!project) return;
    const oldIndex = project.lists.findIndex((list) => list.id === active.id);
    const newIndex = project.lists.findIndex((list) => list.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderLists.mutate({
      projectId: project.id,
      listId: String(active.id),
      ordered: moveItem(project.lists, oldIndex, newIndex)
    });
  };

  if (projectsQuery.isPending) {
    return (
      <div className="flex flex-col gap-1 px-2 py-1" aria-busy="true" aria-label="Đang tải dự án">
        {[72, 56, 64, 48].map((width) => (
          <div key={width} className="flex h-8 items-center gap-2 px-2">
            <Skeleton className="size-5 rounded-[5px]" />
            <Skeleton className="h-3" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (projectsQuery.isError) {
    return (
      <ErrorState
        size="sm"
        error={projectsQuery.error}
        onRetry={() => void projectsQuery.refetch()}
        retrying={projectsQuery.isFetching}
      />
    );
  }

  if (projects.length === 0) {
    return (
      <div className="mx-2 flex flex-col items-start gap-2 rounded-lg border border-dashed px-3 py-3 text-[13px] text-foreground-muted">
        <p>Chưa có dự án nào bạn có thể xem.</p>
        {can(P.ProjectCreate) ? (
          <Button size="sm" variant="outline" onClick={() => setNewProjectOpen(true)}>
            <FolderPlus />
            Tạo dự án đầu tiên
          </Button>
        ) : null}
      </div>
    );
  }

  const firstFocusableId = activeListId ?? activeProjectId ?? projects[0]?.id;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          suppressClicksUntil = performance.now() + 250;
        }}
        accessibility={{ screenReaderInstructions: { draggable: "" } }}
      >
        <ul role="tree" aria-label="Dự án" className="flex flex-col gap-px px-2">
          <SortableContext
            items={projects.map((project) => project.id)}
            strategy={verticalListSortingStrategy}
          >
            {projects.map((project) => (
              <ProjectNode
                key={project.id}
                project={project}
                siblings={projects}
                activeProjectId={activeProjectId}
                activeListId={activeListId}
                tabStopId={firstFocusableId}
                onNavigate={onNavigate}
                onArchive={setArchiveTarget}
              />
            ))}
          </SortableContext>
        </ul>
      </DndContext>
      <ArchiveDialog target={archiveTarget} onClose={() => setArchiveTarget(null)} />
    </>
  );
};

// --- Project node -------------------------------------------------------------------------------------

type ProjectNodeProps = {
  project: Project;
  siblings: Project[];
  activeProjectId: string | undefined;
  activeListId: string | undefined;
  tabStopId: string | undefined;
  onNavigate: (() => void) | undefined;
  onArchive: (target: ArchiveTarget) => void;
};

const ProjectNode = ({
  project,
  siblings,
  activeProjectId,
  activeListId,
  tabStopId,
  onNavigate,
  onArchive
}: ProjectNodeProps) => {
  const navigate = useNavigate();
  const abilities = useProjectAbilities(project);
  const expanded = useUiStore((state) => !state.collapsedProjects[project.id]);
  const setExpanded = useUiStore((state) => state.setProjectExpanded);
  const updateProject = useUpdateProject(project.id);
  const reorderProjects = useReorderProjects();
  const reorderLists = useReorderLists();
  const [renaming, setRenaming] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  const { setNodeRef, transform, transition, isDragging, listeners } = useSortable({
    id: project.id,
    data: { type: "project", projectId: project.id } satisfies DragData,
    disabled: !abilities.canUpdate || renaming
  });

  const href = project.lists[0]
    ? `/p/${project.id}/l/${project.lists[0].id}`
    : `/p/${project.id}/settings`;
  const selected = activeProjectId === project.id && !activeListId;
  const containsActive = activeProjectId === project.id;
  const hasChildren = project.lists.length > 0 || creatingList;

  const go = () => {
    void navigate(href);
    onNavigate?.();
  };

  const moveProject = (step: -1 | 1) => {
    const ordered = reorderByStep(siblings, project.id, step);
    if (ordered) reorderProjects.mutate({ projectId: project.id, ordered });
  };

  const startCreateList = () => {
    setExpanded(project.id, true);
    setCreatingList(true);
  };

  const actions: RowAction[] = [
    ...(abilities.canCreateList
      ? [{ key: "new-list", label: "Danh sách mới", icon: ListPlus, onSelect: startCreateList }]
      : []),
    ...(abilities.canUpdate
      ? [
          {
            key: "rename",
            label: "Đổi tên",
            icon: Pencil,
            shortcut: "F2",
            onSelect: () => setRenaming(true)
          }
        ]
      : []),
    {
      key: "settings",
      label: "Cài đặt dự án",
      icon: Settings2,
      onSelect: () => {
        void navigate(`/p/${project.id}/settings`);
        onNavigate?.();
      }
    },
    ...(abilities.canUpdate
      ? [
          {
            key: "up",
            label: "Di chuyển lên",
            icon: ArrowUp,
            separated: true,
            disabled: siblings[0]?.id === project.id,
            onSelect: () => moveProject(-1)
          },
          {
            key: "down",
            label: "Di chuyển xuống",
            icon: ArrowDown,
            disabled: siblings.at(-1)?.id === project.id,
            onSelect: () => moveProject(1)
          }
        ]
      : []),
    ...(abilities.canArchive
      ? [
          {
            key: "archive",
            label: "Lưu trữ dự án",
            icon: Archive,
            variant: "destructive" as const,
            separated: true,
            onSelect: () => onArchive({ type: "project", project })
          }
        ]
      : [])
  ];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (handleTreeNavigation(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      go();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (!expanded && hasChildren) setExpanded(project.id, true);
      else focusTreeItem(event.currentTarget, (items, index) => items[index + 1]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (expanded) setExpanded(project.id, false);
    } else if (event.key === "F2" && abilities.canUpdate) {
      event.preventDefault();
      setRenaming(true);
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      setMenuOpen(true);
    }
  };

  return (
    <li
      role="none"
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      <ActionsContextMenu actions={actions}>
        <TreeRow
          rowRef={rowRef}
          level={1}
          label={project.name}
          href={href}
          selected={selected}
          emphasized={containsActive}
          expanded={hasChildren ? expanded : undefined}
          tabStop={tabStopId === project.id}
          dragging={isDragging}
          dragListeners={listeners}
          onKeyDown={onKeyDown}
          onNavigate={onNavigate}
          leading={
            <>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setExpanded(project.id, !expanded);
                }}
                className={cn(
                  "relative z-[1] -ml-1 flex size-5 shrink-0 items-center justify-center rounded text-foreground-subtle hover:bg-surface-hover hover:text-foreground",
                  !hasChildren && "invisible"
                )}
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform duration-150",
                    expanded && "rotate-90"
                  )}
                />
              </button>
              <ProjectIcon
                color={project.color}
                icon={project.icon}
                name={project.name}
                size="sm"
              />
            </>
          }
          trailing={
            project.visibility === "private" ? (
              <Lock aria-label="Riêng tư" className="size-3 shrink-0 text-foreground-subtle" />
            ) : null
          }
          renaming={renaming}
          onRenameSubmit={(name) => {
            setRenaming(false);
            if (name !== project.name) updateProject.mutate({ name });
          }}
          onRenameCancel={() => setRenaming(false)}
          actions={
            <>
              {abilities.canCreateList ? (
                <RowIconButton
                  label={`Thêm danh sách vào ${project.name}`}
                  onClick={startCreateList}
                >
                  <Plus />
                </RowIconButton>
              ) : null}
              <ActionsDropdown
                actions={actions}
                open={menuOpen}
                onOpenChange={setMenuOpen}
                finalFocus={rowRef}
                triggerLabel={`Tùy chọn dự án ${project.name}`}
                triggerClassName={rowIconButtonClass}
                trigger={<Ellipsis />}
              />
            </>
          }
        />
      </ActionsContextMenu>

      {expanded && hasChildren ? (
        <ul role="group" className="flex flex-col gap-px pt-px">
          <SortableContext
            items={project.lists.map((list) => list.id)}
            strategy={verticalListSortingStrategy}
          >
            {project.lists.map((list) => (
              <ListNode
                key={list.id}
                project={project}
                list={list}
                selected={activeListId === list.id}
                tabStop={tabStopId === list.id}
                canUpdate={abilities.canUpdateList}
                canArchive={abilities.canArchiveList}
                onNavigate={onNavigate}
                onArchive={onArchive}
                onMove={(step) => {
                  const ordered = reorderByStep(project.lists, list.id, step);
                  if (ordered)
                    reorderLists.mutate({ projectId: project.id, listId: list.id, ordered });
                }}
              />
            ))}
          </SortableContext>
          {creatingList ? (
            <NewListRow
              project={project}
              onDone={() => setCreatingList(false)}
              onNavigate={onNavigate}
            />
          ) : null}
        </ul>
      ) : null}
    </li>
  );
};

// --- List node ----------------------------------------------------------------------------------------

type ListNodeProps = {
  project: Project;
  list: List;
  selected: boolean;
  tabStop: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  onNavigate: (() => void) | undefined;
  onArchive: (target: ArchiveTarget) => void;
  onMove: (step: -1 | 1) => void;
};

const ListNode = ({
  project,
  list,
  selected,
  tabStop,
  canUpdate,
  canArchive,
  onNavigate,
  onArchive,
  onMove
}: ListNodeProps) => {
  const navigate = useNavigate();
  const updateList = useUpdateList(project.id);
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const href = `/p/${project.id}/l/${list.id}`;
  const { setNodeRef, transform, transition, isDragging, listeners } = useSortable({
    id: list.id,
    data: { type: "list", projectId: project.id } satisfies DragData,
    disabled: !canUpdate || renaming
  });
  const index = project.lists.findIndex((item) => item.id === list.id);

  const actions: RowAction[] = [
    ...(canUpdate
      ? [
          {
            key: "rename",
            label: "Đổi tên",
            icon: Pencil,
            shortcut: "F2",
            onSelect: () => setRenaming(true)
          },
          {
            key: "up",
            label: "Di chuyển lên",
            icon: ArrowUp,
            separated: true,
            disabled: index <= 0,
            onSelect: () => onMove(-1)
          },
          {
            key: "down",
            label: "Di chuyển xuống",
            icon: ArrowDown,
            disabled: index >= project.lists.length - 1,
            onSelect: () => onMove(1)
          }
        ]
      : []),
    ...(canArchive
      ? [
          {
            key: "archive",
            label: "Lưu trữ danh sách",
            icon: Archive,
            variant: "destructive" as const,
            separated: true,
            disabled: project.lists.length <= 1,
            onSelect: () => onArchive({ type: "list", project, list })
          }
        ]
      : [])
  ];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (handleTreeNavigation(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void navigate(href);
      onNavigate?.();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTreeItem(event.currentTarget, (items, current) => {
        for (let cursor = current - 1; cursor >= 0; cursor -= 1) {
          if (items[cursor]?.getAttribute("aria-level") === "1") return items[cursor];
        }
        return undefined;
      });
    } else if (event.key === "F2" && canUpdate) {
      event.preventDefault();
      setRenaming(true);
    } else if (
      (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) &&
      actions.length > 0
    ) {
      event.preventDefault();
      setMenuOpen(true);
    }
  };

  return (
    <li
      role="none"
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      <ActionsContextMenu actions={actions}>
        <TreeRow
          rowRef={rowRef}
          level={2}
          label={list.name}
          href={href}
          selected={selected}
          tabStop={tabStop}
          dragging={isDragging}
          dragListeners={listeners}
          onKeyDown={onKeyDown}
          onNavigate={onNavigate}
          leading={
            <ColorDot
              color={list.color ?? "gray"}
              variant={list.color ? "solid" : "ring"}
              className="mx-1.5"
            />
          }
          renaming={renaming}
          onRenameSubmit={(name) => {
            setRenaming(false);
            if (name !== list.name) updateList.mutate({ listId: list.id, input: { name } });
          }}
          onRenameCancel={() => setRenaming(false)}
          actions={
            actions.length > 0 ? (
              <ActionsDropdown
                actions={actions}
                open={menuOpen}
                onOpenChange={setMenuOpen}
                finalFocus={rowRef}
                triggerLabel={`Tùy chọn danh sách ${list.name}`}
                triggerClassName={rowIconButtonClass}
                trigger={<Ellipsis />}
              />
            ) : null
          }
        />
      </ActionsContextMenu>
    </li>
  );
};

// --- Row primitives -----------------------------------------------------------------------------------

const rowIconButtonClass =
  "relative z-[1] flex size-6 items-center justify-center rounded-md text-foreground-muted outline-none pointer-coarse:size-8 hover:bg-border/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-border/70 data-popup-open:text-foreground [&_svg]:size-3.5";

const RowIconButton = ({
  label,
  onClick,
  children
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    tabIndex={-1}
    aria-label={label}
    title={label}
    className={rowIconButtonClass}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    }}
  >
    {children}
  </button>
);

type TreeRowProps = {
  rowRef: React.RefObject<HTMLDivElement | null>;
  level: 1 | 2;
  label: string;
  href: string;
  selected: boolean;
  emphasized?: boolean;
  expanded?: boolean | undefined;
  tabStop: boolean;
  dragging: boolean;
  dragListeners: ReturnType<typeof useSortable>["listeners"];
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onNavigate: (() => void) | undefined;
  leading: ReactNode;
  trailing?: ReactNode;
  actions: ReactNode;
  renaming: boolean;
  onRenameSubmit: (value: string) => void;
  onRenameCancel: () => void;
};

/**
 * One tree row. The whole row is the click target (stretched link) so it keeps native link behaviour
 * (middle-click, open in new tab) while keyboard focus stays on the treeitem itself.
 */
const TreeRow = ({
  rowRef,
  level,
  label,
  href,
  selected,
  emphasized,
  expanded,
  tabStop,
  dragging,
  dragListeners,
  onKeyDown,
  onNavigate,
  leading,
  trailing,
  actions,
  renaming,
  onRenameSubmit,
  onRenameCancel
}: TreeRowProps) => (
  <div
    ref={rowRef}
    role="treeitem"
    aria-level={level}
    aria-selected={selected}
    aria-expanded={expanded}
    aria-label={label}
    tabIndex={tabStop ? 0 : -1}
    data-tree-item=""
    onKeyDown={onKeyDown}
    onClickCapture={suppressClickAfterDrag}
    {...(renaming ? {} : dragListeners)}
    className={cn(
      "group/row relative flex h-8 items-center gap-1.5 rounded-md pr-1 text-[13px] text-foreground/85 outline-none select-none pointer-coarse:h-10",
      "transition-[background-color,color,box-shadow] duration-150 hover:bg-surface-hover hover:text-foreground",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      level === 1 ? "pl-2" : "pl-7",
      selected &&
        "bg-brand-soft font-medium text-brand-text hover:bg-brand-soft hover:text-brand-text",
      !selected && emphasized && "text-foreground",
      dragging && "cursor-grabbing bg-surface shadow-lg ring-1 ring-border"
    )}
  >
    {leading}
    {renaming ? (
      <RenameInput initial={label} onSubmit={onRenameSubmit} onCancel={onRenameCancel} />
    ) : (
      <>
        <Link
          to={href}
          tabIndex={-1}
          draggable={false}
          onClick={() => onNavigate?.()}
          className="min-w-0 flex-1 truncate outline-none after:absolute after:inset-0 after:rounded-md"
        >
          {label}
        </Link>
        {trailing}
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150",
            "group-hover/row:opacity-100 group-focus-visible/row:opacity-100 has-data-popup-open:opacity-100 pointer-coarse:opacity-100"
          )}
        >
          {actions}
        </div>
      </>
    )}
  </div>
);

const RenameInput = ({
  initial,
  onSubmit,
  onCancel,
  placeholder
}: {
  initial: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) => {
  const done = useRef(false);
  const finish = (value: string) => {
    if (done.current) return;
    done.current = true;
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed.slice(0, 160));
    else onCancel();
  };
  return (
    <input
      autoFocus
      defaultValue={initial}
      placeholder={placeholder}
      aria-label={placeholder ?? "Tên mới"}
      maxLength={160}
      onFocus={(event) => event.currentTarget.select()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(event.currentTarget.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      className="relative z-[1] h-6 min-w-0 flex-1 rounded-[5px] border border-ring bg-background px-1.5 text-[13px] text-foreground outline-none"
    />
  );
};

const NewListRow = ({
  project,
  onDone,
  onNavigate
}: {
  project: Project;
  onDone: () => void;
  onNavigate: (() => void) | undefined;
}) => {
  const navigate = useNavigate();
  const createList = useCreateList(project.id);
  const [error, setError] = useState<string | null>(null);

  if (createList.isPending) {
    return (
      <li
        role="none"
        className="flex h-8 items-center gap-2 pl-7 text-[13px] text-foreground-muted"
      >
        <Spinner className="size-3.5" /> Đang tạo danh sách…
      </li>
    );
  }

  return (
    <li role="none" className="flex flex-col gap-1 pl-7">
      <div className="flex h-8 items-center gap-1.5 pr-1">
        <ColorDot color="gray" variant="ring" className="mx-1.5" />
        <RenameInput
          key={error ?? "new"}
          initial=""
          placeholder="Tên danh sách"
          onCancel={onDone}
          onSubmit={(name) =>
            createList.mutate(
              { name },
              {
                onSuccess: (list) => {
                  onDone();
                  void navigate(`/p/${project.id}/l/${list.id}`);
                  onNavigate?.();
                },
                onError: (mutationError) =>
                  setError(getErrorMessage(mutationError, "Không tạo được danh sách."))
              }
            )
          }
        />
      </div>
      {error ? <p className="pb-1 text-xs text-danger">{error}</p> : null}
    </li>
  );
};

// --- Archive confirmation -----------------------------------------------------------------------------

const ArchiveDialog = ({
  target,
  onClose
}: {
  target: ArchiveTarget | null;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const projectMatch = useMatch("/p/:projectId/*");
  const archiveProject = useArchiveProject();
  const archiveList = useArchiveList(target?.project.id ?? "");
  const pending = archiveProject.isPending || archiveList.isPending;

  const confirm = () => {
    if (!target) return;
    if (target.type === "project") {
      archiveProject.mutate(target.project.id, {
        onSuccess: () => {
          onClose();
          if (projectMatch?.params.projectId === target.project.id)
            void navigate("/", { replace: true });
        }
      });
      return;
    }
    archiveList.mutate(target.list.id, {
      onSuccess: () => {
        onClose();
        const fallback = target.project.lists.find((list) => list.id !== target.list.id);
        if (fallback && window.location.pathname.includes(target.list.id)) {
          void navigate(`/p/${target.project.id}/l/${fallback.id}`, { replace: true });
        }
      }
    });
  };

  const name = target?.type === "list" ? target.list.name : target?.project.name;

  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target?.type === "list" ? "Lưu trữ danh sách?" : "Lưu trữ dự án?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target?.type === "list"
              ? `“${name}” và các công việc bên trong sẽ được ẩn khỏi dự án. Quản trị viên có thể khôi phục sau.`
              : `“${name}” sẽ bị ẩn với mọi thành viên cùng toàn bộ danh sách và công việc. Quản trị viên có thể khôi phục sau.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <Spinner /> : <Archive />}
            Lưu trữ
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
