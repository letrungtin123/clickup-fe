import { cn } from "cn";
import { ChevronRight, FolderKanban } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/shared/states";
import { Link } from "@/components/shared/router-link";
import { Button } from "@/components/ui/button";
import type { OverviewProjectProgress } from "@/contracts/production-overview";

import { LateBadge } from "../../components/jobs/job-bits";
import { formatInteger } from "../../format";
import type { JobListScope } from "@/contracts/production-jobs";
import { percentOf, projectJobsHref } from "../model";

/** Rows shown before "Xem thêm". */
const FIRST_ROWS = 8;

/**
 * PD-076 "Tiến độ Project": each active Project with open jobs in scope — % by images (Done images / Tổng tấm of its open
 * jobs; checked images as the inner layer, like the job list's "Tiến độ"), "1.240 / 3.000 tấm", open jobs, late jobs.
 * A row opens the Job list of that Project in the same scope tab (PD-078 `?scope=`). Not tied to the date filter.
 */
export const ProjectProgressList = ({
  projects,
  tab
}: {
  projects: readonly OverviewProjectProgress[];
  tab: JobListScope | null;
}) => {
  const [expanded, setExpanded] = useState(false);
  if (projects.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={FolderKanban}
        title={tab === "mine" ? "Project bạn phụ trách chưa có job đang mở" : "Chưa có job nào đang mở"}
        description="Project có job đang mở (chưa đóng, chưa lưu trữ) hiện ở đây với tiến độ theo số tấm."
      />
    );
  }
  const shown = expanded ? projects : projects.slice(0, FIRST_ROWS);
  return (
    <div className="flex flex-col">
      <ul className="grid gap-x-6 xl:grid-cols-2" aria-label="Tiến độ Project">
        {shown.map((item) => (
          <li key={item.project.id} className="min-w-0">
            <ProjectRow item={item} href={projectJobsHref(item.project.id, tab)} />
          </li>
        ))}
      </ul>
      {projects.length > FIRST_ROWS ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 self-center text-foreground-muted"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? "Thu gọn" : `Xem thêm ${formatInteger(projects.length - FIRST_ROWS)} Project`}
        </Button>
      ) : null}
    </div>
  );
};

const ProjectRow = ({ item, href }: { item: OverviewProjectProgress; href: string }) => {
  const done = percentOf(item.imagesDone, item.imagesTotal);
  const checked = percentOf(item.imagesChecked, item.imagesTotal);
  const label = `${item.project.code} — ${item.project.name}: ${done}% (${formatInteger(item.imagesDone)} / ${formatInteger(item.imagesTotal)} tấm đã xong, ${formatInteger(item.imagesChecked)} tấm đã kiểm), ${item.openJobs} job đang mở${item.lateJobs > 0 ? `, ${item.lateJobs} job trễ` : ""}`;
  return (
    <Link
      to={href}
      aria-label={`${label}. Mở danh sách job của Project.`}
      className={cn(
        "group -mx-2 flex min-w-0 flex-col gap-2 rounded-lg px-2 py-3 outline-none",
        "transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-md bg-muted px-1.5 text-[11px] leading-5 font-semibold tracking-wide text-foreground">
          {item.project.code}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground-muted">{item.project.name}</span>
        {item.lateJobs > 0 ? <LateBadge label={`${item.lateJobs} job trễ`} /> : null}
        <span className="shrink-0 text-sm font-semibold tabular-nums">{item.imagesTotal > 0 ? `${done}%` : "—"}</span>
        <ChevronRight
          className="size-4 shrink-0 text-foreground-subtle transition-transform duration-150 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
      <span aria-hidden="true" className="relative block h-2 overflow-hidden rounded-full bg-muted">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-brand/45 transition-[width] duration-500"
          style={{ width: `${done}%` }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${checked}%` }}
        />
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-foreground-muted tabular-nums">
        <span>
          <span className="font-medium text-foreground">{formatInteger(item.imagesDone)}</span> /{" "}
          {formatInteger(item.imagesTotal)} tấm
        </span>
        <span>Đã kiểm {formatInteger(item.imagesChecked)}</span>
        <span>{formatInteger(item.openJobs)} job đang mở</span>
      </span>
    </Link>
  );
};
