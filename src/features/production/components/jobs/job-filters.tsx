import { cn } from "cn";
import { FilterX, ListFilter, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useBreakpoint } from "@/hooks/use-breakpoint";

import type { CustomField } from "@/contracts/production-catalog";
import { noLeaderFilter } from "@/contracts/production-jobs";

import { useProductionProjects } from "../../hooks";
import { activeFilterCount, emptyJobFilters, type JobFilters } from "../../jobs-model";
import { useProductionPeople } from "../../people";
import type { Tag } from "../../types";
import { touchTargets } from "../../ui";
import { DateField } from "../date-field";
import { ListFilterBar, ListFilterSections } from "../list-filters";
import { SearchField } from "../settings-kit";
import { JobStatusFilter } from "./job-status-filter";
import { OptionSelect, PersonFilterPicker } from "./pickers";

/**
 * Job list filters (URL state): search, project, manual job statuses (any of them, PD-038), staff member (searchable; their
 * jobs as assignee, with their numbers — PD-034), deadline range, "có task trễ", archived, tags (any of them) and JOB custom
 * fields. Inline on tablet/desktop (tags and custom fields as chips + "Trường & tag"); a bottom
 * sheet on phones.
 */
export const JobFiltersBar = ({
  filters,
  onChange,
  today,
  fields,
  tags,
  showProject = true
}: {
  filters: JobFilters;
  onChange: (next: JobFilters) => void;
  today: string;
  /** false: the page picks the project elsewhere (PD-067: the job List view's project sidebar / select). */
  showProject?: boolean;
  /** Active JOB custom fields (filters offered for each). */
  fields: readonly CustomField[];
  tags: readonly Tag[];
}) => {
  const breakpoint = useBreakpoint();
  const [sheet, setSheet] = useState(false);
  const [term, setTerm] = useState(filters.q);
  const count = activeFilterCount(filters);

  // Debounce the search box into the URL.
  useEffect(() => {
    if (term === filters.q) return undefined;
    const timer = window.setTimeout(() => onChange({ ...filters, q: term }), 300);
    return () => window.clearTimeout(timer);
  }, [term, filters, onChange]);

  const search = (
    <SearchField
      value={term}
      onChange={setTerm}
      placeholder="Tìm mã hoặc tên job"
      label="Tìm job"
      className="sm:min-w-56 sm:max-w-64"
    />
  );

  if (breakpoint === "mobile") {
    return (
      <div className="flex items-center gap-2">
        {search}
        <Button variant="outline" onClick={() => setSheet(true)} className="shrink-0">
          <ListFilter />
          Lọc{count > 0 ? ` · ${count}` : ""}
        </Button>
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetContent
            side="bottom"
            className={cn(
              "max-h-[90dvh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]",
              touchTargets
            )}
          >
            <SheetHeader className="border-b px-4 pt-4 pb-3">
              <SheetTitle>Lọc job</SheetTitle>
              <SheetDescription>Bộ lọc được lưu trên đường dẫn để chia sẻ.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 py-4">
              <FilterControls
                filters={filters}
                onChange={onChange}
                today={today}
                showProject={showProject}
                stacked
              />
              <ListFilterSections
                fields={fields}
                tags={tags}
                filters={filters.custom}
                onChange={(custom) => onChange({ ...filters, custom })}
                today={today}
              />
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t bg-popover px-4 py-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => onChange({ ...emptyJobFilters, q: filters.q })}
                disabled={count === 0}
              >
                <FilterX />
                Xóa lọc
              </Button>
              <Button className="flex-1" onClick={() => setSheet(false)}>
                Xem kết quả
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {search}
      <FilterControls
        filters={filters}
        onChange={onChange}
        today={today}
        showProject={showProject}
      />
      <ListFilterBar
        fields={fields}
        tags={tags}
        filters={filters.custom}
        onChange={(custom) => onChange({ ...filters, custom })}
        today={today}
      />
      {count > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...emptyJobFilters, q: filters.q })}
        >
          <FilterX />
          Xóa lọc ({count})
        </Button>
      ) : null}
    </div>
  );
};

