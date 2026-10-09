import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { RequireProductionRole } from "@/features/production/components/production-gate";
import { JobFiltersBar } from "@/features/production/components/jobs/job-filters";
import { JobFormDialog } from "@/features/production/components/jobs/job-form-dialog";
import { JobsEmpty, JobsList } from "@/features/production/components/jobs/jobs-list";
import { todayIn } from "@/features/production/format";
import { useProductionMe } from "@/features/production/hooks";
import { useJobs } from "@/features/production/jobs-hooks";
import { ExcelExportButton } from "@/features/production/reports/components/export-button";
import {
  activeFilterCount,
  emptyJobFilters,
  jobFiltersFromSearch,
  jobFiltersToSearch,
  jobQueryFromFilters,
  type JobFilters
} from "@/features/production/jobs-model";
import { touchTargets } from "@/features/production/ui";

/** /production/jobs — every job for Account / Leader / Admin (PD-014 visibility), filters in the URL. */
export const ProductionJobsRoute = () => (
  <RequireProductionRole roles={["ACCOUNT", "LEADER"]}>
    <JobsPage />
  </RequireProductionRole>
);

const JobsPage = () => {
  const me = useProductionMe();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const timeZone = me.data?.settings.timezone ?? "Asia/Ho_Chi_Minh";
  const filters = useMemo(() => jobFiltersFromSearch(params), [params]);
  const query = useMemo(() => jobQueryFromFilters(filters, timeZone), [filters, timeZone]);
  const jobs = useJobs(query);
  const items = useMemo(() => jobs.data?.pages.flatMap((page) => page.items) ?? [], [jobs.data]);
  const filtering = activeFilterCount(filters) > 0 || filters.q.trim() !== "";

  const setFilters = useCallback(
    (next: JobFilters) => setParams(jobFiltersToSearch(next), { replace: true }),
    [setParams]
  );

  return (
    <div className={`flex h-full min-h-0 flex-col ${touchTargets}`}>
      <PageHeader
        eyebrow="Sản xuất"
        title="Job"
        description="Gói ảnh của khách: tiến độ giao / done / checked, task trễ và feedback."
        actions={
          <>
            <ExcelExportButton
              request={{ method: "GET", path: "/production/jobs/export", query }}
              fallbackName="Danh sách job.xlsx"
              disabled={!jobs.data}
            />
            <Button onClick={() => setCreating(true)}>
              <Plus />
              <span className="max-sm:sr-only">Tạo job</span>
            </Button>
          </>
        }
      >
        <JobFiltersBar filters={filters} onChange={setFilters} today={todayIn(timeZone)} />
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4 md:overflow-hidden md:px-6">
        <p className="text-xs text-foreground-muted tabular-nums" aria-live="polite">
          {jobs.data ? `${items.length}${jobs.hasNextPage ? "+" : ""} job` : " "}
          {jobs.isFetching && !jobs.isPending ? " · đang cập nhật…" : ""}
        </p>
        <JobsList
          jobs={items}
          isPending={jobs.isPending}
          error={jobs.isError ? jobs.error : null}
          onRetry={() => void jobs.refetch()}
          hasNextPage={jobs.hasNextPage}
          isFetchingNextPage={jobs.isFetchingNextPage}
          fetchNextPage={() => void jobs.fetchNextPage()}
          timeZone={timeZone}
          filtering={filtering}
          empty={
            <JobsEmpty
              filtering={filtering}
              onReset={() => setFilters(emptyJobFilters)}
              onCreate={() => setCreating(true)}
            />
          }
        />
      </div>
      <JobFormDialog
        key={creating ? "open" : "closed"}
        open={creating}
        job={null}
        onClose={() => setCreating(false)}
        onSaved={(job) => void navigate(`/production/jobs/${job.id}`)}
      />
    </div>
  );
};
