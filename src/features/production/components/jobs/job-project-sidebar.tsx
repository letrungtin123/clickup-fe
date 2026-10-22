import { cn } from "cn";
import {
  ChevronRight,
  Crown,
  FolderKanban,
  LayoutList,
  PanelLeftClose,
  RotateCw
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { colorForId, toneClass } from "@/lib/colors";

import { formatInteger } from "../../format";
import {
  allProjectsCount,
  filterProjects,
  splitProjectFacets,
  type ProjectFacet
} from "../../job-list-model";
import { SearchField } from "../settings-kit";
import { OptionSelect } from "./pickers";

type SidebarProps = {
  /** Every project with its job count for the current filters (the project filter itself ignored), from the facets. */
  projects: readonly ProjectFacet[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (projectId: string | null) => void;
  /** The viewer: their own projects get a crown (PD-078). */
  myId?: string | null;
};

const itemClass =
  "group/item flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-brand-soft aria-[current=true]:font-medium aria-[current=true]:text-brand-text";

const ProjectItem = ({
  project,
  selected,
  mine,
  onSelect
}: {
  project: ProjectFacet;
  selected: boolean;
  mine: boolean;
  onSelect: (projectId: string) => void;
}) => (
  <li>
    <button
      type="button"
      aria-current={selected}
      onClick={() => onSelect(project.projectId)}
      title={[
        project.name && project.name !== project.code
          ? `${project.code} · ${project.name}`
          : project.code,
        mine ? "Bạn phụ trách" : null,
        project.active ? null : "Ngừng hoạt động"
      ]
        .filter(Boolean)
        .join(" — ")}
      className={cn(itemClass, !project.active && "text-foreground-muted")}
    >
      <span
        aria-hidden="true"
        className={cn(
          toneClass(colorForId(project.projectId)),
          "size-3 shrink-0 rounded-[4px] bg-(--tone-solid)",
          !project.active && "opacity-50"
        )}
      />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate">{project.code}</span>
        {project.name && project.name !== project.code ? (
          <span className="truncate text-xs font-normal text-foreground-subtle">
            {project.name}
          </span>
        ) : null}
      </span>
      {mine ? <Crown aria-label="Bạn phụ trách" className="size-3 shrink-0 text-warning" /> : null}
      <span
        className={cn(
          "shrink-0 text-xs tabular-nums",
          project.count === 0 ? "text-foreground-subtle" : "text-foreground-muted"
        )}
      >
        {formatInteger(project.count)}
      </span>
    </button>
  </li>
);

/**
 * PD-067 — the Job page's list of Projects, like ClickUp's lists in a space: "Tất cả" and each Project with its job count
 * for the current filters, a search box, the selected one highlighted; a click filters the list (`?project=`).
 * PD-078: EVERY Project (with or without jobs, 0 shown) in both tabs, by code (Vietnamese order); the inactive ones folded
 * under "Ngừng hoạt động" (opened while searching or when one of them is selected); the viewer's own Projects marked with
 * a crown (PD-079: any of its owners). Tablet / desktop only (phones get JobProjectSelect); it folds away (`onHide`).
 */
export const JobProjectSidebar = ({
  projects,
  isPending,
  isError,
  onRetry,
  selectedId,
  onSelect,
  onHide,
  myId = null
}: SidebarProps & { onHide: () => void }) => {
  const [term, setTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const list = projects ?? [];
  const { active, inactive } = splitProjectFacets(filterProjects(list, term, selectedId));
  const total = allProjectsCount(list);
  const searching = term.trim() !== "";
  const inactiveOpen =
    showInactive || searching || inactive.some((project) => project.projectId === selectedId);
  const inactiveCount = allProjectsCount(inactive);
  return (
    <aside
      aria-label="Project"
      className="flex w-60 shrink-0 flex-col border-r bg-canvas/40 xl:w-64"
    >
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <h2 className="flex-1 text-[11px] font-semibold tracking-[0.06em] text-foreground-subtle uppercase">
          Project
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Ẩn danh sách Project"
          title="Ẩn danh sách Project"
          onClick={onHide}
        >
          <PanelLeftClose />
        </Button>
      </div>
      <div className="px-3 pb-2">
        <SearchField
          value={term}
          onChange={setTerm}
          placeholder="Tìm Project"
          label="Tìm Project"
          className="sm:max-w-none [&_input]:h-8"
        />
      </div>
      <nav
        aria-label="Lọc job theo Project"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3"
      >
        <ul className="flex flex-col gap-0.5">
          <li>
            <button
              type="button"
              aria-current={selectedId === null}
              onClick={() => onSelect(null)}
              className={itemClass}
            >
              <LayoutList
                aria-hidden="true"
                className="size-4 shrink-0 text-foreground-muted group-aria-[current=true]/item:text-brand-text"
              />
              <span className="min-w-0 flex-1 truncate">Tất cả</span>
              {projects ? (
                <span className="shrink-0 text-xs text-foreground-muted tabular-nums">
                  {formatInteger(total)}
                </span>
              ) : null}
            </button>
          </li>
          {isPending && !projects
            ? Array.from({ length: 6 }, (_, index) => (
                <li key={index} className="flex h-8 items-center gap-2 px-2" aria-hidden="true">
                  <Skeleton className="size-3.5 rounded" />
                  <Skeleton className="h-3 flex-1" />
                </li>
              ))
            : null}
          {active.map((project) => (
            <ProjectItem
              key={project.projectId}
              project={project}
              selected={selectedId === project.projectId}
              mine={myId !== null && project.ownerIds.includes(myId)}
              onSelect={onSelect}
            />
          ))}
        </ul>
        {inactive.length > 0 ? (
          <div className="mt-2 border-t pt-2">
            <button
              type="button"
              aria-expanded={inactiveOpen}
              onClick={() => setShowInactive(!inactiveOpen)}
              disabled={searching}
              className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[11px] font-semibold tracking-[0.04em] text-foreground-subtle uppercase outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn("size-3.5 transition-transform", inactiveOpen && "rotate-90")}
              />
              <span className="flex-1">Ngừng hoạt động ({inactive.length})</span>
              {inactiveCount > 0 ? (
                <span className="text-xs font-normal tracking-normal normal-case tabular-nums">
                  {formatInteger(inactiveCount)}
                </span>
              ) : null}
            </button>
            {inactiveOpen ? (
              <ul className="mt-0.5 flex flex-col gap-0.5">
                {inactive.map((project) => (
                  <ProjectItem
                    key={project.projectId}
                    project={project}
                    selected={selectedId === project.projectId}
                    mine={myId !== null && project.ownerIds.includes(myId)}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {projects && active.length === 0 && inactive.length === 0 ? (
          <p className="px-2 py-3 text-xs text-foreground-muted">
            {searching ? "Không có Project khớp." : "Chưa có Project nào."}
          </p>
        ) : null}
        {isError && !projects ? (
          <div className="flex flex-col items-start gap-1.5 px-2 py-3 text-xs text-danger">
            Không tải được danh sách Project.
            <Button variant="outline" size="xs" onClick={onRetry}>
              <RotateCw />
              Thử lại
            </Button>
          </div>
        ) : null}
      </nav>
    </aside>
  );
};

/** The folded sidebar: one button that brings it back. */
export const ShowProjectsButton = ({
  onShow,
  className
}: {
  onShow: () => void;
  className?: string;
}) => (
  <Button variant="outline" size="sm" onClick={onShow} className={className}>
    <FolderKanban />
    Project
  </Button>
);

/** Phones (PD-067): the Project list as a searchable select above the list (active ones first, PD-078). */
export const JobProjectSelect = ({
  projects,
  selectedId,
  onSelect,
  className,
  myId = null
}: SidebarProps & { className?: string }) => {
  const list = projects ?? [];
  const { active, inactive } = splitProjectFacets(list);
  return (
    <OptionSelect
      options={[...active, ...inactive].map((project) => ({
        id: project.projectId,
        label: project.code,
        hint: [
          `${formatInteger(project.count)} job`,
          myId !== null && project.ownerIds.includes(myId) ? "bạn phụ trách" : null,
          project.active ? null : "ngừng hoạt động"
        ]
          .filter(Boolean)
          .join(" · ")
      }))}
      value={selectedId}
      onChange={onSelect}
      placeholder="Project"
      noneLabel={
        projects
          ? `Tất cả Project · ${formatInteger(allProjectsCount(list))} job`
          : "Tất cả Project"
      }
      searchPlaceholder="Tìm Project…"
      aria-label="Lọc job theo Project"
      className={cn("w-full", className)}
    />
  );
};