const Labeled = ({
  label,
  stacked,
  children
}: {
  label: string;
  stacked: boolean;
  children: ReactNode;
}) =>
  stacked ? (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground-muted">{label}</span>
      {children}
    </div>
  ) : (
    <>{children}</>
  );

const FilterControls = ({
  filters,
  onChange,
  today,
  showProject,
  stacked = false
}: {
  filters: JobFilters;
  onChange: (next: JobFilters) => void;
  today: string;
  showProject: boolean;
  stacked?: boolean;
}) => {
  const projects = useProductionProjects();
  const people = useProductionPeople();
  const set = (patch: Partial<JobFilters>) => onChange({ ...filters, ...patch });
  const width = stacked ? "w-full" : "w-40";
  return (
    <>
      {showProject ? (
        <Labeled label="Dự án" stacked={stacked}>
          <OptionSelect
            options={(projects.data?.items ?? []).map((project) => ({
              id: project.id,
              label: project.code,
              // The client helps Account find "my client's job" among project codes.
              hint: project.active ? project.clientName : "lưu trữ"
            }))}
            value={filters.projectId}
            onChange={(projectId) => set({ projectId })}
            placeholder="Dự án"
            noneLabel="Mọi dự án"
            searchPlaceholder="Tìm dự án…"
            aria-label="Lọc theo dự án"
            className={width}
          />
        </Labeled>
      ) : null}
      <Labeled label="Trạng thái (khớp bất kỳ)" stacked={stacked}>
        <JobStatusFilter
          value={filters.jobStatusIds}
          onChange={(jobStatusIds) => set({ jobStatusIds })}
          stacked={stacked}
          className={width}
        />
      </Labeled>
      {/* No "Leader" picker any more (owner, 2026-10-20). A ?leader= link ("Job tôi phụ trách", member admin, the
          leader_removed notification) still narrows the list: shown as a chip that removes it. */}
      {filters.leaderId ? (
        <Labeled label="Leader" stacked={stacked}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => set({ leaderId: null })}
            aria-label="Bỏ lọc theo Leader"
            className={cn("justify-between gap-1.5", stacked && "w-full")}
          >
            <span className="truncate">
              Leader:{" "}
              {filters.leaderId === noLeaderFilter
                ? "Chưa có leader"
                : (people.nameOf(filters.leaderId) ?? "…")}
            </span>
            <X />
          </Button>
        </Labeled>
      ) : null}
      <Labeled label="Nhân viên (xem phần việc)" stacked={stacked}>
        <PersonFilterPicker
          // Anyone who can be given a task (PD-034): the list becomes their jobs and their numbers.
          people={people.withRole("STAFF", "LEADER")}
          value={filters.personId}
          onChange={(personId) => set({ personId })}
          noneLabel="Mọi nhân viên"
          aria-label="Xem phần việc của một nhân viên"
          className={width}
        />
      </Labeled>
      <Labeled label="Deadline từ – đến" stacked={stacked}>
        <div className={cn("flex items-center gap-1.5", stacked && "w-full")}>
          <DateField
            value={filters.from}
            onChange={(from) => set({ from })}
            placeholder="Từ ngày"
            clearable
            today={today}
            aria-label="Deadline từ ngày"
            className={stacked ? "flex-1" : "w-36"}
          />
          <span aria-hidden="true" className="text-foreground-subtle">
            –
          </span>
          <DateField
            value={filters.to}
            onChange={(to) => set({ to })}
            placeholder="Đến ngày"
            clearable
            today={today}
            aria-label="Deadline đến ngày"
            className={stacked ? "flex-1" : "w-36"}
          />
        </div>
      </Labeled>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-2 text-[13px] whitespace-nowrap",
          stacked && "justify-between rounded-lg border px-3 py-2.5"
        )}
      >
        <span className={stacked ? "order-first" : "order-last"}>Có task trễ</span>
        <Switch checked={filters.late} onCheckedChange={(late) => set({ late })} />
      </label>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-2 text-[13px] whitespace-nowrap",
          stacked && "justify-between rounded-lg border px-3 py-2.5"
        )}
      >
        <span className={stacked ? "order-first" : "order-last"}>Gồm job lưu trữ</span>
        <Switch checked={filters.archived} onCheckedChange={(archived) => set({ archived })} />
      </label>
    </>
  );
};
