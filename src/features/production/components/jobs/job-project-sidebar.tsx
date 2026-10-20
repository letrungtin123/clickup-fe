import { cn } from "cn";
import { FolderKanban, LayoutList, PanelLeftClose, RotateCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { colorForId, toneClass } from "@/lib/colors";

import { formatInteger } from "../../format";
import { allProjectsCount, filterProjects, type ProjectFacet } from "../../job-list-model";
import { SearchField } from "../settings-kit";
import { OptionSelect } from "./pickers";

type SidebarProps = {
  /** Projects with jobs for the current filters (the project filter itself ignored), from the facets. */
  projects: readonly ProjectFacet[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (projectId: string | null) => void;
};

/**
 * PD-067 — the Job page's list of projects, like ClickUp's lists in a space: "Tất cả" and each project with its job
 * count for the current filters, a search box, the selected one highlighted; a click filters the list (`?project=`).
 * Tablet / desktop only (phones get JobProjectSelect); it folds away (`onHide`).
 */
export const JobProjectSidebar = ({
  projects,
  isPending,
  isError,
  onRetry,
  selectedId,
  onSelect,
  onHide
}: SidebarProps & { onHide: () => void }) => {
  const [term, setTerm] = useState("");
  const list = projects ?? [];
  const visible = filterProjects(list, term, selectedId);
  const total = allProjectsCount(list);
  const item =
    "group/item flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-brand-soft aria-[current=true]:font-medium aria-[current=true]:text-brand-text";
  return (
    <aside aria-label="Dự án" className="flex w-60 shrink-0 flex-col border-r bg-canvas/40 xl:w-64">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <h2 className="flex-1 text-[11px] font-semibold tracking-[0.06em] text-foreground-subtle uppercase">
          Dự án
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Ẩn danh sách dự án"
          title="Ẩn danh sách dự án"
          onClick={onHide}
        >
          <PanelLeftClose />
        </Button>
      </div>
      <div className="px-3 pb-2">
        <SearchField
          value={term}
          onChange={setTerm}
          placeholder="Tìm dự án"
          label="Tìm dự án"
          className="sm:max-w-none [&_input]:h-8"
        />
      </div>
      <nav
        aria-label="Lọc job theo dự án"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3"
      >
        <ul className="flex flex-col gap-0.5">
          <li>
            <button
              type="button"
              aria-current={selectedId === null}
              onClick={() => onSelect(null)}
              className={item}
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
          {visible.map((project) => (
            <li key={project.projectId}>
              <button
                type="button"
                aria-current={selectedId === project.projectId}
                onClick={() => onSelect(project.projectId)}
                title={
                  project.name && project.name !== project.code
                    ? `${project.code} · ${project.name}`
                    : project.code
                }
                className={item}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    toneClass(colorForId(project.projectId)),
                    "size-3 shrink-0 rounded-[4px] bg-(--tone-solid)"
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
                {project.active ? null : (
                  <span className="shrink-0 text-[10px] text-foreground-subtle">lưu trữ</span>
                )}
                <span className="shrink-0 text-xs text-foreground-muted tabular-nums">
                  {formatInteger(project.count)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {projects && visible.length === 0 ? (
          <p className="px-2 py-3 text-xs text-foreground-muted">
            {term.trim() ? "Không có dự án khớp." : "Chưa có dự án nào có job."}
          </p>
        ) : null}
        {isError && !projects ? (
          <div className="flex flex-col items-start gap-1.5 px-2 py-3 text-xs text-danger">
            Không tải được danh sách dự án.
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
    Dự án
  </Button>
);

/** Phones (PD-067): the project list as a searchable select above the list. */
export const JobProjectSelect = ({
  projects,
  selectedId,
  onSelect,
  className
}: SidebarProps & { className?: string }) => {
  const list = projects ?? [];
  return (
    <OptionSelect
      options={list.map((project) => ({
        id: project.projectId,
        label: project.code,
        hint: `${formatInteger(project.count)} job${project.active ? "" : " · lưu trữ"}`
      }))}
      value={selectedId}
      onChange={onSelect}
      placeholder="Dự án"
      noneLabel={
        projects ? `Tất cả dự án · ${formatInteger(allProjectsCount(list))} job` : "Tất cả dự án"
      }
      searchPlaceholder="Tìm dự án…"
      aria-label="Lọc job theo dự án"
      className={cn("w-full", className)}
    />
  );
};
